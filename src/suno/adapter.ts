import type { ApplyResult, OtherOptionsCapture, OtherOptionsKey, OtherOptionsSnapshot, SavedStyle } from '../domain/models';
import { emptyOtherOptions } from '../domain/models';
import { calculateTagInsertion, normalizedInsertTag, savedStyleId } from '../domain/logic';
import type { Placement } from '../content/mount';
import {
  getAllClipRowLikeLabels,
  getAllClipRowShareLabels,
  getAllDestinationKeywords,
  getAllExcludedStylesPlaceholders,
  getAllHostLocales,
  getAllOptionResetLabels,
  getAllSavedStyleDialogLabels,
  getAllSavedStyleTriggerLabels,
  getAllTitlePlaceholders,
  getHostLocale,
  getRowLabels,
  getSliderLabels,
  getUiMessages,
  isSavedStyleDateString,
  type SunoHostSliders,
  type SupportedLanguage,
} from '../locales';

const STYLE_WRAPPER = '[data-testid="create-form-styles-wrapper"]';

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
  //
  // Each clip row in the workspace clip list has its own "その他のオプション"
  // / "More options" context-menu trigger button with the exact same
  // aria-label as the disclosure heading we want here. It must be excluded
  // - not just skipped by taking .at(0) - because DOM order between the
  // create form and the clip list is an implementation detail, not a
  // contract; relying on document order alone would silently break the
  // moment Suno reorders the page.
  return [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
    .filter((element) => {
      if (element.closest('[data-testid="clip-row"]')) return false;
      if (visible([element]) !== element) return false;
      const raw = text(element);
      const aria = element.getAttribute('aria-label') ?? '';
      return raw.includes('その他のオプション') || aria.includes('その他のオプション')
        || /(?:more|other)\s*options/i.test(raw) || /(?:more|other)\s*options/i.test(aria);
    })
    .at(0);
}

// Ordered from most to least specific so a single relabeled control does not
// fail the whole lookup: prefer the ancestor that has both known sliders,
// fall back to any slider, then to any known settings row.
const PANEL_MATCHERS: Array<(node: HTMLElement) => boolean> = [
  (node) => {
    const weirdnessLabels = getSliderLabels('weirdness');
    const styleLabels = getSliderLabels('styleInfluence');
    const hasWeirdness = weirdnessLabels.some((l) => node.querySelector(`[role="slider"][aria-label="${l}"]`));
    const hasStyle = styleLabels.some((l) => node.querySelector(`[role="slider"][aria-label="${l}"]`));
    return hasWeirdness && hasStyle;
  },
  (node) => !!node.querySelector('[role="slider"]'),
  (node) => !!rowFor(node, 'vocalGender') || !!rowFor(node, 'duration') || !!rowFor(node, 'maxMode'),
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
  if (slider(panel, 'weirdness') && slider(panel, 'styleInfluence')) return true;
  if (visible(panel.querySelectorAll<HTMLElement>('[role="slider"]'))) return true;
  return (['vocalGender', 'duration', 'maxMode'] as const).some((key) => {
    const row = rowFor(panel, key);
    return !!row && !!visible(row.querySelectorAll<HTMLButtonElement>('button'));
  });
}

function excludedStylesInput(panel: HTMLElement): HTMLInputElement | undefined {
  for (const ph of getAllExcludedStylesPlaceholders()) {
    const named = visible(panel.querySelectorAll<HTMLInputElement>(`input[placeholder="${ph}"]`));
    if (named) return named;
  }
  return visible([...panel.querySelectorAll<HTMLInputElement>('input')].filter((input) => !input.type || input.type === 'text'));
}

function savedStylesDialog(includeHidden = false): HTMLElement | undefined {
  const dialogLabels = getAllSavedStyleDialogLabels();
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
    .filter((dialog) => {
      const aria = dialog.getAttribute('aria-label') ?? '';
      return dialogLabels.some((label) => aria.includes(label) || new RegExp(label, 'i').test(aria));
    });
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
  return isSavedStyleDateString(value);
}

function rowFor(panel: HTMLElement, target: 'vocalGender' | 'duration' | 'maxMode' | 'personalization' | string): HTMLElement | undefined {
  const candidates = [...panel.querySelectorAll<HTMLElement>('div')];
  const labels = (target === 'vocalGender' || target === 'duration' || target === 'maxMode' || target === 'personalization')
    ? getRowLabels(target)
    : [target];

  return candidates.find((candidate) => {
    const compact = text(candidate).replaceAll(/\s+/g, '');
    return labels.some((label) => compact.startsWith(label.replaceAll(/\s+/g, ''))) && candidate.querySelector('button');
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

function rowButton(panel: HTMLElement, rowTarget: 'vocalGender' | 'duration' | 'maxMode' | 'personalization' | string, buttonText: string): HTMLButtonElement | undefined {
  const row = rowFor(panel, rowTarget);
  return visible([...row?.querySelectorAll<HTMLButtonElement>('button') ?? []].filter((button) => text(button) === buttonText));
}

function clickIfNeeded(button: HTMLButtonElement | undefined, needed: boolean): boolean {
  if (!button || !needed || button.disabled) return !!button && !needed;
  button.click();
  return true;
}

function slider(panel: HTMLElement, target: keyof SunoHostSliders | string): HTMLElement | undefined {
  const labels = (target === 'weirdness' || target === 'styleInfluence' || target === 'variation' || target === 'audioInfluence')
    ? getSliderLabels(target)
    : [target];

  for (const label of labels) {
    const match = visible(panel.querySelectorAll<HTMLElement>(`[role="slider"][aria-label="${label}"]`));
    if (match) return match;
  }
  return undefined;
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

// An EARLIER attempt at the double-click-to-edit "NN%" readout (dblclick it,
// type into the revealed <input type="text">, but commit only by moving
// focus/reading the attribute back - never a real Enter keypress) was tried
// and reverted: confirmed on the live site, that path only set a transient
// DOM attribute, not Suno's real underlying state, and silently reverted the
// moment anything else re-rendered the panel. That is why arrow-key
// stepping became the only mechanism used, despite being slow.
//
// Retried later, deliberately committing with a real Enter keypress this
// time (see trySliderFastCommit below): confirmed manually on the live site
// (double-click 奇抜さ's "NN%" readout, type a new value, press Enter, then
// click an unrelated toggle and wait ~1-2s) that the committed value
// *does* survive a subsequent unrelated field's mutation. The missing
// Enter commit in the original attempt is believed to be exactly what made
// the difference. trySliderFastCommit() is tried first; setSlider() falls
// back to the arrow-key loop below on any failure of that path (element not
// found/disabled, dblclick did not reveal an <input>, or the committed
// aria-valuenow does not match afterward), so a live-site surprise here
// degrades to the slower but previously-exhaustively-verified method rather
// than silently applying a wrong value.
//
// Confirmed on the live site: firing several ArrowRight keydowns
// back-to-back, with no yield in between, only moves the slider by ONE
// step in total - not one step per keydown. Waiting a frame between each
// keydown (so Suno's own state update/re-render actually completes) makes
// each one register individually. Re-querying the panel/slider fresh on
// every step, rather than reusing the reference from before the loop, also
// guards against Suno replacing the slider's DOM node between steps.
const SLIDER_STEP_GUARD = 200;

// Confirmed on the live site (docs/showmore.txt and manual inspection): the
// "NN%" readout - and, once revealed, the editable <input> - are always the
// slider's own nextElementSibling, not reachable by any stable class name
// (Suno's CSS classes are hashed per build). Re-fetching the panel/slider
// fresh before and after the dblclick, exactly like the arrow-key path
// below, guards the same way against Suno replacing the subtree mid-flight.
async function trySliderFastCommit(panel: HTMLElement, target: keyof SunoHostSliders | string, value: number): Promise<boolean> {
  const element = slider(panel, target);
  if (!element || element.getAttribute('aria-disabled') === 'true') return false;
  const readout = element.nextElementSibling;
  if (!(readout instanceof HTMLElement)) return false;

  readout.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  await settle();

  const freshPanel = optionPanel();
  const freshElement = freshPanel && slider(freshPanel, target);
  const revealed = freshElement?.nextElementSibling;
  if (!(revealed instanceof HTMLInputElement)) return false;

  nativeSetValue(revealed, String(value));
  const eventInit: KeyboardEventInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  revealed.dispatchEvent(new KeyboardEvent('keydown', eventInit));
  revealed.dispatchEvent(new KeyboardEvent('keypress', eventInit));
  revealed.dispatchEvent(new KeyboardEvent('keyup', eventInit));
  await settle();

  const committedPanel = optionPanel();
  const committedElement = committedPanel && slider(committedPanel, target);
  return Number(committedElement?.getAttribute('aria-valuenow')) === value;
}

async function setSlider(target: keyof SunoHostSliders | string, value: number): Promise<boolean> {
  const startPanel = optionPanel();
  const startElement = startPanel && slider(startPanel, target);
  if (!startElement || startElement.getAttribute('aria-disabled') === 'true') return false;
  if (Number(startElement.getAttribute('aria-valuenow')) === value) return true;

  if (startPanel && await trySliderFastCommit(startPanel, target, value)) return true;

  let moved = false;
  for (let guard = 0; guard < SLIDER_STEP_GUARD; guard += 1) {
    const panel = optionPanel();
    const element = panel && slider(panel, target);
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
  const placeholders = getAllTitlePlaceholders();
  const destKeywords = getAllDestinationKeywords();

  const candidates = [...document.querySelectorAll<HTMLInputElement>('input')]
    .filter((input) => {
      const ph = input.getAttribute('placeholder') ?? '';
      if (!placeholders.some((p) => ph.includes(p))) return false;
      let parent: HTMLElement | null = input.parentElement;
      for (let depth = 0; depth < 5 && parent; depth += 1, parent = parent.parentElement) {
        const parentText = text(parent);
        if (destKeywords.some((kw) => parentText.includes(kw))) return true;
      }
      return false;
    });
  return visible(candidates) ?? candidates.at(-1);
}


function audioPlayButton(): HTMLElement | undefined {
  const candidates = [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
    .filter((el) => {
      if (el.closest('suno-create-assistant, nav, aside, [role="navigation"]')) return false;
      const aria = (el.getAttribute('aria-label') ?? '').trim();
      const matchLabel = /^(?:オーディオを(?:再生|一時停止)|(?:Play|Pause)\s*audio)$/i.test(aria)
        || ((aria.includes('再生') || /play/i.test(aria) || aria.includes('一時停止') || /pause/i.test(aria))
          && (aria.includes('オーディオ') || /audio/i.test(aria)));
      if (matchLabel) return true;

      const img = el.querySelector('img[alt]');
      if (img) {
        const alt = (img.getAttribute('alt') ?? '').trim();
        if (/のカバーアート$/i.test(alt) || /cover\s*art$/i.test(alt)) return true;
      }
      return false;
    });
  return visible(candidates) ?? candidates[0];
}

function audioTitle(): string {
  const btn = audioPlayButton();
  if (!btn) return '';

  const sibling = btn.nextElementSibling as HTMLElement | null;
  if (sibling) {
    const children = [...sibling.children] as HTMLElement[];
    for (const child of children) {
      const childText = text(child);
      if (childText && !/^\d{1,2}:\d{2}/.test(childText)) {
        return childText;
      }
    }
    const candidate = [...sibling.querySelectorAll<HTMLElement>('div, span')]
      .find((el) => el.children.length === 0 && text(el).length > 0 && !/^\d{1,2}:\d{2}/.test(text(el)));
    if (candidate) {
      return text(candidate);
    }
  }

  const img = btn.querySelector('img[alt]') ?? btn.parentElement?.querySelector('img[alt]');
  if (img) {
    const alt = (img.getAttribute('alt') ?? '').trim();
    const cleaned = alt.replace(/\s*のカバーアート$/i, '').replace(/\s*cover\s*art$/i, '').trim();
    if (cleaned) return cleaned;
  }

  return '';
}

function optionHeaderResetButton(): HTMLElement | undefined {
  // Confirmed a real <button aria-label="すべてリセット"> on the live site;
  // also matching [role="button"] costs nothing and guards against Suno
  // moving it to the same custom-control pattern as the heading.
  const heading = optionHeading();
  if (!heading) return undefined;
  const resetLabels = getAllOptionResetLabels();
  for (let node: HTMLElement | null = heading.parentElement; node; node = node.parentElement) {
    const reset = visible([...node.querySelectorAll<HTMLElement>('button, [role="button"]')].filter((element) => {
      const label = (element.getAttribute('aria-label') ?? text(element)).trim();
      return resetLabels.some((rl) => label === rl || label.includes(rl));
    }));
    if (reset) return reset;
  }
}

function containsOptionBody(node: HTMLElement): boolean {
  return !!node.querySelector('[role="slider"]');
}

function leavesOptionCard(node: HTMLElement): boolean {
  const placeholders = getAllTitlePlaceholders();
  const selector = placeholders.map((ph) => `input[placeholder="${ph}"]`).join(', ') + `, ${STYLE_WRAPPER}`;
  return !!node.querySelector(selector);
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
  const optionRegex = /(?:その他のオプション|More\s*Options|Other\s*Options)/i;
  const savedStylesRegex = /(?:保存したスタイル|Saved\s*Styles?)/i;
  const excludeStylesRegex = /(?:スタイルを除外|Exclude\s*styles?)/i;

  return [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
    .filter((element) => {
      if (visible([element]) !== element) return false;
      const aria = element.getAttribute('aria-label') ?? '';
      const raw = text(element);
      if (optionRegex.test(raw) || optionRegex.test(aria)) return false;
      if (savedStylesRegex.test(raw) || savedStylesRegex.test(aria)) return false;
      if (excludeStylesRegex.test(raw) || excludeStylesRegex.test(aria)) return false;

      const innerTexts = [...element.querySelectorAll<HTMLElement>('div, span')]
        .filter((el) => el.children.length === 0)
        .map((el) => text(el));

      const firstLine = (raw.split('\n')[0] ?? '').trim().replaceAll(/\s+/g, '');
      const ariaClean = aria.trim().replaceAll(/\s+/g, '');

      return firstLine === 'スタイル' || /^Styles?$/i.test(firstLine)
        || ariaClean === 'スタイル' || /^Styles?$/i.test(ariaClean)
        || innerTexts.some((t) => t === 'スタイル' || /^Styles?$/i.test(t))
        || (firstLine.startsWith('スタイル') && !firstLine.includes('除外') && !firstLine.includes('保存'))
        || (firstLine.startsWith('Style') && !/Exclude|Saved/i.test(firstLine));
    })
    .at(0);
}

function containsStyleBody(node: HTMLElement): boolean {
  return !!node.querySelector(`${STYLE_WRAPPER}, textarea, #saved-styles`);
}

function leavesStyleCard(node: HTMLElement): boolean {
  const placeholders = getAllTitlePlaceholders();
  const selector = placeholders.map((ph) => `input[placeholder="${ph}"]`).join(', ') + ', #options, [role="slider"]';
  return !!node.querySelector(selector);
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

function lyricsHeading(): HTMLElement | undefined {
  const optionRegex = /(?:その他のオプション|More\s*Options|Other\s*Options)/i;
  const savedStylesRegex = /(?:保存したスタイル|Saved\s*Styles?)/i;
  const styleRegex = /(?:スタイル|Styles?)/i;

  return [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
    .filter((element) => {
      if (visible([element]) !== element) return false;
      if (element.closest('suno-create-assistant, [role="dialog"], [role="listbox"]')) return false;
      const aria = element.getAttribute('aria-label') ?? '';
      const raw = text(element);
      if (optionRegex.test(raw) || optionRegex.test(aria)) return false;
      if (savedStylesRegex.test(raw) || savedStylesRegex.test(aria)) return false;
      if (styleRegex.test(raw) || styleRegex.test(aria)) return false;

      const innerTexts = [...element.querySelectorAll<HTMLElement>('div, span')]
        .filter((el) => el.children.length === 0)
        .map((el) => text(el));

      const firstLine = (raw.split('\n')[0] ?? '').trim().replaceAll(/\s+/g, '');
      const ariaClean = aria.trim().replaceAll(/\s+/g, '');

      return firstLine === '歌詞' || /^Lyrics?$/i.test(firstLine)
        || ariaClean === '歌詞' || /^Lyrics?$/i.test(ariaClean)
        || innerTexts.some((t) => t === '歌詞' || /^Lyrics?$/i.test(t))
        || (firstLine.startsWith('歌詞') && !firstLine.includes('除外') && !firstLine.includes('保存') && !firstLine.includes('作成'))
        || (firstLine.startsWith('Lyric') && !/Exclude|Saved|Create/i.test(firstLine));
    })
    .at(0);
}

function containsLyricsBody(node: HTMLElement): boolean {
  return !!node.querySelector('[data-lexical-editor="true"], .lyrics-editor-content, #lyrics-wrapper, textarea');
}

function leavesLyricsCard(node: HTMLElement): boolean {
  const placeholders = getAllTitlePlaceholders();
  const selector = placeholders.map((ph) => `input[placeholder="${ph}"]`).join(', ') + `, ${STYLE_WRAPPER}, #options, [role="slider"]`;
  return !!node.querySelector(selector);
}

function lyricsHeaderRow(): HTMLElement | undefined {
  const heading = lyricsHeading();
  if (!heading) return undefined;
  let candidate: HTMLElement = heading;
  let node: HTMLElement | null = heading.parentElement;
  for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
    if (containsLyricsBody(node) || leavesLyricsCard(node)) break;
    candidate = node;
  }
  return candidate;
}

function isDisclosureExpanded(heading: HTMLElement, fallback?: () => boolean): boolean {
  const aria = heading.getAttribute('aria-expanded');
  if (aria !== null) return aria === 'true';
  const dataState = heading.getAttribute('data-state');
  if (dataState !== null) return dataState === 'open';
  const child = heading.querySelector('[aria-expanded]');
  if (child) return child.getAttribute('aria-expanded') === 'true';
  const parent = heading.closest('[aria-expanded]');
  if (parent) return parent.getAttribute('aria-expanded') === 'true';
  return fallback ? fallback() : false;
}

function isLyricsExpanded(heading: HTMLElement): boolean {
  return isDisclosureExpanded(heading, () => {
    const editors = [...document.querySelectorAll<HTMLElement>('[data-lexical-editor="true"], .lyrics-editor-content')];
    if (visible(editors) !== undefined) return true;
    const textareas = [...document.querySelectorAll<HTMLTextAreaElement>('textarea')].filter((el) => {
      return el.closest('#lyrics-wrapper') || el.getAttribute('placeholder')?.includes('歌詞') || /lyrics/i.test(el.getAttribute('placeholder') ?? '');
    });
    return visible(textareas) !== undefined;
  });
}

function isStyleExpanded(heading: HTMLElement): boolean {
  return isDisclosureExpanded(heading, () => {
    const list = [...document.querySelectorAll<HTMLTextAreaElement>(`${STYLE_WRAPPER} textarea`)];
    return visible(list) !== undefined;
  });
}

function isOptionExpanded(heading: HTMLElement): boolean {
  return isDisclosureExpanded(heading, () => optionControlsVisible(optionPanel()));
}

function findDeepestLastChild(node: Node): Node {
  let curr = node;
  while (curr.lastChild) {
    curr = curr.lastChild;
  }
  return curr;
}

function dispatchEnter(target: HTMLElement): boolean {
  let success = false;
  try {
    success = document.execCommand('insertParagraph');
  } catch {
    success = false;
  }
  if (!success) {
    const eventInit: KeyboardEventInit = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    target.dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'insertParagraph',
      bubbles: true,
      cancelable: true,
    }));
    target.dispatchEvent(new KeyboardEvent('keyup', eventInit));
  }
  return success;
}

// Confirmed on the live site (docs/showmore.txt): the model selector is a
// `<button aria-expanded="…">` whose accessible text is just the model
// name, e.g. "v6". Nothing else with `aria-expanded` on the create form
// starts with "v" followed by a digit, so this narrow pattern is enough
// without needing a more specific (and more fragile) selector.
function modelSelectorButton(): HTMLElement | undefined {
  const candidates = [...document.querySelectorAll<HTMLElement>('button[aria-expanded], [role="button"][aria-expanded]')]
    .filter((el) => !el.closest('suno-create-assistant, [data-testid="clip-row"]'));
  return visible(candidates.filter((el) => /^v\d/i.test(text(el).trim())));
}

export interface ClipRowInfo {
  row: HTMLElement;
  title: string;
  songId: string;
  status: string;
}

// Each row is `<div data-testid="clip-row" role="group" aria-label="<title>"
// data-clip-status="...">` containing exactly one `<a href="/song/<uuid>">`
// - confirmed in docs/alldom_ja.txt, alldom_en.txt, and docs/showmore.txt.
// This is the only DOM-visible way to resolve a clip's title to its song id
// without touching a private API.
function findClipRows(): ClipRowInfo[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="clip-row"]')]
    .map((row) => {
      const title = row.getAttribute('aria-label') ?? '';
      const href = row.querySelector<HTMLAnchorElement>('a[href^="/song/"]')?.getAttribute('href') ?? '';
      const songId = href.match(/\/song\/([^/?#]+)/)?.[1] ?? '';
      const status = row.getAttribute('data-clip-status') ?? '';
      return { row, title, songId, status };
    })
    .filter((info): info is ClipRowInfo => !!info.songId);
}

// Anchor for mounting a per-clip control (e.g. "reuse parameters") next to
// Suno's own row actions, rather than inside its context menu - the menu is
// Base UI portal-rendered and was not observed in any DOM dump, so it is
// unconfirmed and brittle; the visible action-button row is not.
function clipRowActionAnchor(row: HTMLElement): HTMLElement | undefined {
  const likeLabels = getAllClipRowLikeLabels();
  const likeButton = [...row.querySelectorAll<HTMLElement>('button, [role="button"]')]
    .find((btn) => likeLabels.some((l) => (btn.getAttribute('aria-label') ?? '').includes(l)));
  return likeButton?.parentElement ?? undefined;
}

// Find the direct child element of the action container that represents the
// "share" (copy link) action. Placing the reuse parameters button immediately
// after this child (afterend) ensures:
// 1. It sits between the share button and the publish button (if present)
// 2. It stays a direct child of the action-button flex container, preserving
//    proper button gap, height, and vertical center alignment
// 3. It never gets trapped inside Suno's nested publish wrapper div, which
//    would break alignment and hide the button when the clip is unpublished
function findClipRowShareItem(row: HTMLElement): HTMLElement | undefined {
  const container = clipRowActionAnchor(row);
  if (!container) return undefined;

  const shareLabels = getAllClipRowShareLabels();
  const buttons = [...container.querySelectorAll<HTMLElement>('button, [role="button"]')];
  const shareButton = buttons.find((btn) => {
    const label = (btn.getAttribute('aria-label') ?? btn.getAttribute('title') ?? '').toLowerCase();
    return shareLabels.some((l) => label.includes(l.toLowerCase()));
  });

  if (shareButton) {
    let item: HTMLElement = shareButton;
    while (item.parentElement && item.parentElement !== container) {
      item = item.parentElement;
    }
    return item;
  }

  // Fallback: 4th child of the action container (like, dislike, pin, share)
  const children = [...container.children] as HTMLElement[];
  if (children.length >= 4) {
    return children[3];
  }

  return undefined;
}

function clipRowActionPlacement(row: HTMLElement): Placement | undefined {
  const shareItem = findClipRowShareItem(row);
  if (shareItem) {
    return { anchor: shareItem, position: 'afterend' };
  }

  const anchor = clipRowActionAnchor(row);
  if (anchor) {
    return { anchor, position: 'beforeend' };
  }

  return undefined;
}

export class SunoAdapter {
  private isInsertingLyricsTag = false;

  lyricsHeading(): HTMLElement | undefined {
    return lyricsHeading();
  }

  lyricsAnchor(): HTMLElement | undefined {
    return lyricsHeaderRow();
  }

  lyricsEditor(includeHidden = false): HTMLElement | undefined {
    const lexicalEditors = [...document.querySelectorAll<HTMLElement>('[data-lexical-editor="true"], .lyrics-editor-content')];
    const lexicalMatch = includeHidden ? lexicalEditors[0] : visible(lexicalEditors);
    if (lexicalMatch) return lexicalMatch;

    const textareas = [...document.querySelectorAll<HTMLTextAreaElement>('textarea')].filter((el) => {
      return el.closest('#lyrics-wrapper, #lyrics') || el.getAttribute('placeholder')?.includes('歌詞') || /lyrics/i.test(el.getAttribute('placeholder') ?? '');
    });
    if (textareas.length > 0) {
      return includeHidden ? textareas[0] : (visible(textareas) ?? (includeHidden ? textareas[0] : undefined));
    }

    const contentEditables = [...document.querySelectorAll<HTMLElement>('[contenteditable="true"]')].filter((el) => {
      const aria = el.getAttribute('aria-label') ?? '';
      return /歌詞|lyrics/i.test(aria);
    });
    return includeHidden ? contentEditables[0] : visible(contentEditables);
  }

  async insertLyricsTag(rawTag: string): Promise<boolean> {
    if (this.isInsertingLyricsTag) return false;
    this.isInsertingLyricsTag = true;
    try {
      const heading = lyricsHeading();
      if (heading && !isDisabled(heading) && !isLyricsExpanded(heading)) {
        heading.click();
      }

      let editor = this.lyricsEditor();
      if (!editor) {
        const startTime = Date.now();
        while (!editor && Date.now() - startTime < 1200) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        editor = this.lyricsEditor();
        if (!editor && Date.now() - startTime > 400) {
          editor = this.lyricsEditor(true);
        }
      }

      if (!editor) return false;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    if (editor instanceof HTMLTextAreaElement) {
      const start = editor.selectionStart ?? editor.value.length;
      const end = editor.selectionEnd ?? editor.value.length;
      const { newText, newCursor } = calculateTagInsertion(editor.value, start, end, rawTag);
      nativeSetValue(editor, newText);
      editor.setSelectionRange(newCursor, newCursor);
      editor.focus();
      return true;
    }

    const selection = window.getSelection();
    let isInside = false;
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      isInside = editor.contains(range.commonAncestorContainer);
    }

    if (!isInside && selection) {
      editor.focus();
      const range = document.createRange();
      const lastNode = findDeepestLastChild(editor);
      if (lastNode.nodeType === Node.TEXT_NODE) {
        const len = (lastNode.textContent ?? '').length;
        range.setStart(lastNode, len);
        range.setEnd(lastNode, len);
      } else {
        range.selectNodeContents(lastNode);
        range.collapse(false);
      }
      selection.removeAllRanges();
      selection.addRange(range);

      // Lexical listens to asynchronous `selectionchange` events to establish
      // its internal EditorState selection. If we dispatch paste synchronously without
      // yielding, Lexical's $getSelection() is still null on first interaction and rejects the insertion.
      await new Promise((resolve) => setTimeout(resolve, 40));
    } else {
      editor.focus();
    }

    const tag = normalizedInsertTag(rawTag);
    const text = (editor.innerText ?? editor.textContent ?? '').trim();
    let atEmptyLine = text.length === 0;

    if (!atEmptyLine && selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.startContainer;
      const block = (container instanceof HTMLElement ? container : container.parentElement)?.closest('p, div, li');
      if (block) {
        const blockText = (block.textContent ?? '').trim();
        if (blockText.length === 0) {
          atEmptyLine = true;
        }
      }
    }

    const prefix = atEmptyLine ? '' : '\n';
    const insertion = `${prefix}${tag}\n`;

    // 1. Preferred strategy for Lexical: dispatch synthetic paste event
    let pasteSuccess = false;
    try {
      let dt: { getData: (type: string) => string; setData?: (type: string, val: string) => void; types?: readonly string[] } | null = null;
      if (typeof DataTransfer !== 'undefined') {
        const nativeDt = new DataTransfer();
        nativeDt.setData('text/plain', insertion);
        dt = nativeDt;
      } else {
        dt = {
          getData: (type: string) => (type === 'text/plain' ? insertion : ''),
          types: ['text/plain'],
        };
      }

      const pasteEvent = typeof ClipboardEvent !== 'undefined'
        ? new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt as unknown as DataTransfer,
          })
        : new Event('paste', {
            bubbles: true,
            cancelable: true,
          });

      if ((pasteEvent as unknown as { clipboardData?: unknown }).clipboardData !== dt) {
        Object.defineProperty(pasteEvent, 'clipboardData', {
          value: dt,
          configurable: true,
        });
      }
      editor.dispatchEvent(pasteEvent);
      pasteSuccess = pasteEvent.defaultPrevented;
    } catch {
      pasteSuccess = false;
    }

    if (pasteSuccess) {
      return true;
    }

    // 2. Fallback for contenteditable: insertParagraph + insertText + insertParagraph
    try {
      if (prefix.length > 0) {
        dispatchEnter(editor);
      }
      const textInserted = document.execCommand('insertText', false, tag);
      if (textInserted) {
        dispatchEnter(editor);
        return true;
      }
    } catch {
      // ignore and fallback to DOM
    }

    // 3. Fallback: Direct DOM manipulation
    const p = document.createElement('p');
    p.className = 'lyrics-paragraph';
    p.textContent = tag;
    editor.appendChild(p);
    const nextP = document.createElement('p');
    nextP.className = 'lyrics-paragraph';
    nextP.appendChild(document.createElement('br'));
    editor.appendChild(nextP);
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertParagraph' }));

    return true;
    } finally {
      this.isInsertingLyricsTag = false;
    }
  }

  styleHeading(): HTMLElement | undefined {
    return styleHeading();
  }

  optionHeading(): HTMLElement | undefined {
    return optionHeading();
  }

  isDisclosureExpanded(heading: HTMLElement, fallback?: () => boolean): boolean {
    return isDisclosureExpanded(heading, fallback);
  }

  isLyricsExpanded(heading: HTMLElement): boolean {
    return isLyricsExpanded(heading);
  }

  isStyleExpanded(heading: HTMLElement): boolean {
    return isStyleExpanded(heading);
  }

  isOptionExpanded(heading: HTMLElement): boolean {
    return isOptionExpanded(heading);
  }

  isAdvancedTab(): boolean {
    const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
    if (tabs.length === 0) {
      return !!this.styleAnchor() || !!this.optionsAnchor();
    }
    return tabs.some((tab) => {
      const label = tab.textContent ?? '';
      return /アドバンスト|アドバンスド|advanced/i.test(label) && tab.getAttribute('aria-selected') !== 'false';
    });
  }

  closeDisclosures(): { closedLyrics: boolean; closedStyle: boolean; closedOptions: boolean } {
    const lyrics = lyricsHeading();
    const style = styleHeading();
    const options = optionHeading();

    let closedLyrics = false;
    let closedStyle = false;
    let closedOptions = false;

    if (lyrics && !isDisabled(lyrics) && isLyricsExpanded(lyrics)) {
      lyrics.click();
      closedLyrics = true;
    }
    if (style && !isDisabled(style) && isStyleExpanded(style)) {
      style.click();
      closedStyle = true;
    }
    if (options && !isDisabled(options) && isOptionExpanded(options)) {
      options.click();
      closedOptions = true;
    }

    return { closedLyrics, closedStyle, closedOptions };
  }
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
    //
    // titleAnchor() itself carries a fixed `height` (56px at the time this
    // was checked, via getComputedStyle on the live site) and every one of
    // its ancestors up to and including a ResizeObserver-driven
    // `overflow: hidden` wrapper mirrors that same px value rather than
    // sizing to content. flex-wrap: wrap alone therefore only makes the
    // second line overflow the card and get clipped/overlap the next card
    // below - it does not make the card taller. Confirmed directly (via a
    // live-site console session against suno.com/create): forcing this
    // element's `height` to `auto` while pinning `min-height` to its
    // original (pre-wrap) height makes every ancestor, including that
    // overflow: hidden wrapper, track the real content height - 56px with
    // one line, and taller once the second line is present - while leaving
    // the single-line case unchanged. `min-height` alone (height left at
    // its default) does nothing: the element's own CSS class sets `height`
    // directly, which wins over min-height for a card no taller than that.
    // The `dataset` flag ensures the original height is captured only once,
    // before this control's own host is mounted into this anchor - reading
    // offsetHeight on a later call (e.g. after Suno recreates this element
    // during a re-render) would otherwise capture the *wrapped* height.
    const anchor = this.titleAnchor();
    if (anchor && !anchor.dataset.sunoAssistantTitleWrap) {
      anchor.dataset.sunoAssistantTitleWrap = 'true';
      anchor.style.minHeight = `${anchor.offsetHeight}px`;
      anchor.style.height = 'auto';
      anchor.style.flexWrap = 'wrap';
    }
    return anchor;
  }

  shortenInspirationLabel(): void {
    const button = visible([...document.querySelectorAll<HTMLButtonElement>('button')].filter((candidate) =>
      text(candidate).replaceAll(/\s+/g, '').includes('インスピレーション')));
    if (!button) return;

    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue?.includes('インスピレーション')) node.nodeValue = node.nodeValue.replaceAll('インスピレーション', 'Inspo');
    }
    const accessibleName = button.getAttribute('aria-label');
    if (accessibleName?.includes('インスピレーション')) button.setAttribute('aria-label', accessibleName.replaceAll('インスピレーション', 'Inspo'));
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
    const destKeywords = getAllDestinationKeywords();
    let node: HTMLElement | null = input.parentElement;
    for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
      const parentText = text(node);
      if (destKeywords.some((kw) => parentText.includes(kw))) {
        const candidates = [...node.querySelectorAll<HTMLButtonElement>('button')]
          .map((button) => text(button))
          .filter((value) => value && !destKeywords.some((kw) => value.includes(kw)));
        return candidates.at(-1) ?? '';
      }
    }
    return '';
  }

  getAudioTitle(): string {
    return audioTitle();
  }

  getModelName(): string {
    return text(modelSelectorButton());
  }

  clipRows(): ClipRowInfo[] {
    return findClipRows();
  }

  clipRowActionAnchor(row: HTMLElement): HTMLElement | undefined {
    return clipRowActionAnchor(row);
  }

  clipRowActionPlacement(row: HTMLElement): Placement | undefined {
    return clipRowActionPlacement(row);
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

    const vocalRow = rowFor(panel, 'vocalGender');
    readField('vocalGender', !!vocalRow, () => {
      const maleButtons = getAllHostLocales().map((l) => l.rows.vocalGender.male);
      const femaleButtons = getAllHostLocales().map((l) => l.rows.vocalGender.female);
      const isMale = maleButtons.some((bText) => selected(rowButton(panel, 'vocalGender', bText)));
      const isFemale = femaleButtons.some((bText) => selected(rowButton(panel, 'vocalGender', bText)));
      if (isMale) snapshot.vocalGender = 'male';
      if (isFemale) snapshot.vocalGender = 'female';
    });

    const durationRow = rowFor(panel, 'duration');
    readField('duration', !!durationRow, () => {
      const customButtons = getAllHostLocales().map((l) => l.rows.duration.custom);
      const isCustom = customButtons.some((bText) => selected(rowButton(panel, 'duration', bText)));
      snapshot.duration.mode = isCustom ? 'custom' : 'auto';
      const seconds = durationRow!.querySelector<HTMLInputElement>('input[type="number"]')?.value;
      if (seconds && Number.isFinite(Number(seconds))) snapshot.duration.seconds = Number(seconds);
    });

    const maxModeRow = rowFor(panel, 'maxMode');
    readField('maxMode', !!maxModeRow, () => {
      const onButtons = getAllHostLocales().map((l) => l.rows.maxMode.on);
      snapshot.maxMode = onButtons.some((bText) => selected(rowButton(panel, 'maxMode', bText)));
    });

    const weirdnessSlider = slider(panel, 'weirdness');
    readField('weirdness', !!weirdnessSlider, () => { snapshot.weirdness = Number(weirdnessSlider!.getAttribute('aria-valuenow') ?? snapshot.weirdness); });

    const styleInfluenceSlider = slider(panel, 'styleInfluence');
    readField('styleInfluence', !!styleInfluenceSlider, () => { snapshot.styleInfluence = Number(styleInfluenceSlider!.getAttribute('aria-valuenow') ?? snapshot.styleInfluence); });

    const variationSlider = slider(panel, 'variation');
    readField('variation', !!variationSlider, () => { snapshot.variation = Number(variationSlider!.getAttribute('aria-valuenow') ?? snapshot.variation); });

    // Only present once an audio reference (upload/remix) is attached, so
    // this legitimately falls into `unreadable` the rest of the time.
    const audioInfluenceSlider = slider(panel, 'audioInfluence');
    readField('audioInfluence', !!audioInfluenceSlider, () => { snapshot.audioInfluence = Number(audioInfluenceSlider!.getAttribute('aria-valuenow') ?? snapshot.audioInfluence); });

    const personalizationRow = rowFor(panel, 'personalization');
    readField('personalization', !!personalizationRow, () => {
      const onButtons = getAllHostLocales().map((l) => l.rows.personalization.on);
      const myTasteButtons = getAllHostLocales().map((l) => l.rows.personalization.myTaste);
      snapshot.personalization.enabled = onButtons.some((bText) => selected(rowButton(panel, 'personalization', bText)));
      let tasteName: string | undefined;
      for (const bText of myTasteButtons) {
        const btn = rowButton(panel, 'personalization', bText);
        if (btn && text(btn)) {
          tasteName = text(btn);
          break;
        }
      }
      snapshot.personalization.tasteName = tasteName;
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
        const loc = getHostLocale();
        const targetGender = partial.vocalGender;
        const getGenderBtn = (gender: 'male' | 'female'): HTMLButtonElement | undefined => {
          const primary = loc.rows.vocalGender[gender];
          const btn = rowButton(panel, 'vocalGender', primary);
          if (btn) return btn;
          for (const otherLoc of getAllHostLocales()) {
            const fallbackBtn = rowButton(panel, 'vocalGender', otherLoc.rows.vocalGender[gender]);
            if (fallbackBtn) return fallbackBtn;
          }
          return undefined;
        };

        if (targetGender === 'none') {
          const maleBtn = getGenderBtn('male');
          const femaleBtn = getGenderBtn('female');
          const active = [maleBtn, femaleBtn].find(selected);
          success('vocalGender', !active || clickIfNeeded(active, true));
        } else {
          const button = getGenderBtn(targetGender);
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
        const loc = getHostLocale();
        const mode = partial.duration.mode;
        const getDurationBtn = (m: 'custom' | 'auto'): HTMLButtonElement | undefined => {
          const primary = loc.rows.duration[m];
          const btn = rowButton(panel, 'duration', primary);
          if (btn) return btn;
          for (const otherLoc of getAllHostLocales()) {
            const fallbackBtn = rowButton(panel, 'duration', otherLoc.rows.duration[m]);
            if (fallbackBtn) return fallbackBtn;
          }
          return undefined;
        };

        const modeButton = getDurationBtn(mode);
        let okay = clickIfNeeded(modeButton, !selected(modeButton));
        if (partial.duration.mode === 'custom' && partial.duration.seconds !== undefined) {
          await settle();
          // The seconds input can only appear once the mode switch above
          // has actually rendered, so look it up fresh again afterward.
          const freshPanel = optionPanel() ?? panel;
          const input = rowFor(freshPanel, 'duration')?.querySelector<HTMLInputElement>('input[type="number"]');
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
        const loc = getHostLocale();
        const stateKey = partial.maxMode ? 'on' : 'off';
        const getMaxModeBtn = (): HTMLButtonElement | undefined => {
          const primary = loc.rows.maxMode[stateKey];
          const btn = rowButton(panel, 'maxMode', primary);
          if (btn) return btn;
          for (const otherLoc of getAllHostLocales()) {
            const fallbackBtn = rowButton(panel, 'maxMode', otherLoc.rows.maxMode[stateKey]);
            if (fallbackBtn) return fallbackBtn;
          }
          return undefined;
        };
        const button = getMaxModeBtn();
        success('maxMode', clickIfNeeded(button, !selected(button)));
      }
      await settle();
    }
    if (partial.weirdness !== undefined) {
      success('weirdness', await setSlider('weirdness', partial.weirdness));
      await settle();
    }
    if (partial.styleInfluence !== undefined) {
      success('styleInfluence', await setSlider('styleInfluence', partial.styleInfluence));
      await settle();
    }
    if (partial.variation !== undefined) {
      success('variation', await setSlider('variation', partial.variation));
      await settle();
    }
    if (partial.audioInfluence !== undefined) {
      success('audioInfluence', await setSlider('audioInfluence', partial.audioInfluence));
      await settle();
    }
    if (partial.personalization !== undefined) {
      const panel = optionPanel();
      if (!panel) {
        skipped.push('personalization');
      } else {
        const loc = getHostLocale();
        const stateKey = partial.personalization.enabled ? 'on' : 'off';
        const getPersonalizationBtn = (): HTMLButtonElement | undefined => {
          const primary = loc.rows.personalization[stateKey];
          const btn = rowButton(panel, 'personalization', primary);
          if (btn) return btn;
          for (const otherLoc of getAllHostLocales()) {
            const fallbackBtn = rowButton(panel, 'personalization', otherLoc.rows.personalization[stateKey]);
            if (fallbackBtn) return fallbackBtn;
          }
          return undefined;
        };
        const button = getPersonalizationBtn();
        success('personalization', clickIfNeeded(button, !selected(button)));
      }
    }
    return { applied, skipped };
  }

  async extractSavedStyles(): Promise<SavedStyle[]> {
    const existing = savedStylesDialog();
    const triggerLabels = getAllSavedStyleTriggerLabels();
    const trigger = visible([...document.querySelectorAll<HTMLButtonElement>('button')].filter((button) => {
      const aria = button.getAttribute('aria-label') ?? '';
      return triggerLabels.some((label) => aria.includes(label));
    }));
    let dialog = existing;
    let openedHere = false;
    let suppressor: HTMLStyleElement | undefined;
    if (!dialog && trigger) {
      suppressor = document.createElement('style');
      suppressor.dataset.sunoCreateAssistant = 'style-dialog-suppressor';
      const dialogSelectors = getAllSavedStyleDialogLabels()
        .map((label) => `[role="dialog"][aria-label*="${label}"]`)
        .join(', ');
      suppressor.textContent = `${dialogSelectors} { visibility: hidden !important; }`;
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
      const ui = getUiMessages();
      if (!dialog) throw new Error(ui.feedback.cannotOpenSavedStyles);
      const excludedRegex = /^(?:削除|名前を変更|グリッド表示|delete|rename|grid\s*view)$/i;
      const rows = [...dialog.querySelectorAll<HTMLButtonElement>('button[aria-label]')]
        .filter((button) => {
          const label = (button.getAttribute('aria-label') ?? '').trim();
          return label && !excludedRegex.test(label);
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

export function describeSkipped(keys: OtherOptionsKey[], lang?: SupportedLanguage): string {
  const ui = getUiMessages(lang);
  return keys.map((key) => ui.optionLabels[key]).join(ui.separator);
}

