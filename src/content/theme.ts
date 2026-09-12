export type SunoTheme = 'light' | 'dark';

function parseColor(value: string): { r: number; g: number; b: number; a: number } | undefined {
  const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
  if (!match) return undefined;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) };
}

/**
 * Suno's own CSS custom property names for its theme colors are not
 * confirmed, so the extension's CSS cannot rely on reading them - an
 * earlier attempt at that always silently fell through to hardcoded dark
 * fallback values, regardless of the page's real theme (see CLAUDE.md).
 * This instead reads the page's actual computed appearance directly: its
 * declared color-scheme when present, or the perceived brightness of the
 * first non-transparent background color found walking from <body> up to
 * <html>.
 */
export function detectSunoTheme(): SunoTheme {
  const declared = getComputedStyle(document.documentElement).colorScheme;
  if (declared === 'light' || declared === 'dark') return declared;

  for (const element of [document.body, document.documentElement]) {
    if (!element) continue;
    const color = parseColor(getComputedStyle(element).backgroundColor);
    if (!color || color.a === 0) continue;
    const perceivedBrightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
    return perceivedBrightness > 128 ? 'light' : 'dark';
  }
  return 'dark';
}
