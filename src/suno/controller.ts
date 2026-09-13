import {
  autoTitle,
  composePrompt,
  DEFAULT_TITLE_FORMAT,
  extractTakeKey,
  hasTakePlaceholder,
  nextBaseAfterManualEdit,
  readableOptionFields,
  replaceTakePlaceholder,
} from '../domain/logic';
import {
  type ApplyResult,
  DEFAULT_LYRICS_TAGS,
  type MasteringPrompt,
  type OtherOptionsCapture,
  type OtherOptionsPreset,
  type SavedStyle,
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

export type SettingsSection = 'masterings' | 'presets' | 'titleFormat' | 'display' | 'lyricsTags' | 'backup' | 'takeHistory';
export type SettingsAction = 'create-preset' | 'reuse-as-preset';

export interface Feedback {
  message: string;
  kind: 'error' | 'notice';
}

export interface ControllerState {
  styles: SavedStyle[];
  stylesLoading: boolean;
  stylesDirty: boolean;
  style?: SavedStyle;
  isCustomStyle: boolean;
  mastering?: MasteringPrompt;
  preset?: OtherOptionsPreset;
  autoTitleEnabled: boolean;
  titleFormat: string;
  closeDisclosuresOnAdvanced: boolean;
  lyricsTags: string[];
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
    isCustomStyle: false,
    autoTitleEnabled: false,
    titleFormat: DEFAULT_TITLE_FORMAT,
    closeDisclosuresOnAdvanced: true,
    lyricsTags: [...DEFAULT_LYRICS_TAGS],
  };
  private listeners = new Set<Listener>();
  private baseStyle = '';
  private programmaticStyleWrite = false;
  private refreshingStyles = false;
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
      const stalePreset = this.state.preset && !updated.optionPresets.some((item) => item.id === this.state.preset?.id);
      if (stalePreset) this.state.preset = undefined;
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
    this.unsubscribeStorage?.();
    document.removeEventListener('click', this.handleDocumentClick, true);
    document.removeEventListener('input', this.handleStyleInput, true);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async refreshStyles(): Promise<void> {
    if (!this.state.stylesDirty && this.state.styles.length) return;
    this.state.stylesLoading = true;
    this.state.styleFeedback = undefined;
    this.emit();
    try {
      // The adapter opens Suno's native saved-styles dialog to read it.  Its
      // own click must not make the cache dirty again.
      this.refreshingStyles = true;
      const styles = await this.adapter.extractSavedStyles();
      this.state.styles = styles;
      this.state.stylesDirty = false;
      const ui = getUiMessages();
      if (!styles.length) this.state.styleFeedback = { kind: 'error', message: ui.feedback.noSavedStyles };
    } catch (error) {
      const ui = getUiMessages();
      this.state.styleFeedback = { kind: 'error', message: error instanceof Error ? error.message : ui.feedback.failedUpdateStyles };
    } finally {
      this.refreshingStyles = false;
      this.state.stylesLoading = false;
      this.emit();
    }
  }

  async selectStyle(style?: SavedStyle): Promise<void> {
    const next = composePrompt(style?.prompt, this.state.mastering?.prompt);
    if (next === undefined) return this.failOverflow();
    this.state.style = style;
    this.state.isCustomStyle = false;
    this.state.styleFeedback = undefined;
    this.baseStyle = style?.prompt ?? '';
    this.writeStyle(next ?? '');
    this.updateAutoTitle();
    this.emit();
  }

  async selectMastering(mastering?: MasteringPrompt): Promise<void> {
    const base = this.baseStyle || (this.state.isCustomStyle ? this.adapter.getStylePrompt() : this.state.style?.prompt ?? '');
    const next = composePrompt(base, mastering?.prompt);
    if (next === undefined) return this.failOverflow();
    this.state.mastering = mastering;
    this.state.styleFeedback = undefined;
    this.baseStyle = base;
    this.writeStyle(next ?? '');
    this.updateAutoTitle();
    this.emit();
  }

  clearStyleAndMastering(): void {
    this.state.style = undefined;
    this.state.mastering = undefined;
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
      this.state.presetFeedback = undefined;
      this.updateAutoTitle();
      this.emit();
      return undefined;
    }
    // Applying now steps through each field with a settle delay (see
    // adapter.ts's applyOtherOptions), so it can take a moment - show
    // immediate feedback rather than leaving the UI looking unresponsive.
    this.state.preset = preset;
    this.state.presetFeedback = undefined;
    this.updateAutoTitle();
    this.emit();
    try {
      const result = await this.adapter.applyOtherOptions(preset.fields);
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

  reconcile(): void {
    if (this.isExecutingCreate) return;
    this.adapter.setTitleReadOnly(this.state.autoTitleEnabled);
    this.updateAutoTitle();
  }

  resetExtensionSelections(): void {
    this.state.style = undefined;
    this.state.mastering = undefined;
    this.state.preset = undefined;
    this.state.isCustomStyle = false;
    this.baseStyle = '';
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
    try {
      return await this.adapter.applyOtherOptions(record.options);
    } catch {
      return undefined;
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
    const preset = this.state.preset?.name;
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

  private handleStyleInput = (event: Event): void => {
    if (this.programmaticStyleWrite || event.target !== this.adapter.styleTextarea()) return;
    const value = this.adapter.getStylePrompt();
    this.baseStyle = nextBaseAfterManualEdit(value, this.state.mastering);
    this.state.style = undefined;
    this.state.isCustomStyle = true;
    this.updateAutoTitle();
    this.emit();
  };

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
