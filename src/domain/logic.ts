import { optionKeys, type MasteringPrompt, type OtherOptionsCapture, type OtherOptionsKey, type OtherOptionsPreset, type OtherOptionsSnapshot, type SavedStyle } from './models';
import { getUiMessages, type SupportedLanguage, type UiMessages } from '../locales';

export function composePrompt(style?: string, mastering?: string): string | undefined {
  const value = [style?.trim(), mastering?.trim()].filter(Boolean).join('\n');
  return value.length <= 1000 ? value : undefined;
}

export const DEFAULT_TITLE_FORMAT = '{{WORKSPACE}} ({{STYLE}}) {{TAKE}}';

export function formatTakeNumber(takeNumber: number, spec?: string): string {
  if (!spec) return String(takeNumber);
  let digits = 1;
  if (spec.startsWith('0')) {
    digits = spec.length;
  } else {
    const parsed = parseInt(spec, 10);
    digits = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }
  digits = Math.min(Math.max(digits, 1), 10);
  return String(takeNumber).padStart(digits, '0');
}

export function hasTakePlaceholder(title: string): boolean {
  return /\{\{take(?::[0-9]+)?\}\}/i.test(title);
}

export function extractTakeKey(title: string): string {
  return title.replace(/\{\{take(?::[0-9]+)?\}\}/gi, '').replace(/\s+/g, ' ').trim();
}

export function replaceTakePlaceholder(title: string, takeNumber: number): string {
  return title.replaceAll(/\{\{take(?::([0-9]+))?\}\}/gi, (_, spec) => formatTakeNumber(takeNumber, spec));
}

export function formatDate(date: Date, spec?: string): string {
  const yyyy = String(date.getFullYear());
  const yy = yyyy.slice(-2);
  const m = date.getMonth() + 1;
  const mm = String(m).padStart(2, '0');
  const d = date.getDate();
  const dd = String(d).padStart(2, '0');

  if (!spec) return `${yyyy}-${mm}-${dd}`;

  return spec.replace(/YYYY|YY|MM|M|DD|D/g, (token) => {
    switch (token) {
      case 'YYYY': return yyyy;
      case 'YY': return yy;
      case 'MM': return mm;
      case 'M': return String(m);
      case 'DD': return dd;
      case 'D': return String(d);
      default: return token;
    }
  });
}

export function formatTime(date: Date, spec?: string): string {
  const h = date.getHours();
  const hh = String(h).padStart(2, '0');
  const min = date.getMinutes();
  const mm = String(min).padStart(2, '0');
  const s = date.getSeconds();
  const ss = String(s).padStart(2, '0');

  if (!spec) return `${hh}:${mm}`;

  return spec.replace(/HH|H|mm|m|ss|s/g, (token) => {
    switch (token) {
      case 'HH': return hh;
      case 'H': return String(h);
      case 'mm': return mm;
      case 'm': return String(min);
      case 'ss': return ss;
      case 's': return String(s);
      default: return token;
    }
  });
}

export interface AutoTitleOptions {
  audioTitle?: string;
  model?: string;
  mastering?: string;
  preset?: string;
  now?: Date;
}

export function autoTitle(
  destination: string,
  styleName: string,
  format = DEFAULT_TITLE_FORMAT,
  optionsOrAudio?: string | AutoTitleOptions,
): string {
  const opts: AutoTitleOptions = typeof optionsOrAudio === 'string'
    ? { audioTitle: optionsOrAudio }
    : optionsOrAudio ?? {};

  const ws = destination.trim();
  const st = styleName.trim();
  const audio = (opts.audioTitle ?? '').trim();
  const model = (opts.model ?? '').trim();
  const mastering = (opts.mastering ?? '').trim();
  const preset = (opts.preset ?? '').trim();
  const now = opts.now ?? new Date();

  if (!ws && !st && !audio && !model && !mastering && !preset) return '';

  if (format === DEFAULT_TITLE_FORMAT) {
    if (ws && st) return `${ws} (${st}) {{TAKE}}`;
    return `${ws || st} {{TAKE}}`;
  }

  let result = format;
  result = result.replaceAll(/\{\{workspace\}\}/gi, ws);
  result = result.replaceAll(/\{\{style\}\}/gi, st);
  result = result.replaceAll(/\{\{audio\}\}/gi, audio);
  result = result.replaceAll(/\{\{model\}\}/gi, model);
  result = result.replaceAll(/\{\{mastering\}\}/gi, mastering);
  result = result.replaceAll(/\{\{preset\}\}/gi, preset);

  result = result.replaceAll(/\{\{date(?::([A-Za-z0-9/_.-]+))?\}\}/gi, (_, spec) => formatDate(now, spec));
  result = result.replaceAll(/\{\{time(?::([A-Za-z0-9/_.-]+))?\}\}/gi, (_, spec) => formatTime(now, spec));

  result = result.replace(/\(\s*\)/g, '');
  result = result.replace(/\[\s*\]/g, '');
  result = result.replace(/\{\s*\}/g, '');
  return result.replace(/\s+/g, ' ').trim();
}

// Strips fields the adapter could not read (see OtherOptionsCapture.unreadable)
// out of a full snapshot, rather than storing whatever default value
// emptyOtherOptions() seeded them with as if it had genuinely been read.
// Shared by preset creation (SettingsDialog.tsx) and take-history recording
// (SunoController.executeCreateWithTake) - both start from the same
// SunoAdapter.readOtherOptions() result.
export function readableOptionFields(snapshot: OtherOptionsSnapshot, unreadable: OtherOptionsKey[]): Partial<OtherOptionsSnapshot> {
  return Object.fromEntries(optionKeys
    .filter((key) => !unreadable.includes(key))
    .map((key) => [key, snapshot[key]])) as Partial<OtherOptionsSnapshot>;
}

// One "label: value" line per field present in `fields`, in optionKeys order.
// Shared by the preset list/editor (SettingsDialog.tsx, joined with " / " via
// formatPreset below) and the take-history reuse-parameters hover popup
// (ReuseParamsButton in components.tsx, rendered one line per array entry).
export function optionFieldSummaryLines(fields: Partial<OtherOptionsSnapshot>, ui: UiMessages): string[] {
  const values: string[] = [];
  const onText = ui.dialog.onOption;
  const offText = ui.dialog.offOption;
  if (fields.excludedStyles !== undefined) values.push(`${ui.optionLabels.excludedStyles}: ${fields.excludedStyles || ui.dialog.noneOption}`);
  if (fields.vocalGender !== undefined) values.push(`${ui.optionLabels.vocalGender}: ${fields.vocalGender === 'none' ? ui.dialog.noneOption : fields.vocalGender === 'male' ? ui.dialog.maleOption : ui.dialog.femaleOption}`);
  if (fields.duration !== undefined) values.push(`${ui.optionLabels.duration}: ${fields.duration.mode === 'auto' ? 'Auto' : `${ui.custom}${fields.duration.seconds ? ` (${fields.duration.seconds}${ui.dialog.secondsLabel})` : ''}`}`);
  if (fields.maxMode !== undefined) values.push(`${ui.optionLabels.maxMode}: ${fields.maxMode ? onText : offText}`);
  if (fields.weirdness !== undefined) values.push(`${ui.optionLabels.weirdness}: ${fields.weirdness}%`);
  if (fields.styleInfluence !== undefined) values.push(`${ui.optionLabels.styleInfluence}: ${fields.styleInfluence}%`);
  if (fields.variation !== undefined) values.push(`${ui.optionLabels.variation}: ${fields.variation}`);
  if (fields.audioInfluence !== undefined) values.push(`${ui.optionLabels.audioInfluence}: ${fields.audioInfluence}%`);
  if (fields.personalization !== undefined) values.push(`${ui.optionLabels.personalization}: ${fields.personalization.enabled ? onText : offText}`);
  return values;
}

export function formatPreset(fields: Partial<OtherOptionsSnapshot>, ui: UiMessages): string {
  return optionFieldSummaryLines(fields, ui).join(' / ');
}

export interface StyleSelection {
  /** Style text with the mastering suffix removed; what selectMastering() recomposes from. */
  base: string;
  style?: SavedStyle;
  mastering?: MasteringPrompt;
  /** True only for non-empty text that matches no saved style. */
  isCustomStyle: boolean;
}

/**
 * Derives the Style/Mastering dropdown selection from the Style field's
 * current text, rather than from which control was last used. The text can
 * change behind the extension's back (typing, Suno's "reuse prompt"), so the
 * selection is only kept while the text still contains what it stands for.
 *
 * `rememberedMastering` is the last mastering the user had applied: while its
 * text is edited the dropdown shows 未選択, but it comes back as soon as the
 * text matches again (e.g. after undoing the edit).
 */
export function deriveStyleSelection(
  text: string,
  savedStyles: SavedStyle[],
  current: { style?: SavedStyle; mastering?: MasteringPrompt; rememberedMastering?: MasteringPrompt },
): StyleSelection {
  const candidate = current.mastering ?? current.rememberedMastering;
  const masteringPrompt = candidate?.prompt.trim();
  let mastering: MasteringPrompt | undefined;
  let base = text;
  if (masteringPrompt) {
    const trimmed = text.trimEnd();
    if (trimmed === masteringPrompt) {
      base = '';
      mastering = candidate;
    } else if (trimmed.endsWith(`\n${masteringPrompt}`)) {
      base = trimmed.slice(0, -(masteringPrompt.length + 1));
      mastering = candidate;
    }
  }

  const normalized = base.trim();
  if (!normalized) return { base, mastering, isCustomStyle: false };
  const matches = (saved: SavedStyle) => saved.prompt.trim() === normalized;
  const style = current.style && matches(current.style) ? current.style : savedStyles.find(matches);
  if (style) return { base, style, mastering, isCustomStyle: false };

  // The mastering text was edited, so where the style ends is unknown. If the
  // selected style is still the leading block, only the mastering part
  // changed: keep the style rather than calling the whole text custom.
  if (candidate && !mastering && current.style) {
    const stylePrompt = current.style.prompt.trim();
    if (stylePrompt && normalized.startsWith(`${stylePrompt}\n`)) {
      return { base: stylePrompt, style: current.style, mastering: undefined, isCustomStyle: false };
    }
  }
  return { base, mastering, isCustomStyle: true };
}

/**
 * True when every field a preset stores still equals the live value. Fields
 * the page could not be read for (`capture.unreadable`) or that the caller
 * knows were never applied (`ignoredKeys`) cannot be judged and are skipped,
 * so they never make a preset look edited.
 */
export function optionFieldsMatch(
  fields: Partial<OtherOptionsSnapshot>,
  capture: OtherOptionsCapture,
  ignoredKeys: ReadonlySet<OtherOptionsKey> = new Set(),
): boolean {
  const live = capture.snapshot;
  return optionKeys.every((key) => {
    if (fields[key] === undefined || ignoredKeys.has(key) || capture.unreadable.includes(key)) return true;
    switch (key) {
      case 'excludedStyles':
        return (fields.excludedStyles ?? '').trim() === live.excludedStyles.trim();
      case 'duration': {
        const saved = fields.duration!;
        if (saved.mode !== live.duration.mode) return false;
        return saved.mode === 'auto' || saved.seconds === undefined || saved.seconds === live.duration.seconds;
      }
      case 'personalization':
        return fields.personalization!.enabled === live.personalization.enabled;
      default:
        return fields[key] === live[key];
    }
  });
}

export function validateUniqueName(
  value: string,
  entries: Array<MasteringPrompt | OtherOptionsPreset>,
  ignoredId?: string,
  lang?: SupportedLanguage,
): string | undefined {
  const ui = getUiMessages(lang);
  const normalized = value.trim();
  if (!normalized) return ui.feedback.nameRequired;
  if (entries.some((entry) => entry.id !== ignoredId && entry.name.trim().toLocaleLowerCase() === normalized.toLocaleLowerCase())) {
    return ui.feedback.nameDuplicated;
  }
  return undefined;
}

export function savedStyleId(name: string, prompt: string, index: number): string {
  return `${index}:${name}:${prompt.slice(0, 32)}`;
}

export function cloneStyle(style: SavedStyle): SavedStyle {
  return { ...style };
}

export function displayTagName(tag: string): string {
  const trimmed = tag.trim();
  const match = trimmed.match(/^\[(.*)\]$/);
  return match && match[1] !== undefined ? match[1].trim() : trimmed;
}

export function normalizedInsertTag(tag: string): string {
  const trimmed = tag.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed;
  }
  return `[${trimmed}]`;
}

export function parseLyricsTags(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function formatLyricsTags(tags: string[]): string {
  return tags.join('\n');
}

export function calculateTagInsertion(
  currentText: string,
  cursorStart: number,
  cursorEnd: number,
  rawTag: string,
): { newText: string; newCursor: number; insertion: string } {
  const tag = normalizedInsertTag(rawTag);
  const start = Math.max(0, Math.min(cursorStart, currentText.length));
  const end = Math.max(start, Math.min(cursorEnd, currentText.length));

  const prefix = start > 0 && currentText[start - 1] !== '\n' ? '\n' : '';
  const suffix = end < currentText.length && currentText[end] === '\n' ? '' : '\n';
  const insertion = prefix + tag + suffix;

  const newText = currentText.slice(0, start) + insertion + currentText.slice(end);
  const newCursor = start + insertion.length;

  return { newText, newCursor, insertion };
}

