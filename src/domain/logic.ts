import type { MasteringPrompt, OtherOptionsPreset, SavedStyle } from './models';

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

export function nextBaseAfterManualEdit(value: string, mastering?: MasteringPrompt): string {
  if (!mastering?.prompt) return value;
  const suffix = `\n${mastering.prompt}`;
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

export function validateUniqueName(
  value: string,
  entries: Array<MasteringPrompt | OtherOptionsPreset>,
  ignoredId?: string,
): string | undefined {
  const normalized = value.trim();
  if (!normalized) return '名前を入力してください。';
  if (entries.some((entry) => entry.id !== ignoredId && entry.name.trim().toLocaleLowerCase() === normalized.toLocaleLowerCase())) {
    return '同じ名前が既にあります。';
  }
  return undefined;
}

export function savedStyleId(name: string, prompt: string, index: number): string {
  return `${index}:${name}:${prompt.slice(0, 32)}`;
}

export function cloneStyle(style: SavedStyle): SavedStyle {
  return { ...style };
}
