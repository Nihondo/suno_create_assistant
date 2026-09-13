import { optionKeys, type MasteringPrompt, type OtherOptionsKey, type OtherOptionsPreset, type OtherOptionsSnapshot, type SavedStyle } from './models';
import { getUiMessages, type SupportedLanguage } from '../locales';

export function composePrompt(style?: string, mastering?: string): string | undefined {
  const value = [style?.trim(), mastering?.trim()].filter(Boolean).join('\n');
  return value.length <= 1000 ? value : undefined;
}

export const DEFAULT_TITLE_FORMAT = '{{WORKSPACE}} ({{STYLE}}) {{TAKE}}';

export function hasTakePlaceholder(title: string): boolean {
  return /\{\{take\}\}/i.test(title);
}

export function extractTakeKey(title: string): string {
  return title.replace(/\{\{take\}\}/gi, '').replace(/\s+/g, ' ').trim();
}

export function replaceTakePlaceholder(title: string, takeNumber: number): string {
  return title.replaceAll(/\{\{take\}\}/gi, String(takeNumber));
}

export function autoTitle(
  destination: string,
  styleName: string,
  format = DEFAULT_TITLE_FORMAT,
  audioTitle = '',
): string {
  const ws = destination.trim();
  const st = styleName.trim();
  const audio = audioTitle.trim();
  if (!ws && !st && !audio) return '';

  if (format === DEFAULT_TITLE_FORMAT) {
    if (ws && st) return `${ws} (${st}) {{TAKE}}`;
    return `${ws || st} {{TAKE}}`;
  }

  let result = format;
  result = result.replaceAll(/\{\{workspace\}\}/gi, ws);
  result = result.replaceAll(/\{\{style\}\}/gi, st);
  result = result.replaceAll(/\{\{audio\}\}/gi, audio);
  result = result.replace(/\(\s*\)/g, '');
  result = result.replace(/\[\s*\]/g, '');
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

export function nextBaseAfterManualEdit(value: string, mastering?: MasteringPrompt): string {
  if (!mastering?.prompt) return value;
  const suffix = `\n${mastering.prompt}`;
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
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

