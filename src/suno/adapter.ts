import type { ApplyResult, OtherOptionsKey, OtherOptionsSnapshot, SavedStyle, VocalGender } from '../domain/models';
import { emptyOtherOptions, optionLabels } from '../domain/models';
import { savedStyleId } from '../domain/logic';

const STYLE_WRAPPER = '[data-testid="create-form-styles-wrapper"]';
const TITLE_PLACEHOLDER = '曲名(任意)';

function visible<T extends Element>(elements: Iterable<T>): T | undefined {
  return [...elements].find((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  });
}

function text(element: Element | undefined): string {
  return element?.textContent?.trim() ?? '';
}

function nativeSetValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function optionPanel(): HTMLElement | undefined {
  const heading = visible([...document.querySelectorAll('button')].filter((button) => text(button).includes('その他のオプション')));
  if (!heading) return undefined;
  let node: HTMLElement | null = heading.parentElement;
  for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
    if (node.querySelector('input[placeholder="スタイルを除外"]') && node.querySelector('[role="slider"][aria-label="奇抜さ"]')) return node;
  }
  return undefined;
}

function rowFor(panel: HTMLElement, label: string): HTMLElement | undefined {
  const candidates = [...panel.querySelectorAll<HTMLElement>('div')];
  return candidates.find((candidate) => {
    const compact = text(candidate).replaceAll(/\s+/g, '');
    return compact.startsWith(label.replaceAll(/\s+/g, '')) && candidate.querySelector('button');
  });
}

function selected(button: HTMLButtonElement | undefined): boolean {
  return !!button?.className.includes('hxc-btn-variant-standard');
}

function rowButton(panel: HTMLElement, rowLabel: string, buttonText: string): HTMLButtonElement | undefined {
  const row = rowFor(panel, rowLabel);
  return visible([...row?.querySelectorAll<HTMLButtonElement>('button') ?? []].filter((button) => text(button) === buttonText));
}

function clickIfNeeded(button: HTMLButtonElement | undefined, needed: boolean): boolean {
  if (!button || !needed || button.disabled) return !!button && !needed;
  button.click();
  return true;
}

function slider(panel: HTMLElement, label: string): HTMLElement | undefined {
  return visible(panel.querySelectorAll<HTMLElement>(`[role="slider"][aria-label="${label}"]`));
}

function setSlider(element: HTMLElement | undefined, value: number): boolean {
  if (!element || element.getAttribute('aria-disabled') === 'true') return false;
  const current = Number(element.getAttribute('aria-valuenow'));
  if (!Number.isFinite(current)) return false;
  element.focus();
  const key = value > current ? 'ArrowRight' : 'ArrowLeft';
  for (let step = 0; step < Math.abs(value - current); step += 1) {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }
  return true;
}

function titleInput(): HTMLInputElement | undefined {
  const candidates = [...document.querySelectorAll<HTMLInputElement>(`input[placeholder="${TITLE_PLACEHOLDER}"]`)]
    .filter((input) => {
      let parent: HTMLElement | null = input.parentElement;
      for (let depth = 0; parent && depth < 5; depth += 1, parent = parent.parentElement) {
        if (text(parent).includes('保存先…')) return true;
      }
      return false;
    });
  return visible(candidates) ?? candidates.at(-1);
}

export class SunoAdapter {
  styleTextarea(): HTMLTextAreaElement | undefined {
    return visible(document.querySelectorAll<HTMLTextAreaElement>(`${STYLE_WRAPPER} textarea`));
  }

  styleAnchor(): HTMLElement | undefined {
    return this.styleTextarea()?.closest<HTMLElement>(STYLE_WRAPPER) ?? undefined;
  }

  setStylePrompt(value: string): boolean {
    const textarea = this.styleTextarea();
    if (!textarea) return false;
    nativeSetValue(textarea, value);
    return true;
  }

  getStylePrompt(): string {
    return this.styleTextarea()?.value ?? '';
  }

  setTitle(value: string): boolean {
    const input = titleInput();
    if (!input) return false;
    nativeSetValue(input, value);
    return true;
  }

  setTitleReadOnly(readOnly: boolean): void {
    const input = titleInput();
    if (input) input.readOnly = readOnly;
  }

  titleAnchor(): HTMLElement | undefined {
    return titleInput()?.parentElement ?? undefined;
  }

  shortenInspirationLabel(): void {
    const button = visible([...document.querySelectorAll<HTMLButtonElement>('button')].filter((candidate) =>
      text(candidate).replaceAll(/\s+/g, '').includes('インスピレーション')));
    if (!button) return;

    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue?.includes('インスピレーション')) node.nodeValue = node.nodeValue.replaceAll('インスピレーション', 'ひらめき');
    }
    const accessibleName = button.getAttribute('aria-label');
    if (accessibleName?.includes('インスピレーション')) button.setAttribute('aria-label', accessibleName.replaceAll('インスピレーション', 'ひらめき'));
  }

  triggerCreate(): boolean {
    const button = visible([...document.querySelectorAll<HTMLButtonElement>('button')].filter((candidate) => {
      const label = candidate.getAttribute('aria-label') ?? text(candidate);
      return label.trim() === '作成' && !candidate.disabled && candidate.getAttribute('aria-disabled') !== 'true';
    }));
    if (!button) return false;
    button.click();
    return true;
  }

  getDestinationName(): string {
    const input = titleInput();
    if (!input) return '';
    let node: HTMLElement | null = input.parentElement;
    for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
      if (text(node).includes('保存先…')) {
        const candidates = [...node.querySelectorAll<HTMLButtonElement>('button')]
          .map((button) => text(button))
          .filter((value) => value && value !== '保存先…');
        return candidates.at(-1) ?? '';
      }
    }
    return '';
  }

  optionsAnchor(): HTMLElement | undefined {
    return optionPanel();
  }

  readOtherOptions(): OtherOptionsSnapshot | undefined {
    const panel = optionPanel();
    if (!panel) return undefined;
    const snapshot = emptyOtherOptions();
    snapshot.excludedStyles = (visible(panel.querySelectorAll<HTMLInputElement>('input[placeholder="スタイルを除外"]')))?.value ?? '';

    if (selected(rowButton(panel, 'ボーカル性別', '男性'))) snapshot.vocalGender = 'male';
    if (selected(rowButton(panel, 'ボーカル性別', '女性'))) snapshot.vocalGender = 'female';
    snapshot.duration.mode = selected(rowButton(panel, '長さ', 'カスタム')) ? 'custom' : 'auto';
    const durationRow = rowFor(panel, '長さ');
    const seconds = durationRow?.querySelector<HTMLInputElement>('input[type="number"]')?.value;
    if (seconds && Number.isFinite(Number(seconds))) snapshot.duration.seconds = Number(seconds);
    snapshot.maxMode = selected(rowButton(panel, 'Maxモード', 'オン'));
    snapshot.weirdness = Number(slider(panel, '奇抜さ')?.getAttribute('aria-valuenow') ?? snapshot.weirdness);
    snapshot.styleInfluence = Number(slider(panel, 'スタイルの影響')?.getAttribute('aria-valuenow') ?? snapshot.styleInfluence);
    snapshot.variation = Number(slider(panel, 'バリエーション')?.getAttribute('aria-valuenow') ?? snapshot.variation);
    snapshot.personalization.enabled = selected(rowButton(panel, 'パーソナライズ', 'オン'));
    snapshot.personalization.tasteName = text(rowButton(panel, 'パーソナライズ', 'マイ・テイスト')) || undefined;
    return snapshot;
  }

  applyOtherOptions(partial: Partial<OtherOptionsSnapshot>): ApplyResult {
    const panel = optionPanel();
    const applied: OtherOptionsKey[] = [];
    const skipped: OtherOptionsKey[] = [];
    if (!panel) return { applied, skipped: Object.keys(partial) as OtherOptionsKey[] };
    const success = (key: OtherOptionsKey, value: boolean) => (value ? applied.push(key) : skipped.push(key));

    if (partial.excludedStyles !== undefined) {
      const input = visible(panel.querySelectorAll<HTMLInputElement>('input[placeholder="スタイルを除外"]'));
      if (input) nativeSetValue(input, partial.excludedStyles);
      success('excludedStyles', !!input);
    }
    if (partial.vocalGender !== undefined) {
      const target: Record<VocalGender, string | undefined> = { none: undefined, male: '男性', female: '女性' };
      const button = target[partial.vocalGender] ? rowButton(panel, 'ボーカル性別', target[partial.vocalGender]!) : undefined;
      if (partial.vocalGender === 'none') {
        const active = [rowButton(panel, 'ボーカル性別', '男性'), rowButton(panel, 'ボーカル性別', '女性')].find(selected);
        success('vocalGender', !active || clickIfNeeded(active, true));
      } else {
        success('vocalGender', clickIfNeeded(button, !selected(button)));
      }
    }
    if (partial.duration !== undefined) {
      const modeButton = rowButton(panel, '長さ', partial.duration.mode === 'custom' ? 'カスタム' : 'Auto');
      let okay = clickIfNeeded(modeButton, !selected(modeButton));
      const input = rowFor(panel, '長さ')?.querySelector<HTMLInputElement>('input[type="number"]');
      if (partial.duration.mode === 'custom' && partial.duration.seconds !== undefined && input) nativeSetValue(input, String(partial.duration.seconds));
      if (partial.duration.mode === 'custom' && partial.duration.seconds !== undefined && !input) okay = false;
      success('duration', okay);
    }
    if (partial.maxMode !== undefined) {
      const button = rowButton(panel, 'Maxモード', partial.maxMode ? 'オン' : 'オフ');
      success('maxMode', clickIfNeeded(button, !selected(button)));
    }
    if (partial.weirdness !== undefined) success('weirdness', setSlider(slider(panel, '奇抜さ'), partial.weirdness));
    if (partial.styleInfluence !== undefined) success('styleInfluence', setSlider(slider(panel, 'スタイルの影響'), partial.styleInfluence));
    if (partial.variation !== undefined) success('variation', setSlider(slider(panel, 'バリエーション'), partial.variation));
    if (partial.personalization !== undefined) {
      const button = rowButton(panel, 'パーソナライズ', partial.personalization.enabled ? 'オン' : 'オフ');
      success('personalization', clickIfNeeded(button, !selected(button)));
    }
    return { applied, skipped };
  }

  async extractSavedStyles(): Promise<SavedStyle[]> {
    const existing = visible(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-label="保存したスタイル"]'));
    const trigger = visible([...document.querySelectorAll<HTMLButtonElement>('button')].filter((button) =>
      (button.getAttribute('aria-label') ?? '').includes('保存したスタイルプロンプトを見る')));
    let dialog = existing;
    let openedHere = false;
    let suppressor: HTMLStyleElement | undefined;
    if (!dialog && trigger) {
      suppressor = document.createElement('style');
      suppressor.dataset.sunoCreateAssistant = 'style-dialog-suppressor';
      suppressor.textContent = '[role="dialog"][aria-label="保存したスタイル"] { visibility: hidden !important; }';
      document.head.append(suppressor);
      trigger.click();
      openedHere = true;
      for (let attempt = 0; attempt < 20 && !dialog; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        dialog = visible(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-label="保存したスタイル"]'));
      }
    }
    try {
      if (!dialog) throw new Error('保存したスタイル一覧を開けませんでした。');
      const rows = [...dialog.querySelectorAll<HTMLButtonElement>('button[aria-label]')]
        .filter((button) => {
          const label = button.getAttribute('aria-label') ?? '';
          return label && !label.includes('削除') && !label.includes('名前を変更') && label !== 'グリッド表示';
        });
      return rows.map((button, index) => {
        const row = button.parentElement;
        const spans = [...row?.querySelectorAll('span') ?? []].map((span) => text(span));
        const prompt = spans.sort((a, b) => b.length - a.length)[0] ?? '';
        const name = button.getAttribute('aria-label') ?? '';
        return { id: savedStyleId(name, prompt, index), name, prompt };
      }).filter((style) => style.prompt.length > 0);
    } finally {
      suppressor?.remove();
      if (openedHere) trigger?.click();
    }
  }

  observeForm(listener: () => void): () => void {
    const observer = new MutationObserver(listener);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const inputHandler = () => listener();
    document.addEventListener('input', inputHandler, true);
    document.addEventListener('change', inputHandler, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('input', inputHandler, true);
      document.removeEventListener('change', inputHandler, true);
    };
  }
}

export function describeSkipped(keys: OtherOptionsKey[]): string {
  return keys.map((key) => optionLabels[key]).join('、');
}
