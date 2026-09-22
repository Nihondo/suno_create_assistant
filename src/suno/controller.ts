import {
  autoTitle,
  applyMusicalSettingsToPrompt,
  composePrompt,
  DEFAULT_TITLE_FORMAT,
  detectMusicalSettings,
  extractTakeKey,
  hasTakePlaceholder,
  deriveStyleSelection,
  mergeStyleSources,
  optionFieldsMatch,
  readableOptionFields,
  replaceTakePlaceholder,
  splitMasteringPrompt,
} from '../domain/logic';
import {
  type ApplyResult,
  type CustomStyle,
  DEFAULT_LYRICS_TAGS,
  DEFAULT_STYLE_SOURCE,
  type MasteringPrompt,
  type MusicalSettings,
  type MusicalSettingsDetection,
  type MusicalSettingsField,
  type OtherOptionsCapture,
  type OtherOptionsKey,
  type OtherOptionsPreset,
  type SavedStyle,
  type StyleSource,
  type TakeRecord,
} from '../domain/models';
import {
  appendTakeRecord,
  getNextTakeNumber,
  readStorage,
  saveLyricsTags,
  saveTitleFormat,
  setAutoTitleEnabled,
  setCloseDisclosuresOnAdvanced,
  setStyleSource,
  subscribeStorage,
} from '../storage/repository';
import { describeSkipped, SunoAdapter } from './adapter';
import {
  getAllClearFormLabels,
  getAllSavedStyleMutationLabels,
  getAllSavedStyleSaveNewLabels,
  getAllSavedStyleTriggerLabels,
  getUiMessages,
} from '../locales';

export type SettingsSection = 'styles' | 'masterings' | 'presets' | 'titleFormat' | 'display' | 'lyricsTags' | 'backup' | 'takeHistory' | 'about';
export type SettingsAction = 'create-preset' | 'reuse-as-preset';

export interface Feedback {
  message: string;
  kind: 'error' | 'notice';
}

export interface ControllerState {
  styles: SavedStyle[];
  stylesLoading: boolean;
  stylesDirty: boolean;
  styleSource: StyleSource;
  style?: SavedStyle;
  isCustomStyle: boolean;
  mastering?: MasteringPrompt;
  preset?: OtherOptionsPreset;
  /** A preset was applied but the options no longer match it (edited by hand). */
  isCustomPreset: boolean;
  autoTitleEnabled: boolean;
  titleFormat: string;
  closeDisclosuresOnAdvanced: boolean;
  lyricsTags: string[];
  musicalSettings: MusicalSettingsDetection;
  settings?: { section: SettingsSection; action?: SettingsAction };
  styleFeedback?: Feedback;
  presetFeedback?: Feedback;
  settingsFeedback?: Feedback;
}

type Listener = (state: ControllerState) => void;

export class SunoController {
  readonly adapter = new SunoAdapter();
  private state: ControllerState = {
    styles: [],
    stylesLoading: false,
    stylesDirty: true,
    styleSource: DEFAULT_STYLE_SOURCE,
    isCustomStyle: false,
    isCustomPreset: false,
    autoTitleEnabled: false,
    titleFormat: DEFAULT_TITLE_FORMAT,
    closeDisclosuresOnAdvanced: true,
    lyricsTags: [...DEFAULT_LYRICS_TAGS],
    musicalSettings: { conflicts: [] },
  };
  private listeners = new Set<Listener>();
  private baseStyle = '';
  // Style text as of the last time the extension wrote or reconciled it; a
  // difference means the text changed behind our back. undefined = no baseline.
  private lastStyleText?: string;
  private pendingStyleSync?: ReturnType<typeof setTimeout>;
  // Last mastering the user applied; survives the text being edited so it can
  // be re-selected when the text matches again (see deriveStyleSelection).
  private rememberedMastering?: MasteringPrompt;
  // Same idea for presets: the last preset applied, re-selected when the
  // option values match it again after a manual change.
  private rememberedPreset?: OtherOptionsPreset;
  // Fields the last applyPreset() could not apply; never held against it.
  private presetIgnoredKeys = new Set<OtherOptionsKey>();
  private isApplyingOptions = false;
  private programmaticStyleWrite = false;
  private refreshingStyles = false;
  private stylesRefresh?: Promise<void>;
  // The two raw sources state.styles is merged from (see applyStyleSources).
  // sunoStyles is only populated once refreshStyles() has actually opened
  // Suno's native dialog; customStyles/state.styleSource come from storage.
  private sunoStyles: SavedStyle[] = [];
  private customStyles: CustomStyle[] = [];
  private isExecutingCreate = false;
  private unsubscribeStorage?: () => void;

  get closeDisclosuresOnAdvanced(): boolean {
    return this.state.closeDisclosuresOnAdvanced;
  }

  getState(): ControllerState {
    return { ...this.state };
  }

  async initialize(): Promise<void> {
    const stored = await readStorage();
    this.state.autoTitleEnabled = stored.autoTitleEnabled;
    this.state.titleFormat = stored.titleFormat ?? DEFAULT_TITLE_FORMAT;
    this.state.closeDisclosuresOnAdvanced = stored.closeDisclosuresOnAdvanced ?? true;
    this.state.lyricsTags = stored.lyricsTags ?? [...DEFAULT_LYRICS_TAGS];
    this.customStyles = stored.customStyles ?? [];
    this.state.styleSource = stored.styleSource ?? DEFAULT_STYLE_SOURCE;
    this.applyStyleSources();
    this.adapter.setTitleReadOnly(this.state.autoTitleEnabled);
    this.updateAutoTitle();
    this.unsubscribeStorage = subscribeStorage(async () => {
      const updated = await readStorage();
      // Storage can change out from under the currently-selected mastering
      // prompt or preset not just from the user deleting one in this same
      // dialog, but also from a full-replace import (see importBackup in
      // SettingsDialog.tsx) - re-validate both against the fresh data.
      const staleMastering = this.state.mastering && !updated.masteringPrompts.some((item) => item.id === this.state.mastering?.id);
      if (staleMastering) this.state.mastering = undefined;
      if (this.rememberedMastering && !updated.masteringPrompts.some((item) => item.id === this.rememberedMastering?.id)) this.rememberedMastering = undefined;
      const stalePreset = this.state.preset && !updated.optionPresets.some((item) => item.id === this.state.preset?.id);
      if (stalePreset) this.state.preset = undefined;
      // Pick up edits made to a preset in the settings dialog, too.
      const freshPreset = (preset?: OtherOptionsPreset) => preset && updated.optionPresets.find((item) => item.id === preset.id);
      if (this.state.preset) this.state.preset = freshPreset(this.state.preset);
      this.rememberedPreset = freshPreset(this.rememberedPreset);
      const nextCustomStyles = updated.customStyles ?? [];
      const nextStyleSource = updated.styleSource ?? DEFAULT_STYLE_SOURCE;
      // Leaving 'custom' means Suno's list has never been read (or is stale)
      // since the dropdown was disabled from opening it - force a re-read.
      if (nextStyleSource !== this.state.styleSource && nextStyleSource !== 'custom') this.state.stylesDirty = true;
      this.customStyles = nextCustomStyles;
      this.state.styleSource = nextStyleSource;
      this.applyStyleSources();
      // A custom style the user just deleted (or a source switch that drops
      // it from the merged list) must not stay selected. The Style text
      // itself is untouched, so it becomes a hand-edited custom prompt.
      // state.style can only be set via selectStyle() with an entry that was
      // a member of state.styles at the time (StyleControls always passes
      // one of its own MenuItem values), so an empty merged list here is
      // never mistaken for "Suno's list has not loaded yet" - it always
      // means the previously-selected entry genuinely dropped out.
      if (this.state.style && !this.state.styles.some((item) => item.id === this.state.style?.id)) {
        this.state.style = undefined;
        this.state.isCustomStyle = true;
      }
      if (updated.autoTitleEnabled !== this.state.autoTitleEnabled) {
        this.state.autoTitleEnabled = updated.autoTitleEnabled;
        this.adapter.setTitleReadOnly(updated.autoTitleEnabled);
      }
      if (updated.titleFormat && updated.titleFormat !== this.state.titleFormat) {
        this.state.titleFormat = updated.titleFormat;
        this.updateAutoTitle();
      }
      if (updated.closeDisclosuresOnAdvanced !== undefined && updated.closeDisclosuresOnAdvanced !== this.state.closeDisclosuresOnAdvanced) {
        this.state.closeDisclosuresOnAdvanced = updated.closeDisclosuresOnAdvanced;
      }
      if (updated.lyricsTags && JSON.stringify(updated.lyricsTags) !== JSON.stringify(this.state.lyricsTags)) {
        this.state.lyricsTags = updated.lyricsTags;
      }
      this.emit();
    });
    document.addEventListener('click', this.handleDocumentClick, true);
    document.addEventListener('input', this.handleStyleInput, true);
  }

  dispose(): void {
    if (this.pendingStyleSync !== undefined) clearTimeout(this.pendingStyleSync);
    this.unsubscribeStorage?.();
    document.removeEventListener('click', this.handleDocumentClick, true);
    document.removeEventListener('input', this.handleStyleInput, true);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  refreshStyles(): Promise<void> {
    // Opening/closing Suno's native dialog is not re-entrant: a second call
    // while one is running would toggle the dialog shut mid-read.
    if (this.stylesRefresh) return this.stylesRefresh;
    this.stylesRefresh = this.loadStyles().finally(() => {
      this.stylesRefresh = undefined;
    });
    return this.stylesRefresh;
  }

  // Recomputes state.styles from the two raw sources. Called whenever either
  // one changes (Suno list re-read, custom list edited in storage, or the
  // source setting itself changed) so downstream code (deriveStyleSelection,
  // StyleControls, take-history styleName, {{STYLE}}) only ever reads the
  // merged, display-ready list and never needs to know about the split.
  private applyStyleSources(): void {
    this.state.styles = mergeStyleSources(this.customStyles, this.sunoStyles, this.state.styleSource);
  }

  private async loadStyles(): Promise<void> {
    // In 'custom' mode the extension must never open Suno's native dialog.
    if (this.state.styleSource === 'custom') {
      this.applyStyleSources();
      this.emit();
      return;
    }
    if (!this.state.stylesDirty && this.sunoStyles.length) {
      this.applyStyleSources();
      return;
    }
    this.state.stylesLoading = true;
    this.state.styleFeedback = undefined;
    this.emit();
    try {
      // The adapter opens Suno's native saved-styles dialog to read it.  Its
      // own click must not make the cache dirty again.
      this.refreshingStyles = true;
      this.sunoStyles = await this.adapter.extractSavedStyles();
      this.state.stylesDirty = false;
      this.applyStyleSources();
      const ui = getUiMessages();
      if (!this.state.styles.length) this.state.styleFeedback = { kind: 'error', message: ui.feedback.noSavedStyles };
    } catch (error) {
      const ui = getUiMessages();
      this.state.styleFeedback = { kind: 'error', message: error instanceof Error ? error.message : ui.feedback.failedUpdateStyles };
    } finally {
      this.refreshingStyles = false;
      this.state.stylesLoading = false;
      this.emit();
    }
  }

  async setStyleSource(source: StyleSource): Promise<void> {
    const sourceChanged = source !== this.state.styleSource;
    this.state.styleSource = source;
    this.applyStyleSources();
    // Leaving 'custom' means Suno's list has never been read (or is stale)
    // since the dropdown was disabled from opening it - force a re-read.
    if (sourceChanged && source !== 'custom') this.state.stylesDirty = true;
    // A style that dropped out of the merged list (e.g. switching to
    // 'suno' while a custom style was selected) must not stay selected.
    if (this.state.style && !this.state.styles.some((item) => item.id === this.state.style?.id)) {
      this.state.style = undefined;
      this.state.isCustomStyle = true;
    }
    this.emit();
    await setStyleSource(source);
  }

  async selectStyle(style?: SavedStyle): Promise<void> {
    const musicalSettings = this.musicalSettingsForStyle(style);
    // A saved style's explicit musical metadata wins field by field. When it
    // does not specify a field, retain the current setting instead of making
    // a style switch unexpectedly clear the user's key or tempo. Phrases the
    // style already states stay untouched; only the missing fields are added.
    const base = musicalSettings ? applyMusicalSettingsToPrompt(style?.prompt ?? '', musicalSettings) : style?.prompt ?? '';
    const next = composePrompt(base, this.state.mastering?.prompt);
    if (next === undefined) return this.failOverflow();
    this.state.style = style;
    this.state.isCustomStyle = false;
    this.state.styleFeedback = undefined;
    this.baseStyle = base;
    this.writeStyle(next ?? '');
    this.syncMusicalSettingsFromText(next ?? '');
    this.updateAutoTitle();
    this.emit();
  }

  async selectMastering(mastering?: MasteringPrompt): Promise<void> {
    const base = this.baseStyle || (this.state.isCustomStyle ? this.adapter.getStylePrompt() : this.state.style?.prompt ?? '');
    const next = composePrompt(base, mastering?.prompt);
    if (next === undefined) return this.failOverflow();
    this.state.mastering = mastering;
    this.rememberedMastering = mastering;
    this.state.styleFeedback = undefined;
    this.baseStyle = base;
    this.writeStyle(next ?? '');
    this.updateAutoTitle();
    this.emit();
  }

  clearStyleAndMastering(): void {
    this.state.style = undefined;
    this.state.mastering = undefined;
    this.rememberedMastering = undefined;
    this.state.isCustomStyle = false;
    this.state.styleFeedback = undefined;
    this.baseStyle = '';
    this.writeStyle('');
    this.updateAutoTitle();
    this.emit();
  }

  async applyPreset(preset?: OtherOptionsPreset): Promise<ApplyResult | undefined> {
    if (!preset) {
      this.state.preset = undefined;
      this.state.isCustomPreset = false;
      this.rememberedPreset = undefined;
      this.presetIgnoredKeys = new Set();
      this.state.presetFeedback = undefined;
      this.updateAutoTitle();
      this.emit();
      return undefined;
    }
    // Applying now steps through each field with a settle delay (see
    // adapter.ts's applyOtherOptions), so it can take a moment - show
    // immediate feedback rather than leaving the UI looking unresponsive.
    this.state.preset = preset;
    this.state.isCustomPreset = false;
    this.rememberedPreset = preset;
    this.presetIgnoredKeys = new Set();
    this.state.presetFeedback = undefined;
    this.updateAutoTitle();
    this.emit();
    this.isApplyingOptions = true;
    try {
      const result = await this.adapter.applyOtherOptions(preset.fields);
      this.presetIgnoredKeys = new Set(result.skipped);
      const ui = getUiMessages();
      this.state.presetFeedback = result.skipped.length
        ? {
            kind: 'notice',
            message: `${ui.feedback.skippedItemsPrefix}${describeSkipped(result.skipped)}`,
          }
        : undefined;
      this.emit();
      return result;
    } catch (error) {
      const ui = getUiMessages();
      this.state.presetFeedback = { kind: 'error', message: error instanceof Error ? error.message : ui.feedback.failedApplyPreset };
      this.emit();
      return undefined;
    } finally {
      this.isApplyingOptions = false;
    }
  }

  openSettings(section: SettingsSection = 'display', action?: SettingsAction): void {
    this.state.settings = { section, action };
    this.state.settingsFeedback = undefined;
    this.emit();
  }

  openPresetCreation(): void {
    this.openSettings('presets', 'create-preset');
  }

  closeSettings(): void {
    this.state.settings = undefined;
    this.emit();
  }

  async captureOptions(): Promise<OtherOptionsCapture | undefined> {
    this.state.settingsFeedback = undefined;
    try {
      const result = await this.adapter.readOtherOptions();
      const ui = getUiMessages();
      if (!result) {
        this.state.settingsFeedback = { kind: 'error', message: ui.feedback.optionsNotFound };
        this.emit();
        return undefined;
      }
      this.state.settingsFeedback = {
        kind: 'notice',
        message: result.unreadable.length
          ? ui.feedback.capturedUnreadableNotice(result.unreadable.length, describeSkipped(result.unreadable))
          : ui.dialog.savedNotice,
      };
      this.emit();
      return result;
    } catch (error) {
      const ui = getUiMessages();
      this.state.settingsFeedback = { kind: 'error', message: error instanceof Error ? error.message : ui.feedback.failedCaptureOptions };
      this.emit();
      return undefined;
    }
  }

  async setAutoTitle(enabled: boolean): Promise<void> {
    this.state.autoTitleEnabled = enabled;
    this.adapter.setTitleReadOnly(enabled);
    this.updateAutoTitle();
    this.emit();
    await setAutoTitleEnabled(enabled);
  }

  async setCloseDisclosuresOnAdvanced(enabled: boolean): Promise<void> {
    this.state.closeDisclosuresOnAdvanced = enabled;
    this.emit();
    await setCloseDisclosuresOnAdvanced(enabled);
    if (enabled && this.adapter.isAdvancedTab()) {
      this.adapter.closeDisclosures();
    }
  }

  async saveLyricsTags(tags: string[]): Promise<void> {
    this.state.lyricsTags = tags;
    this.emit();
    await saveLyricsTags(tags);
  }

  async insertLyricsTag(tag: string): Promise<boolean> {
    return this.adapter.insertLyricsTag(tag);
  }

  /**
   * Applies a dropdown change immediately: it rewrites the musical phrases the
   * base style already states and keeps the rest in the extension-managed
   * musical-settings line (see applyMusicalSettingsToPrompt). Only the base
   * style is touched: mastering stays the final line, and its own wording is
   * never rewritten.
   */
  applyMusicalSettings(settings: MusicalSettings): void {
    if (this.isExecutingCreate) return;
    // setStylePrompt() opens the Style disclosure when no textarea exists at
    // all; a dropdown change must never do that on the user's behalf. The
    // dropdowns read their value back from the Style text, so a declined write
    // simply leaves them showing what the text says.
    if (!this.adapter.styleTextarea(true)) return;
    const current = this.adapter.getStylePrompt();
    // The textarea is the truth, not the cached baseStyle (which can be stale,
    // and is '' for a legitimately empty base). Only a mastering the text still
    // ends with is put back, so a stale selection is never re-appended.
    const { base, mastering } = splitMasteringPrompt(current, this.state.mastering);
    const nextBase = applyMusicalSettingsToPrompt(base, settings);
    const next = composePrompt(nextBase, mastering?.prompt);
    if (next === undefined) return this.failOverflow();
    if (next === current) {
      this.syncMusicalSettingsFromText(current);
      this.emit();
      return;
    }
    const selection = deriveStyleSelection(next, this.state.styles, { ...this.state, rememberedMastering: this.rememberedMastering });
    this.baseStyle = selection.base;
    this.state.style = selection.style;
    this.state.mastering = selection.mastering;
    this.state.isCustomStyle = selection.isCustomStyle;
    this.state.styleFeedback = undefined;
    this.writeStyle(next);
    this.syncMusicalSettingsFromText(next);
    this.updateAutoTitle();
    this.emit();
  }

  reconcile(): void {
    if (this.isExecutingCreate) return;
    this.adapter.setTitleReadOnly(this.state.autoTitleEnabled);
    this.syncSelectionFromStyleText();
    this.syncPresetFromOptions();
    this.updateAutoTitle();
  }

  resetExtensionSelections(): void {
    this.state.style = undefined;
    this.state.mastering = undefined;
    this.rememberedMastering = undefined;
    this.state.preset = undefined;
    this.state.isCustomPreset = false;
    this.rememberedPreset = undefined;
    this.presetIgnoredKeys = new Set();
    this.state.isCustomStyle = false;
    this.baseStyle = '';
    this.lastStyleText = undefined;
    this.updateAutoTitle();
    this.emit();
  }

  async saveTitleFormat(format: string): Promise<void> {
    const nextFormat = format.trim() || DEFAULT_TITLE_FORMAT;
    this.state.titleFormat = nextFormat;
    this.updateAutoTitle();
    this.emit();
    await saveTitleFormat(nextFormat);
  }

  async executeCreateWithTake(): Promise<boolean> {
    if (this.isExecutingCreate) return false;
    this.isExecutingCreate = true;

    try {
      const button = this.adapter.getCreateButton();
      if (!button) return false;

      const currentTitle = this.adapter.getTitle();
      const usesTakePlaceholder = hasTakePlaceholder(currentTitle);

      let submittedTitle = currentTitle;
      let takeKey: string | undefined;
      let takeNumber: number | undefined;

      if (usesTakePlaceholder) {
        takeKey = extractTakeKey(currentTitle) || 'default';
        takeNumber = await getNextTakeNumber(takeKey);
        submittedTitle = replaceTakePlaceholder(currentTitle, takeNumber);

        // 1. Temporarily write the title with the resolved take number
        this.adapter.setTitle(submittedTitle);

        // 2. Yield for React controlled component input/change event processing
        await new Promise((resolve) => setTimeout(resolve, 60));
      }

      // Capture the parameters actually about to be submitted, right before
      // the Create click - this is the one moment the extension can read
      // them without racing Suno's own reconciliation of the form. A
      // best-effort capture: a failure to read options must never block
      // submission (see the try/catch below).
      const snapshot = await this.captureTakeSnapshot(submittedTitle, takeKey, takeNumber);

      // 3. Trigger Suno's Create button
      const created = this.adapter.triggerCreate();

      if (usesTakePlaceholder) {
        // 4. Yield so Suno's click/submit handler reads the title value
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 5. Revert back to the template with {{TAKE}}
        this.adapter.setTitle(currentTitle);
      }

      if (created && snapshot) {
        // Suno has already received the (synchronous) click dispatched by
        // triggerCreate() above, so awaiting the storage write here does
        // not delay submission - it only makes recording finish before
        // this method resolves. A storage failure must still never
        // surface as a failed create, hence the swallowed catch.
        try {
          await appendTakeRecord(snapshot);
        } catch {
          // Recording must never fail the create flow itself.
        }
      }

      return created;
    } finally {
      this.isExecutingCreate = false;
    }
  }

  async reuseTake(record: TakeRecord): Promise<ApplyResult | undefined> {
    // Only the More Options snapshot is reapplied - Style/Mastering text is
    // deliberately left untouched. Suno's own "プロンプトを再利用" /
    // "Reuse prompt" already covers reusing the style text, and rewriting
    // the Style field here as well would fight it rather than complement it.
    this.isApplyingOptions = true;
    try {
      return await this.adapter.applyOtherOptions(record.options);
    } catch {
      return undefined;
    } finally {
      this.isApplyingOptions = false;
    }
  }

  private async captureTakeSnapshot(
    title: string,
    takeKey: string | undefined,
    takeNumber: number | undefined,
  ): Promise<Omit<TakeRecord, 'id' | 'createdAt'> | undefined> {
    try {
      const capture = await this.adapter.readOtherOptions();
      return {
        title,
        takeKey,
        takeNumber,
        styleName: this.state.isCustomStyle ? undefined : this.state.style?.name,
        stylePrompt: this.adapter.getStylePrompt(),
        masteringId: this.state.mastering?.id,
        masteringName: this.state.mastering?.name,
        presetId: this.state.preset?.id,
        presetName: this.state.preset?.name,
        model: this.adapter.getModelName() || undefined,
        options: capture ? readableOptionFields(capture.snapshot, capture.unreadable) : {},
        unreadable: capture?.unreadable ?? [],
        clipIds: [],
      };
    } catch {
      return undefined;
    }
  }

  private writeStyle(value: string): void {
    this.programmaticStyleWrite = true;
    this.adapter.setStylePrompt(value);
    this.lastStyleText = value;
    queueMicrotask(() => { this.programmaticStyleWrite = false; });
  }

  private updateAutoTitle(): void {
    if (this.isExecutingCreate) return;
    if (!this.state.autoTitleEnabled) return;
    const ui = getUiMessages();
    const styleName = this.state.isCustomStyle ? ui.custom : this.state.style?.name ?? '';
    const audioTitle = this.adapter.getAudioTitle();
    const model = this.adapter.getModelName() || undefined;
    const mastering = this.state.mastering?.name;
    const preset = this.state.isCustomPreset ? ui.custom : this.state.preset?.name;
    this.adapter.setTitle(autoTitle(this.adapter.getDestinationName(), styleName, this.state.titleFormat, {
      audioTitle,
      model,
      mastering,
      preset,
    }));
  }

  private failOverflow(): void {
    const total = [this.baseStyle || this.state.style?.prompt, this.state.mastering?.prompt].filter(Boolean).join('\n').length;
    const ui = getUiMessages();
    this.state.styleFeedback = { kind: 'error', message: ui.feedback.promptLengthLimit(total, 1000) };
    this.emit();
  }

  // Keeps the preset dropdown honest about the live option values: a preset
  // stays selected only while every field it stores still matches, turns into
  // カスタム when one is changed by hand, and comes back if they match again.
  // Uses a passive read (no disclosure toggling) and stays out of the way
  // while this extension is itself applying options.
  private syncPresetFromOptions(): void {
    if (this.isApplyingOptions) return;
    const candidate = this.state.preset ?? this.rememberedPreset;
    if (!candidate) return;
    const capture = this.adapter.peekOtherOptions();
    if (!capture) return;
    const isMatch = optionFieldsMatch(candidate.fields, capture, this.presetIgnoredKeys);
    const nextPreset = isMatch ? candidate : undefined;
    const isCustomPreset = !isMatch;
    if (nextPreset === this.state.preset && isCustomPreset === this.state.isCustomPreset) return;
    this.state.preset = nextPreset;
    this.state.isCustomPreset = isCustomPreset;
    this.updateAutoTitle();
    this.emit();
  }

  private handleStyleInput = (event: Event): void => {
    if (this.programmaticStyleWrite || event.target !== this.adapter.styleTextarea()) return;
    // This listener runs in the capture phase, i.e. *before* Suno's React has
    // handled the same keystroke. Writing the auto title from here makes Suno
    // re-render with the textarea's pre-keystroke state, which reverts the
    // typed character and throws the caret to the end (confirmed live). So
    // defer everything, including the title write, until the event is done.
    if (this.pendingStyleSync !== undefined) return;
    this.pendingStyleSync = setTimeout(() => {
      this.pendingStyleSync = undefined;
      this.syncSelectionFromStyleText(true);
    }, 0);
  };

  // Re-derives the Style/Mastering dropdown state from the Style field's real
  // text, so the dropdowns never claim something the text no longer says.
  // `force` is for input events; reconcile() only acts on a text change.
  private syncSelectionFromStyleText(force = false): void {
    // With the Style disclosure closed the textarea may be unmounted; an
    // empty read there would wrongly look like the user cleared the field.
    if (!this.adapter.styleTextarea(true)) return;
    const text = this.adapter.getStylePrompt();
    const musicChanged = this.syncMusicalSettingsFromText(text);
    if (!force && (this.lastStyleText === undefined || text === this.lastStyleText)) {
      this.lastStyleText = text;
      if (musicChanged) this.emit();
      return;
    }
    this.lastStyleText = text;
    const next = deriveStyleSelection(text, this.state.styles, { ...this.state, rememberedMastering: this.rememberedMastering });
    const isChanged = next.style !== this.state.style
      || next.mastering !== this.state.mastering
      || next.isCustomStyle !== this.state.isCustomStyle;
    if (next.mastering) this.rememberedMastering = next.mastering;
    this.baseStyle = next.base;
    this.state.style = next.style;
    this.state.mastering = next.mastering;
    this.state.isCustomStyle = next.isCustomStyle;
    if (!isChanged && !force && !musicChanged) return;
    this.updateAutoTitle();
    this.emit();
  }

  private syncMusicalSettingsFromText(text: string): boolean {
    const next = detectMusicalSettings(text);
    const current = this.state.musicalSettings;
    if (
      next.key === current.key
      && next.tempo === current.tempo
      && next.timeSignature === current.timeSignature
      && next.conflicts.join(',') === current.conflicts.join(',')
    ) return false;
    this.state.musicalSettings = next;
    return true;
  }

  private currentMusicalSettings(): MusicalSettings | undefined {
    const { key, tempo, timeSignature, conflicts } = this.state.musicalSettings;
    if (conflicts.length || (!key && tempo === undefined && !timeSignature)) return undefined;
    return { key, tempo, timeSignature };
  }

  private musicalSettingsForStyle(style?: SavedStyle): MusicalSettings | undefined {
    const current = this.currentMusicalSettings();
    if (!style) return current;
    const detected = detectMusicalSettings(style.prompt);
    // A field the style states ambiguously is left alone: carrying the current
    // value in would now rewrite the style's own phrases rather than add a line.
    const carry = <T>(field: MusicalSettingsField, value: T | undefined, fallback: T | undefined) =>
      value ?? (detected.conflicts.includes(field) ? undefined : fallback);
    const next: MusicalSettings = {
      key: carry('key', detected.key, current?.key),
      tempo: carry('tempo', detected.tempo, current?.tempo),
      timeSignature: carry('timeSignature', detected.timeSignature, current?.timeSignature),
    };
    return next.key || next.tempo !== undefined || next.timeSignature ? next : undefined;
  }

  private handleDocumentClick = (event: Event): void => {
    if (this.refreshingStyles) return;

    // Every click on the Create button is routed through
    // executeCreateWithTake() now, not only when {{TAKE}} is present, so a
    // take-history record is captured for every submission (see
    // captureTakeSnapshot). isExecutingCreate still guards against
    // recursing into the synthetic click that triggerCreate() dispatches
    // from inside executeCreateWithTake() itself: on that second pass this
    // branch returns immediately *without* calling preventDefault, so the
    // synthetic click's default action (Suno's own handler) actually fires.
    const createCandidate = event.target instanceof Element ? event.target.closest('button, [role="button"]') : undefined;
    if (createCandidate instanceof HTMLElement && this.adapter.isCreateButton(createCandidate)) {
      if (this.isExecutingCreate) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void this.executeCreateWithTake();
      return;
    }

    const target = event.target instanceof Element ? event.target.closest('button') : undefined;
    const label = target?.getAttribute('aria-label') ?? '';
    const buttonText = target?.textContent?.trim() ?? '';
    const triggerLabels = getAllSavedStyleTriggerLabels();
    const saveNewLabels = getAllSavedStyleSaveNewLabels();
    const mutationLabels = getAllSavedStyleMutationLabels();
    if (
      triggerLabels.some((l) => label.includes(l))
      || saveNewLabels.some((l) => label.includes(l) || buttonText.includes(l))
      || mutationLabels.some((l) => label.includes(l) || label === l)
    ) {
      this.state.stylesDirty = true;
      this.emit();
    }
    const clearFormLabels = getAllClearFormLabels();
    if (clearFormLabels.some((l) => label === l || buttonText.includes(l))) {
      setTimeout(() => this.resetExtensionSelections(), 0);
    }
  };

  private emit(): void {
    this.listeners.forEach((listener) => listener({ ...this.state }));
  }
}
