// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { detectSunoTheme } from '../src/content/theme';

afterEach(() => {
  document.body.removeAttribute('style');
  document.documentElement.removeAttribute('style');
});

describe('detectSunoTheme', () => {
  it('reads a declared color-scheme when the page sets one', () => {
    document.documentElement.style.colorScheme = 'light';
    expect(detectSunoTheme()).toBe('light');
  });

  it('falls back to the perceived brightness of the body background when no color-scheme is declared', () => {
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    expect(detectSunoTheme()).toBe('light');

    document.body.style.backgroundColor = 'rgb(10, 10, 12)';
    expect(detectSunoTheme()).toBe('dark');
  });

  it('skips a transparent body background and checks the document element instead', () => {
    document.body.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    document.documentElement.style.backgroundColor = 'rgb(250, 250, 252)';
    expect(detectSunoTheme()).toBe('light');
  });

  it('defaults to dark when nothing can be determined', () => {
    expect(detectSunoTheme()).toBe('dark');
  });
});
