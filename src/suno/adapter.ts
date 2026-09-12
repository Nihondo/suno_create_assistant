import type { ApplyResult, OtherOptionsCapture, OtherOptionsKey, OtherOptionsSnapshot, SavedStyle, VocalGender } from '../domain/models';
import { emptyOtherOptions, optionLabels } from '../domain/models';
import { savedStyleId } from '../domain/logic';
import type { Placement } from '../content/mount';

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

function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLButtonElement).disabled === true || element.getAttribute('aria-disabled') === 'true';
}

function optionHeading(): HTMLElement | undefined {
  // The disclosure trigger is a `<div role="button" tabindex="0">` on the
  // live site, not a `<button>` - confirmed from production DOM. Match
  // both so a future markup change to a real button keeps working too.
  return [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
    .filter((element) => text(element).includes('その他のオプション') && visible([element]) === element)
    .at(0);
}

// Ordered from most to least specific so a single relabeled control does not
// fail the whole lookup: prefer the ancestor that has both known sliders,
// fall back to any slider, then to any known settings row.
const PANEL_MATCHERS: Array<(node: HTMLElement) => boolean> = [
  (node) => !!node.querySelector('[role="slider"][aria-label="奇抜さ"]') && !!node.querySelector('[role="slider"][aria-label="スタイルの影響"]'),
  (node) => !!node.querySelector('[role="slider"]'),
  (node) => !!rowFor(node, 'ボーカル性別') || !!rowFor(node, '長さ') || !!rowFor(node, 'Maxモード'),
];

function optionPanelAndHeading(): { panel: HTMLElement; heading: HTMLElement } | undefined {
  const heading = optionHeading();
  if (!heading) return undefined;
  for (const matches of PANEL_MATCHERS) {
    let node: HTMLElement | null = heading.parentElement;
    for (let depth = 0; node && depth < 20; depth += 1, node = node.parentElement) {
      if (matches(node)) return { panel: node, heading };
    }
  }
}

function optionPanel(): HTMLElement | undefined {
  return optionPanelAndHeading()?.panel;
}

function optionControlsVisible(panel: HTMLElement | undefined): boolean {
  // Mirrors PANEL_MATCHERS' specificity levels, but requires the matched
  // controls to be visible (not merely present in a closed disclosure) so
  // callers can tell whether the accordion is actually open.
  if (!panel) return false;
  if (slider(panel, '奇抜さ') && slider(panel, 'スタイルの影響')) return true;
  if (visible(panel.querySelectorAll<HTMLElement>('[role="slider"]'))) return true;
  return ['ボーカル性別', '長さ', 'Maxモード'].some((label) => {
    const row = rowFor(panel, label);
    return !!row && !!visible(row.querySelectorAll<HTMLButtonElement>('button'));
  });
}

function excludedStylesInput(panel: HTMLElement): HTMLInputElement | undefined {
  const named = visible(panel.querySelectorAll<HTMLInputElement>('input[placeholder="スタイルを除外"]'));
  if (named) return named;
  return visible([...panel.querySelectorAll<HTMLInputElement>('input')].filter((input) => !input.type || input.type === 'text'));
}

function savedStylesDialog(includeHidden = false): HTMLElement | undefined {
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
    .filter((dialog) => (dialog.getAttribute('aria-label') ?? '').includes('保存したスタイル'));
  return includeHidden ? dialogs[0] : visible(dialogs);
}

function savedStylePrompt(row: HTMLElement, name: string): string {
  // A saved-style row has nested spans for its name, prompt, and save date.
  // Reading textContent from a parent span merges those fields, so use only
  // leaf spans and remove the separately exposed accessible name and date.
  const candidates = [...row.querySelectorAll<HTMLElement>('span')]
    .filter((span) => span.children.length === 0)
    .map((span) => text(span))
    .filter((value) => value.length > 0 && value !== name && !isSavedStyleDate(value));
  return candidates.sort((a, b) => b.length - a.length)[0] ?? '';
}

function isSavedStyleDate(value: string): boolean {
  const normalized = value.trim();
  return /^(?:保存(?:日|済み|された日)?|作成(?:日)?|更新(?:日)?|saved|created|updated)\s*[:：]?/i.test(normalized)
    || /^(?:\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日|(?:今日|昨日)|\d+\s*(?:分|時間|日|weeks?|days?|hours?|minutes?)\s*(?:前|ago)?)$/i.test(normalized);
}

function rowFor(panel: HTMLElement, label: string): HTMLElement | undefined {
  const candidates = [...panel.querySelectorAll<HTMLElement>('div')];
  return candidates.find((candidate) => {
    const compact = text(candidate).replaceAll(/\s+/g, '');
    return compact.startsWith(label.replaceAll(/\s+/g, '')) && candidate.querySelector('button');
  });
}

function selected(button: HTMLButtonElement | undefined): boolean {
  if (!button) return false;
  // Confirmed from production DOM: the toggle buttons carry
  // data-selected="true"/"false" directly. Prefer that stable attribute
  // over the button's class list, whose "selected" variant name has
  // already changed at least once (hxc-btn-variant-standard is stale).
  const dataSelected = button.getAttribute('data-selected');
  if (dataSelected !== null) return dataSelected === 'true';
  return button.className.includes('hxc-btn-variant-standard');
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

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

// DO NOT replace this with the slider's double-click-to-edit "NN%" readout
// (dblclick it, type into the revealed <input type="text">, commit with
// Enter). That path was tried and reverted: confirmed on the live site, it
// only sets a transient DOM attribute, not Suno's real underlying state.
// A single slider changed this way and left alone stays looking correct
// indefinitely (nothing re-renders it) - but the moment anything else
// triggers a re-render of the panel (in practice: applyOtherOptions()
// moving on to the next field), Suno reconciles the display back to its
// real, never-actually-updated value. Measured on the live site: the
// slider read the correct value for ~120ms after commit, then silently
// reverted once the next field's own change ran. Stepping arrow keys one
// at a time is the only mechanism confirmed to update Suno's real state,
// so it is slower but it is the only one that stays correct.
//
// Confirmed on the live site: firing several ArrowRight keydowns
// back-to-back, with no yield in between, only moves the slider by ONE
// step in total - not one step per keydown. Waiting a frame between each
// keydown (so Suno's own state update/re-render actually completes) makes
// each one register individually. Re-querying the panel/slider fresh on
// every step, rather than reusing the reference from before the loop, also
// guards against Suno replacing the slider's DOM node between steps.
const SLIDER_STEP_GUARD = 200;

async function setSlider(label: string, value: number): Promise<boolean> {
  let moved = false;
  for (let guard = 0; guard < SLIDER_STEP_GUARD; guard += 1) {
    const panel = optionPanel();
    const element = panel && slider(panel, label);
    if (!element || element.getAttribute('aria-disabled') === 'true') return moved;
    const current = Number(element.getAttribute('aria-valuenow'));
    if (!Number.isFinite(current)) return moved;
    if (current === value) return true;
    element.focus();
    element.dispatchEvent(new KeyboardEvent('keydown', { key: value > current ? 'ArrowRight' : 'ArrowLeft', bubbles: true }));
    moved = true;
    await settle();
  }
  return moved;
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

function optionHeaderResetButton(): HTMLElement | undefined {
  // Confirmed a real <button aria-label="すべてリセット"> on the live site;
  // also matching [role="button"] costs nothing and guards against Suno
  // moving it to the same custom-control pattern as the heading.
  const heading = optionHeading();
  if (!heading) return undefined;
  for (let node: HTMLElement | null = heading.parentElement; node; node = node.parentElement) {
    const reset = visible([...node.querySelectorAll<HTMLElement>('button, [role="button"]')].filter((element) =>
      (element.getAttribute('aria-label') ?? text(element)).trim() === 'すべてリセット'));
    if (reset) return reset;
  }
}

function containsOptionBody(node: HTMLElement): boolean {
  return !!node.querySelector('[role="slider"]');
}

function leavesOptionCard(node: HTMLElement): boolean {
  return !!node.querySelector(`input[placeholder="${TITLE_PLACEHOLDER}"], ${STYLE_WRAPPER}`);
}

function optionHeaderRow(): HTMLElement | undefined {
  // Suno replaces the accordion body (and can replace its outer sibling)
  // during reconciliation, so the insertion point must be the persistent
  // header row itself: heading plus, when present, its "すべてリセット"
  // action. Walk from the heading up to the widest ancestor that still
  // contains only the header row - stop one step before the body appears
  // (a slider row) or before we exit the option card entirely.
  const heading = optionHeading();
  if (!heading) return undefined;
  const resetButton = optionHeaderResetButton();
  let candidate: HTMLElement = heading;
  let node: HTMLElement | null = heading.parentElement;
  for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
    if (containsOptionBody(node) || leavesOptionCard(node)) break;
    candidate = node;
    if (resetButton && node.contains(resetButton)) break;
  }
  return candidate;
}

function styleHeading(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
    .filter((element) => {
      if (visible([element]) !== element) return false;
      const aria = element.getAttribute('aria-label') ?? '';
      const raw = text(element);
      if (raw.includes('その他のオプション') || aria.includes('その他のオプション')) return false;
      if (raw.includes('保存したスタイル') || aria.includes('保存したスタイル')) return false;
      if (raw.includes('スタイルを除外') || aria.includes('スタイルを除外')) return false;

      const firstLine = (raw.split('\n')[0] ?? '').trim().replaceAll(/\s+/g, '');
      const ariaClean = aria.trim().replaceAll(/\s+/g, '');

      return firstLine === 'スタイル' || firstLine === 'Style' || firstLine === 'Styles'
        || ariaClean === 'スタイル' || ariaClean === 'Style' || ariaClean === 'Styles'
        || (firstLine.startsWith('スタイル') && !firstLine.includes('除外') && !firstLine.includes('保存'));
    })
    .at(0);
}

function containsStyleBody(node: HTMLElement): boolean {
  return !!node.querySelector(`${STYLE_WRAPPER}, textarea, #saved-styles`);
}

function leavesStyleCard(node: HTMLElement): boolean {
  return !!node.querySelector(`input[placeholder="${TITLE_PLACEHOLDER}"], #options, [role="slider"]`);
}

function styleHeaderRow(): HTMLElement | undefined {
  const heading = styleHeading();
  if (!heading) return undefined;
  let candidate: HTMLElement = heading;
  let node: HTMLElement | null = heading.parentElement;
  for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
    if (containsStyleBody(node) || leavesStyleCard(node)) break;
    candidate = node;
  }
  return candidate;
}

export class SunoAdapter {
  styleTextarea(includeHidden = false): HTMLTextAreaElement | undefined {
    const list = [...document.querySelectorAll<HTMLTextAreaElement>(`${STYLE_WRAPPER} textarea`)];
    if (list.length > 0) return includeHidden ? list[0] : (visible(list) ?? (includeHidden ? list[0] : undefined));
    const textareas = [...document.querySelectorAll<HTMLTextAreaElement>('textarea')].filter((el) => {
      return !el.closest('#lyrics-wrapper') && !el.getAttribute('placeholder')?.includes('歌詞');
    });
    return includeHidden ? textareas[0] : (visible(textareas) ?? (includeHidden ? textareas[0] : undefined));
  }

  styleAnchor(): HTMLElement | undefined {
    return styleHeaderRow() ?? this.styleTextarea(true)?.closest<HTMLElement>(STYLE_WRAPPER) ?? undefined;
  }

  setStylePrompt(value: string): boolean {
    let textarea = this.styleTextarea() ?? this.styleTextarea(true);
    if (!textarea) {
      const heading = styleHeading();
      if (heading && !isDisabled(heading)) {
        heading.click();
        textarea = this.styleTextarea(true);
      }
    }
    if (!textarea) return false;
    nativeSetValue(textarea, value);
    return true;
  }

  getStylePrompt(): string {
    return (this.styleTextarea() ?? this.styleTextarea(true))?.value ?? '';
  }

  getTitle(): string {
    return titleInput()?.value ?? '';
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

  titleControlAnchor(): HTMLElement | undefined {
    // Confirmed on the live site: titleAnchor() is the rounded title card's
    // icon + input flex row. Let it wrap so the injected control can remain
    // inside that same card on a separate line; mounting at its parent puts
    // it below the separate destination card instead.
    const anchor = this.titleAnchor();
    if (anchor) anchor.style.flexWrap = 'wrap';
    return anchor;
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

  isCreateButton(candidate: HTMLElement): boolean {
    if (candidate.closest('nav, aside, [role="navigation"]')) return false;
    if (candidate.closest('suno-create-assistant')) return false;
    if (candidate instanceof HTMLButtonElement && candidate.disabled) return false;
    if (candidate.getAttribute('aria-disabled') === 'true') return false;

    const ariaLabel = candidate.getAttribute('aria-label')?.trim() ?? '';
    const textContent = text(candidate);

    const patterns = [
      /^(?:作成|Create)(?:\s*[(（]?\s*\d+.*|[!！])?$/i,
      /^(?:曲|トラック)を作成/i,
      /^Create\s+(?:Song|Track|Music)/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(ariaLabel) || pattern.test(textContent)) return true;
    }

    const startsWithCreate = ariaLabel.startsWith('作成') || textContent.startsWith('作成')
      || ariaLabel.toLowerCase().startsWith('create') || textContent.toLowerCase().startsWith('create');
    const excluded = /^(?:作成(?:済み|日|中|者)?|プリセットを作成|Created|Create Preset)/i;

    return startsWithCreate && !excluded.test(ariaLabel) && !excluded.test(textContent);
  }

  getCreateButton(): HTMLElement | undefined {
    const candidates = [...document.querySelectorAll<HTMLElement>('main button, main [role="button"], button, [role="button"]')];
    return visible(candidates.filter((candidate) => this.isCreateButton(candidate)));
  }

  triggerCreate(): boolean {
    const button = this.getCreateButton();
    if (!button) return false;

    if (typeof PointerEvent !== 'undefined') {
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    }
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.click();
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
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
    // The accordion body and even its outer sibling can be replaced by Suno.
    // The header row (heading plus its reset action) is persistent, so
    // insert immediately after it; this works while the disclosure is
    // closed as well.
    return optionHeaderRow();
  }

  async readOtherOptions(): Promise<OtherOptionsCapture | undefined> {
    let panel = optionPanel();
    const heading = optionHeading();
    const shouldOpen = !optionControlsVisible(panel);
    if (shouldOpen && heading && !isDisabled(heading)) {
      heading.click();
      for (let attempt = 0; attempt < 20 && !optionControlsVisible(panel); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        panel = optionPanel();
      }
    }
    if (!panel || !optionControlsVisible(panel)) return undefined;

    const snapshot = emptyOtherOptions();
    const unreadable: OtherOptionsKey[] = [];
    const readField = (key: OtherOptionsKey, found: boolean, apply: () => void) => {
      if (found) apply();
      else unreadable.push(key);
    };

    const excludedInput = excludedStylesInput(panel);
    readField('excludedStyles', !!excludedInput, () => { snapshot.excludedStyles = excludedInput!.value; });

    const vocalRow = rowFor(panel, 'ボーカル性別');
    readField('vocalGender', !!vocalRow, () => {
      if (selected(rowButton(panel, 'ボーカル性別', '男性'))) snapshot.vocalGender = 'male';
      if (selected(rowButton(panel, 'ボーカル性別', '女性'))) snapshot.vocalGender = 'female';
    });

    const durationRow = rowFor(panel, '長さ');
    readField('duration', !!durationRow, () => {
      snapshot.duration.mode = selected(rowButton(panel, '長さ', 'カスタム')) ? 'custom' : 'auto';
      const seconds = durationRow!.querySelector<HTMLInputElement>('input[type="number"]')?.value;
      if (seconds && Number.isFinite(Number(seconds))) snapshot.duration.seconds = Number(seconds);
    });

    const maxModeRow = rowFor(panel, 'Maxモード');
    readField('maxMode', !!maxModeRow, () => { snapshot.maxMode = selected(rowButton(panel, 'Maxモード', 'オン')); });

    const weirdnessSlider = slider(panel, '奇抜さ');
    readField('weirdness', !!weirdnessSlider, () => { snapshot.weirdness = Number(weirdnessSlider!.getAttribute('aria-valuenow') ?? snapshot.weirdness); });

    const styleInfluenceSlider = slider(panel, 'スタイルの影響');
    readField('styleInfluence', !!styleInfluenceSlider, () => { snapshot.styleInfluence = Number(styleInfluenceSlider!.getAttribute('aria-valuenow') ?? snapshot.styleInfluence); });

    const variationSlider = slider(panel, 'バリエーション');
    readField('variation', !!variationSlider, () => { snapshot.variation = Number(variationSlider!.getAttribute('aria-valuenow') ?? snapshot.variation); });

    const personalizationRow = rowFor(panel, 'パーソナライズ');
    readField('personalization', !!personalizationRow, () => {
      snapshot.personalization.enabled = selected(rowButton(panel, 'パーソナライズ', 'オン'));
      snapshot.personalization.tasteName = text(rowButton(panel, 'パーソナライズ', 'マイ・テイスト')) || undefined;
    });

    if (shouldOpen) heading?.click();
    return { snapshot, unreadable };
  }

  async applyOtherOptions(partial: Partial<OtherOptionsSnapshot>): Promise<ApplyResult> {
    const applied: OtherOptionsKey[] = [];
    const skipped: OtherOptionsKey[] = [];
    if (!optionPanel()) return { applied, skipped: Object.keys(partial) as OtherOptionsKey[] };
    const success = (key: OtherOptionsKey, value: boolean) => (value ? applied.push(key) : skipped.push(key));
    // Confirmed on the live site: Suno can replace the whole options
    // subtree in reaction to a single click (documented reconciliation
    // behavior). Reusing one `panel`/row/button reference across every
    // field meant everything after the first field that actually changed
    // something was clicking/reading stale, detached elements - a click
    // that silently did nothing. Each field below re-fetches the panel
    // right before touching it, and settle() gives Suno's re-render a
    // frame to finish before the next field looks the DOM up again.

    if (partial.excludedStyles !== undefined) {
      const panel = optionPanel();
      const input = panel && excludedStylesInput(panel);
      if (input) nativeSetValue(input, partial.excludedStyles);
      success('excludedStyles', !!input);
      await settle();
    }
    if (partial.vocalGender !== undefined) {
      const panel = optionPanel();
      if (!panel) {
        skipped.push('vocalGender');
      } else {
        const target: Record<VocalGender, string | undefined> = { none: undefined, male: '男性', female: '女性' };
        const button = target[partial.vocalGender] ? rowButton(panel, 'ボーカル性別', target[partial.vocalGender]!) : undefined;
        if (partial.vocalGender === 'none') {
          const active = [rowButton(panel, 'ボーカル性別', '男性'), rowButton(panel, 'ボーカル性別', '女性')].find(selected);
          success('vocalGender', !active || clickIfNeeded(active, true));
        } else {
          success('vocalGender', clickIfNeeded(button, !selected(button)));
        }
      }
      await settle();
    }
    if (partial.duration !== undefined) {
      const panel = optionPanel();
      if (!panel) {
        skipped.push('duration');
      } else {
        const modeButton = rowButton(panel, '長さ', partial.duration.mode === 'custom' ? 'カスタム' : 'Auto');
        let okay = clickIfNeeded(modeButton, !selected(modeButton));
        if (partial.duration.mode === 'custom' && partial.duration.seconds !== undefined) {
          await settle();
          // The seconds input can only appear once the mode switch above
          // has actually rendered, so look it up fresh again afterward.
          const freshPanel = optionPanel() ?? panel;
          const input = rowFor(freshPanel, '長さ')?.querySelector<HTMLInputElement>('input[type="number"]');
          if (input) nativeSetValue(input, String(partial.duration.seconds));
          else okay = false;
        }
        success('duration', okay);
      }
      await settle();
    }
    if (partial.maxMode !== undefined) {
      const panel = optionPanel();
      if (!panel) {
        skipped.push('maxMode');
      } else {
        const button = rowButton(panel, 'Maxモード', partial.maxMode ? 'オン' : 'オフ');
        success('maxMode', clickIfNeeded(button, !selected(button)));
      }
      await settle();
    }
    if (partial.weirdness !== undefined) {
      success('weirdness', await setSlider('奇抜さ', partial.weirdness));
      await settle();
    }
    if (partial.styleInfluence !== undefined) {
      success('styleInfluence', await setSlider('スタイルの影響', partial.styleInfluence));
      await settle();
    }
    if (partial.variation !== undefined) {
      success('variation', await setSlider('バリエーション', partial.variation));
      await settle();
    }
    if (partial.personalization !== undefined) {
      const panel = optionPanel();
      if (!panel) {
        skipped.push('personalization');
      } else {
        const button = rowButton(panel, 'パーソナライズ', partial.personalization.enabled ? 'オン' : 'オフ');
        success('personalization', clickIfNeeded(button, !selected(button)));
      }
    }
    return { applied, skipped };
  }

  async extractSavedStyles(): Promise<SavedStyle[]> {
    const existing = savedStylesDialog();
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
        // The extension deliberately hides this native dialog while reading
        // it, so this lookup must not require visual visibility.
        dialog = savedStylesDialog(true);
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
        const name = button.getAttribute('aria-label') ?? '';
        const prompt = row ? savedStylePrompt(row, name) : '';
        return { id: savedStyleId(name, prompt, index), name, prompt };
      }).filter((style) => style.prompt.length > 0);
    } finally {
      suppressor?.remove();
      if (openedHere) trigger?.click();
    }
  }

  observeForm(listener: () => void): () => void {
    // This also fires for the extension's own hosts being moved or
    // removed-and-reinserted (see mount.ts): a mutation record cannot tell
    // "we just moved it" apart from "Suno deleted it", and the latter is
    // exactly what callers need to react to. That is safe to leave
    // unfiltered because reattach()/mount() are idempotent - once a host is
    // back in its correct place, re-running them touches nothing, so the
    // resulting self-triggered pass terminates after one cycle instead of
    // looping.
    const observer = new MutationObserver(listener);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      // Suno can expand/collapse this accordion by changing only attributes;
      // watching them makes the preset control appear after that transition.
      attributes: true,
      attributeFilter: ['aria-expanded', 'aria-hidden', 'data-state', 'hidden'],
    });
    const inputHandler = () => listener();
    document.addEventListener('input', inputHandler, true);
    document.addEventListener('change', inputHandler, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('input', inputHandler, true);
      document.removeEventListener('change', inputHandler, true);
    };
  }

  sidebarPlacement(): Placement | undefined {
    const hooks = document.querySelector<HTMLElement>('a[href="/hooks"]');
    if (hooks) return { anchor: hooks, position: 'afterend' };

    const profile = document.querySelector<HTMLElement>('.group\\/profile-row, [data-testid="profile-menu-button"]')?.closest<HTMLElement>('.hxc-btn-split-root')
      ?? document.querySelector<HTMLElement>('a[href^="/@"]')?.closest<HTMLElement>('.hxc-btn-split-root');
    if (profile) return { anchor: profile, position: 'beforebegin' };

    const navContainer = document.querySelector<HTMLElement>('a[href="/create"], a[href="/discover"], [data-testid="navbar-library-tab"]')?.parentElement;
    if (navContainer) return { anchor: navContainer, position: 'beforeend' };

    return undefined;
  }
}

export function describeSkipped(keys: OtherOptionsKey[]): string {
  return keys.map((key) => optionLabels[key]).join('、');
}
