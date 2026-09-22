import { optionKeys, type CustomStyle, type MasteringPrompt, type MusicalSettings, type MusicalSettingsDetection, type MusicalSettingsField, type OtherOptionsCapture, type OtherOptionsKey, type OtherOptionsPreset, type OtherOptionsSnapshot, type SavedStyle, type StyleSource } from './models';
import { getUiMessages, type SupportedLanguage, type UiMessages } from '../locales';

// Only trailing whitespace is trimmed from the style: its leading and internal
// whitespace is the user's own layout and is not ours to rewrite.
export function composePrompt(style?: string, mastering?: string): string | undefined {
  const value = [style?.trimEnd(), mastering?.trim()].filter(Boolean).join('\n');
  return value.length <= 1000 ? value : undefined;
}

/**
 * Separates a mastering prompt from the end of the Style text: the text is
 * either exactly the mastering (an empty base) or ends with it on its own
 * line. The base of an empty Style is a valid `''`, not "unknown". Anything
 * else recognizes no mastering and leaves the whole text as the base.
 */
export function splitMasteringPrompt(text: string, candidate?: MasteringPrompt): { base: string; mastering?: MasteringPrompt } {
  const masteringPrompt = candidate?.prompt.trim();
  if (!candidate || !masteringPrompt) return { base: text };
  const trimmed = text.trimEnd();
  if (trimmed === masteringPrompt) return { base: '', mastering: candidate };
  if (trimmed.endsWith(`\n${masteringPrompt}`)) return { base: trimmed.slice(0, -(masteringPrompt.length + 1)), mastering: candidate };
  return { base: text };
}

/**
 * The list the style dropdown shows. Custom styles come first so that, when a
 * custom style and a Suno saved style hold the same prompt, deriveStyleSelection's
 * linear search (which tries savedStyles in order) resolves to the custom one.
 */
export function mergeStyleSources(customStyles: CustomStyle[], sunoStyles: SavedStyle[], source: StyleSource): SavedStyle[] {
  const own: SavedStyle[] = customStyles.map(({ id, name, prompt }) => ({ id, name, prompt }));
  if (source === 'custom') return own;
  if (source === 'suno') return sunoStyles;
  return [...own, ...sunoStyles];
}

const MUSIC_SETTINGS_LINE = /^\s*Musical settings:\s*.*$/gim;
// The `d` flag makes every match carry `indices`, which detectMusicalSpans()
// uses to locate the value itself (not the "key of " prefix) inside the prompt.
const KEY_NAME = /(?:key\s*(?:of|is|:)?\s*|キー\s*(?:は|:|：)?\s*)([A-G](?:#|♯|b|♭)?\s*(?:major|minor|メジャー|マイナー|長調|短調))/gid;
const BARE_KEY_NAME = /\b([A-G](?:#|♯|b|♭)?\s*(?:major|minor))\b/gid;
const TEMPO = /(?:tempo\s*(?:of|is|:)?\s*|テンポ\s*(?:は|:|：)?\s*)(\d{2,3})\s*(?:bpm)?\b/gid;
const BARE_TEMPO = /\b(\d{2,3})\s*bpm\b/gid;
const TIME_SIGNATURE = /\b([1-9]|1[0-2])\s*\/\s*(2|4|8|16)\s*(?:time)?\b|([1-9]|1[0-2])\s*\/\s*(2|4|8|16)\s*拍子/gid;
const MUSICAL_FIELDS: MusicalSettingsField[] = ['key', 'tempo', 'timeSignature'];

function normalizedKey(value: string): string | undefined {
  const match = value.trim().match(/^([A-G])([#♯b♭]?)\s*(major|minor|メジャー|マイナー|長調|短調)$/i);
  if (!match) return undefined;
  const accidental = match[2]!.replace('♯', '#').replace('♭', 'b');
  const quality = /^(?:major|メジャー|長調)$/i.test(match[3]!) ? 'Major' : 'Minor';
  return `${match[1]!.toUpperCase()}${accidental} ${quality}`;
}

function oneValue<T>(values: T[]): { value?: T; conflict: boolean } {
  const unique = [...new Set(values)];
  return unique.length === 1 ? { value: unique[0], conflict: false } : { conflict: unique.length > 1 };
}

/** One key / tempo / time-signature phrase found in a prompt, with its position. */
export interface MusicalSpan {
  field: MusicalSettingsField;
  /** Offsets of the value only; a "key of " prefix or " time" suffix is excluded. */
  start: number;
  end: number;
  /** The value exactly as written (e.g. 'E♭マイナー', '92', '3 / 4'). */
  text: string;
  /** The normalized value ('Eb Minor' | 92 | '3/4'). */
  value: string | number;
  /** Inside a line written by this extension (`Musical settings: ...`). */
  managed: boolean;
}

/**
 * Locates every explicit key, tempo, and time-signature phrase. The key and
 * tempo patterns each have a prefixed and a bare form that match the very same
 * characters ("key of D Minor" hits both), so spans are de-duplicated by
 * position; without that a replacement would be applied twice.
 */
export function detectMusicalSpans(prompt: string): MusicalSpan[] {
  const managedRanges = [...prompt.matchAll(MUSIC_SETTINGS_LINE)].map((line) => {
    const from = line.index ?? 0;
    return [from, from + line[0].length] as const;
  });
  const spans = new Map<string, MusicalSpan>();
  const add = (field: MusicalSettingsField, start: number, end: number, value: string | number | undefined) => {
    const id = `${field}:${start}:${end}`;
    if (value === undefined || spans.has(id)) return;
    const managed = managedRanges.some(([from, to]) => start >= from && end <= to);
    spans.set(id, { field, start, end, text: prompt.slice(start, end), value, managed });
  };

  for (const pattern of [KEY_NAME, BARE_KEY_NAME]) {
    for (const match of prompt.matchAll(pattern)) {
      const [start, end] = match.indices![1]!;
      add('key', start, end, normalizedKey(match[1]!));
    }
  }
  for (const pattern of [TEMPO, BARE_TEMPO]) {
    for (const match of prompt.matchAll(pattern)) {
      const tempo = Number(match[1]);
      if (tempo < 30 || tempo > 300) continue;
      const [start, end] = match.indices![1]!;
      add('tempo', start, end, tempo);
    }
  }
  for (const match of prompt.matchAll(TIME_SIGNATURE)) {
    // Group 1/2 is the "4/4 (time)" form, 3/4 the "4/4拍子" form.
    const [numeratorGroup, denominatorGroup] = match[1] !== undefined ? [1, 2] : [3, 4];
    const numerator = match[numeratorGroup!];
    const denominator = match[denominatorGroup!];
    if (!numerator || !denominator) continue;
    add('timeSignature', match.indices![numeratorGroup!]![0], match.indices![denominatorGroup!]![1], `${numerator}/${denominator}`);
  }
  return [...spans.values()].sort((a, b) => a.start - b.start);
}

/**
 * Extracts explicit musical metadata from the visible Style prompt. A field
 * with conflicting values is intentionally left unset so the UI never
 * silently chooses one interpretation over another.
 */
export function detectMusicalSettings(prompt: string): MusicalSettingsDetection {
  const spans = detectMusicalSpans(prompt);
  // Once the user has applied the extension-managed line, it is the explicit
  // current choice for that field. Ignore descriptive phrases elsewhere in
  // the style (for example inside a newly selected saved style) so they cannot
  // turn a deliberate setting into an apparent conflict. This is decided per
  // field: a managed line that only states the key must not hide a tempo the
  // prose states, because applyMusicalSettingsToPrompt() edits the prose.
  const detect = (field: MusicalSettingsField) => {
    const candidates = spans.filter((span) => span.field === field);
    const managed = candidates.filter((span) => span.managed);
    return oneValue((managed.length ? managed : candidates).map((span) => span.value));
  };

  const key = detect('key');
  const tempo = detect('tempo');
  const timeSignature = detect('timeSignature');
  const conflicts: MusicalSettingsDetection['conflicts'] = [];
  if (key.conflict) conflicts.push('key');
  if (tempo.conflict) conflicts.push('tempo');
  if (timeSignature.conflict) conflicts.push('timeSignature');
  return {
    key: key.value as string | undefined,
    tempo: tempo.value as number | undefined,
    timeSignature: timeSignature.value as string | undefined,
    conflicts,
  };
}

// Writes a normalized key ('F# Major') in the notation of the phrase it
// replaces: note-name case, ♯/♭ vs #/b, spacing, and the English / katakana /
// kanji quality word with its capitalization.
function renderKey(source: string, value: string): string {
  const from = source.match(/^([A-G])([#♯b♭]?)(\s*)(major|minor|メジャー|マイナー|長調|短調)$/i);
  const to = value.match(/^([A-G])([#b]?) (Major|Minor)$/);
  if (!from || !to) return value;
  const fromLetter = from[1]!;
  const fromAccidental = from[2]!;
  const separator = from[3]!;
  const fromQuality = from[4]!;
  const toLetter = to[1]!;
  const toAccidental = to[2]!;
  const isMajor = to[3] === 'Major';
  const isEnglish = /^(?:major|minor)$/i.test(fromQuality);
  const isKatakana = /^(?:メジャー|マイナー)$/.test(fromQuality);
  const isUnicodeAccidental = /[♯♭]/.test(fromAccidental) || (!fromAccidental && !isEnglish);
  const letter = fromLetter === fromLetter.toLowerCase() ? toLetter.toLowerCase() : toLetter;
  const accidental = isUnicodeAccidental ? toAccidental.replace('#', '♯').replace('b', '♭') : toAccidental;
  let quality: string;
  if (isEnglish) {
    const word = isMajor ? 'major' : 'minor';
    if (fromQuality === fromQuality.toUpperCase()) quality = word.toUpperCase();
    else quality = fromQuality[0] === fromQuality[0]!.toUpperCase() ? `${word[0]!.toUpperCase()}${word.slice(1)}` : word;
  } else if (isKatakana) {
    quality = isMajor ? 'メジャー' : 'マイナー';
  } else {
    quality = isMajor ? '長調' : '短調';
  }
  return `${letter}${accidental}${separator}${quality}`;
}

function renderMusicalPhrase(span: MusicalSpan, value: string | number): string {
  if (span.field === 'key') return renderKey(span.text, String(value));
  if (span.field === 'timeSignature') {
    // Keep the original spacing around the slash ("3/4" vs "3 / 4").
    const from = span.text.match(/^\d+(\s*\/\s*)\d+$/);
    const to = String(value).match(/^(\d+)\/(\d+)$/);
    return from && to ? `${to[1]}${from[1]}${to[2]}` : String(value);
  }
  return String(value);
}

function musicSettingsLine(settings: MusicalSettings): string {
  const fields = [
    settings.key && `Key: ${settings.key}`,
    settings.tempo && `Tempo: ${settings.tempo} BPM`,
    settings.timeSignature && `Time signature: ${settings.timeSignature}`,
  ].filter(Boolean);
  return fields.length ? `Musical settings: ${fields.join('; ')}.` : '';
}

/**
 * Adds a single extension-managed line to the Style text. Existing managed
 * lines are replaced, while every other part of the user's prompt remains
 * untouched. The line is deliberately ordinary prompt text, so Suno receives
 * the requested musical constraints without any private API integration.
 */
export function applyMusicalSettings(prompt: string, settings: MusicalSettings): string {
  const line = musicSettingsLine(settings);
  // With no managed line yet, nothing has to be removed, so the prompt keeps
  // its own leading and internal whitespace; the line is only appended.
  // (`search` ignores the global regex's lastIndex, unlike `test`.)
  if (prompt.search(MUSIC_SETTINGS_LINE) === -1) return line ? [prompt.trimEnd(), line].filter(Boolean).join('\n') : prompt;
  const base = prompt.replace(MUSIC_SETTINGS_LINE, '').replace(/\n{3,}/g, '\n\n').trim();
  return [base, line].filter(Boolean).join('\n');
}

/**
 * Rewrites the musical phrases the prompt already states, in place and in
 * their original wording, and keeps every field the prompt does not state in
 * the single extension-managed `Musical settings:` line. A field this function
 * writes lands in exactly one of the two, so it never creates a prompt that
 * contradicts itself - but a prompt an older build already wrote can state the
 * same field in both, and there the managed line stays authoritative and the
 * prose is left alone rather than cleaned up.
 *
 * An unset field never deletes prose (that would break the sentence around
 * it); it only drops the field from the managed line.
 */
export function applyMusicalSettingsToPrompt(prompt: string, settings: MusicalSettings): string {
  const spans = detectMusicalSpans(prompt);
  const nextManaged: Partial<Record<MusicalSettingsField, string | number>> = {};
  const replacements: { span: MusicalSpan; text: string }[] = [];
  let isManagedChanged = false;

  for (const field of MUSICAL_FIELDS) {
    const wanted = settings[field];
    const managedSpans = spans.filter((span) => span.field === field && span.managed);
    const bodySpans = spans.filter((span) => span.field === field && !span.managed);
    if (managedSpans.length) {
      if (wanted !== undefined) nextManaged[field] = wanted;
      if (managedSpans.some((span) => span.value !== wanted)) isManagedChanged = true;
    } else if (bodySpans.length) {
      if (wanted === undefined) continue;
      for (const span of bodySpans) {
        if (span.value !== wanted) replacements.push({ span, text: renderMusicalPhrase(span, wanted) });
      }
    } else if (wanted !== undefined) {
      nextManaged[field] = wanted;
      isManagedChanged = true;
    }
  }

  // Back to front, so earlier offsets stay valid while later text changes length.
  let result = prompt;
  for (const { span, text } of replacements.sort((a, b) => b.span.start - a.span.start)) {
    result = result.slice(0, span.start) + text + result.slice(span.end);
  }
  // Rebuilding the line trims the prompt and moves the line to the end, so it
  // only runs when the managed content really changes.
  return isManagedChanged ? applyMusicalSettings(result, nextManaged as MusicalSettings) : result;
}

// The prompt with the managed line removed and every prose phrase replaced by a
// per-field placeholder, so two texts that differ only in key, tempo, or time
// signature compare equal. Used to keep a saved style selected after its
// musical phrases are rewritten.
function musicallyComparable(prompt: string): string {
  let text = prompt;
  const proseSpans = detectMusicalSpans(prompt).filter((span) => !span.managed).sort((a, b) => b.start - a.start);
  for (const span of proseSpans) text = `${text.slice(0, span.start)}\u0000${span.field}\u0000${text.slice(span.end)}`;
  return text.replace(MUSIC_SETTINGS_LINE, '').replace(/\n{3,}/g, '\n\n').trim();
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
  const { base, mastering } = splitMasteringPrompt(text, candidate);

  const normalized = base.trim();
  // Musical settings are an extension-managed decoration of the base style,
  // not a manual style edit. Ignore the line only for saved-style matching;
  // return the original base so subsequent mastering changes preserve it.
  const comparable = normalized.replace(MUSIC_SETTINGS_LINE, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!comparable) return { base, mastering, isCustomStyle: false };
  // Compared with musical phrases normalized away, so rewriting a saved
  // style's key or tempo (see applyMusicalSettingsToPrompt) keeps it selected.
  // The cost: saved styles that differ only in key/tempo/meter can match each
  // other; the current selection is tried first, so it wins.
  const target = musicallyComparable(comparable);
  const matches = (saved: SavedStyle) => musicallyComparable(saved.prompt) === target;
  const style = current.style && matches(current.style) ? current.style : savedStyles.find(matches);
  if (style) return { base, style, mastering, isCustomStyle: false };

  // The mastering text was edited, so where the style ends is unknown. If the
  // selected style is still the leading block, only the mastering part
  // changed: keep the style rather than calling the whole text custom.
  if (candidate && !mastering && current.style) {
    const stylePrompt = current.style.prompt.trim();
    // Split by line count rather than by prefix so the leading block may
    // differ from the saved prompt in key/tempo/meter phrases; it is kept as
    // typed, so a rewritten phrase is not rolled back to the saved wording.
    const lines = comparable.split('\n');
    const styleLineCount = stylePrompt.split('\n').length;
    const leading = lines.slice(0, styleLineCount).join('\n');
    if (stylePrompt && lines.length > styleLineCount && musicallyComparable(leading) === musicallyComparable(stylePrompt)) {
      // Preserve our own musical-settings line but discard the edited
      // mastering tail, exactly as the pre-musical-settings behavior kept
      // only the selected style prompt in this recovery path.
      const musicalLines = base.match(MUSIC_SETTINGS_LINE) ?? [];
      return {
        base: [leading, ...musicalLines].join('\n'),
        style: current.style,
        mastering: undefined,
        isCustomStyle: false,
      };
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
  entries: Array<MasteringPrompt | OtherOptionsPreset | CustomStyle>,
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
