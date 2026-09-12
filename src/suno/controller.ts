import { autoTitle, composePrompt, nextBaseAfterManualEdit } from '../domain/logic';
import type { ApplyResult, MasteringPrompt, OtherOptionsCapture, OtherOptionsPreset, SavedStyle } from '../domain/models';
import { readStorage, setAutoTitleEnabled, subscribeStorage } from '../storage/repository';
import { describeSkipped, SunoAdapter } from './adapter';

export type SettingsSection = 'masterings' | 'presets';

export interface ControllerState {
  styles: SavedStyle[];
  stylesLoading: boolean;
  stylesDirty: boolean;
  style?: SavedStyle;
  isCustomStyle: boolean;
  mastering?: MasteringPrompt;
  preset?: OtherOptionsPreset;
  autoTitleEnabled: boolean;
  settings?: { section: SettingsSection };
  notice?: string;
  error?: string;
}

type Listener = (state: ControllerState) => void;

export class SunoController {
  readonly adapter = new SunoAdapter();
  private state: ControllerState = {
    styles: [], stylesLoading: false, stylesDirty: true, isCustomStyle: false, autoTitleEnabled: false,
  };
  private listeners = new Set<Listener>();
  private baseStyle = '';
  private programmaticStyleWrite = false;
  private refreshingStyles = false;
  private unsubscribeStorage?: () => void;

  async initialize(): Promise<void> {
    this.state.autoTitleEnabled = (await readStorage()).autoTitleEnabled;
    this.adapter.setTitleReadOnly(this.state.autoTitleEnabled);
    this.updateAutoTitle();
    this.unsubscribeStorage = subscribeStorage(async () => {
      const stored = await readStorage();
      const active = this.state.mastering && !stored.masteringPrompts.some((item) => item.id === this.state.mastering?.id);
      if (active) this.state.mastering = undefined;
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
    this.state.error = undefined;
    this.emit();
    try {
      // The adapter opens Suno's native saved-styles dialog to read it.  Its
      // own click must not make the cache dirty again.
      this.refreshingStyles = true;
      const styles = await this.adapter.extractSavedStyles();
      this.state.styles = styles;
      this.state.stylesDirty = false;
      if (!styles.length) this.state.error = '保存したスタイルが見つかりませんでした。';
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '一覧を更新できませんでした。';
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
    this.baseStyle = base;
    this.writeStyle(next ?? '');
    this.updateAutoTitle();
    this.emit();
  }

  clearStyleAndMastering(): void {
    this.state.style = undefined;
    this.state.mastering = undefined;
    this.state.isCustomStyle = false;
    this.baseStyle = '';
    this.writeStyle('');
    this.updateAutoTitle();
    this.emit();
  }

  applyPreset(preset?: OtherOptionsPreset): ApplyResult | undefined {
    if (!preset) {
      this.state.preset = undefined;
      this.emit();
      return undefined;
    }
    const result = this.adapter.applyOtherOptions(preset.fields);
    this.state.preset = preset;
    this.state.notice = result.skipped.length ? `適用できなかった項目: ${describeSkipped(result.skipped)}` : 'プリセットを適用しました。';
    this.emit();
    return result;
  }

  openSettings(section: SettingsSection): void {
    this.state.settings = { section };
    this.state.error = undefined;
    this.state.notice = undefined;
    this.emit();
  }

  closeSettings(): void {
    this.state.settings = undefined;
    this.emit();
  }

  async captureOptions(): Promise<OtherOptionsCapture | undefined> {
    this.state.error = undefined;
    this.state.notice = undefined;
    try {
      const result = await this.adapter.readOtherOptions();
      if (!result) {
        this.state.error = '「その他のオプション」が見つかりませんでした。アドバンストタブが選択されているか確認してください。';
        this.emit();
        return undefined;
      }
      this.state.notice = result.unreadable.length
        ? `一部の項目を取り込めませんでした: ${describeSkipped(result.unreadable)}`
        : '現在の設定を取り込みました。';
      this.emit();
      return result;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '現在の設定を取り込めませんでした。';
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

  reconcile(): void {
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

  private writeStyle(value: string): void {
    this.programmaticStyleWrite = true;
    this.adapter.setStylePrompt(value);
    queueMicrotask(() => { this.programmaticStyleWrite = false; });
  }

  private updateAutoTitle(): void {
    if (!this.state.autoTitleEnabled) return;
    const styleName = this.state.isCustomStyle ? 'カスタム' : this.state.style?.name ?? '';
    this.adapter.setTitle(autoTitle(this.adapter.getDestinationName(), styleName));
  }

  private failOverflow(): void {
    const total = [this.baseStyle || this.state.style?.prompt, this.state.mastering?.prompt].filter(Boolean).join('\n').length;
    this.state.error = `合計${total}文字／上限1000。プロンプトは変更していません。`;
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
