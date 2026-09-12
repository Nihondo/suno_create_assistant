import {
  autoTitle,
  composePrompt,
  DEFAULT_TITLE_FORMAT,
  extractTakeKey,
  hasTakePlaceholder,
  nextBaseAfterManualEdit,
  replaceTakePlaceholder,
} from '../domain/logic';
import type { ApplyResult, MasteringPrompt, OtherOptionsCapture, OtherOptionsPreset, SavedStyle } from '../domain/models';
import {
  getNextTakeNumber,
  readStorage,
  saveTitleFormat,
  setAutoTitleEnabled,
  setCloseDisclosuresOnAdvanced,
  subscribeStorage,
} from '../storage/repository';
import { describeSkipped, SunoAdapter } from './adapter';
import { getUiMessages } from '../locales';

export type SettingsSection = 'masterings' | 'presets' | 'titleFormat' | 'display';
export type SettingsAction = 'create-preset';

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
    this.adapter.setTitleReadOnly(this.state.autoTitleEnabled);
    this.updateAutoTitle();
    this.unsubscribeStorage = subscribeStorage(async () => {
      const updated = await readStorage();
      const active = this.state.mastering && !updated.masteringPrompts.some((item) => item.id === this.state.mastering?.id);
      if (active) this.state.mastering = undefined;
      if (updated.titleFormat && updated.titleFormat !== this.state.titleFormat) {
        this.state.titleFormat = updated.titleFormat;
        this.updateAutoTitle();
      }
      if (updated.closeDisclosuresOnAdvanced !== undefined && updated.closeDisclosuresOnAdvanced !== this.state.closeDisclosuresOnAdvanced) {
        this.state.closeDisclosuresOnAdvanced = updated.closeDisclosuresOnAdvanced;
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
      this.emit();
      return undefined;
    }
    // Applying now steps through each field with a settle delay (see
    // adapter.ts's applyOtherOptions), so it can take a moment - show
    // immediate feedback rather than leaving the UI looking unresponsive.
    this.state.preset = preset;
    this.state.presetFeedback = undefined;
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

  openSettings(section: SettingsSection = 'titleFormat', action?: SettingsAction): void {
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
      if (!hasTakePlaceholder(currentTitle)) {
        return this.adapter.triggerCreate();
      }

      const key = extractTakeKey(currentTitle) || 'default';
      const nextTakeNumber = await getNextTakeNumber(key);
      const titleWithTake = replaceTakePlaceholder(currentTitle, nextTakeNumber);

      // 1. Temporarily write the title with the resolved take number
      this.adapter.setTitle(titleWithTake);

      // 2. Yield for React controlled component input/change event processing
      await new Promise((resolve) => setTimeout(resolve, 60));

      // 3. Trigger Suno's Create button
      const created = this.adapter.triggerCreate();

      // 4. Yield so Suno's click/submit handler reads the title value
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 5. Revert back to the template with {{TAKE}}
      this.adapter.setTitle(currentTitle);

      return created;
    } finally {
      this.isExecutingCreate = false;
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
    this.adapter.setTitle(autoTitle(this.adapter.getDestinationName(), styleName, this.state.titleFormat, audioTitle));
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

    const createCandidate = event.target instanceof Element ? event.target.closest('button, [role="button"]') : undefined;
    if (createCandidate instanceof HTMLElement && this.adapter.isCreateButton(createCandidate)) {
      if (this.isExecutingCreate) return;
      const currentTitle = this.adapter.getTitle();
      if (hasTakePlaceholder(currentTitle)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void this.executeCreateWithTake();
        return;
      }
    }

    const target = event.target instanceof Element ? event.target.closest('button') : undefined;
    const label = target?.getAttribute('aria-label') ?? '';
    const buttonText = target?.textContent?.trim() ?? '';
    if (label.includes('保存したスタイル') || /スタイル.*プロンプト.*保存/.test(label + buttonText) || label.includes('削除:') || label === '名前を変更') {
      this.state.stylesDirty = true;
      this.emit();
    }
    if (label === 'すべてのフォーム入力をクリア' || buttonText.includes('すべてのフォーム入力をクリア')) {
      setTimeout(() => this.resetExtensionSelections(), 0);
    }
  };

  private emit(): void {
    this.listeners.forEach((listener) => listener({ ...this.state }));
  }
}
