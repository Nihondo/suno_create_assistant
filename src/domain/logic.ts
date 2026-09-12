import type { MasteringPrompt, OtherOptionsPreset, SavedStyle } from './models';

export function composePrompt(style?: string, mastering?: string): string | undefined {
  const value = [style?.trim(), mastering?.trim()].filter(Boolean).join('\n');
  return value.length <= 1000 ? value : undefined;
}

export function autoTitle(destination: string, styleName: string): string {
  const parts = [destination.trim(), styleName.trim()].filter(Boolean);
  if (parts.length === 2) return `${parts[0]} (${parts[1]})`;
  return parts[0] ?? '';
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
