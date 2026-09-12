import { describe, expect, it } from 'vitest';
import {
  autoTitle,
  composePrompt,
  extractTakeKey,
  hasTakePlaceholder,
  nextBaseAfterManualEdit,
  replaceTakePlaceholder,
  validateUniqueName,
} from '../src/domain/logic';
import type { MasteringPrompt } from '../src/domain/models';

describe('prompt composition', () => {
  it('joins style and mastering with one newline', () => {
    expect(composePrompt('orchestra', 'wide stereo master')).toBe('orchestra\nwide stereo master');
    expect(composePrompt('orchestra', undefined)).toBe('orchestra');
    expect(composePrompt(undefined, 'wide stereo master')).toBe('wide stereo master');
  });

  it('does not truncate an overflow prompt', () => {
    expect(composePrompt('a'.repeat(1000), 'b')).toBeUndefined();
  });

  it('keeps the editable base when the known mastering suffix remains', () => {
    const mastering: MasteringPrompt = { id: '1', name: 'Master', prompt: 'master', createdAt: '', updatedAt: '' };
    expect(nextBaseAfterManualEdit('custom style\nmaster', mastering)).toBe('custom style');
    expect(nextBaseAfterManualEdit('custom style\nchanged', mastering)).toBe('custom style\nchanged');
  });
});

describe('automatic titles and placeholders', () => {
  it.each([
    ['Workspace', 'ARIA', 'Workspace (ARIA) {{TAKE}}'],
    ['Workspace', '', 'Workspace {{TAKE}}'],
    ['', 'ARIA', 'ARIA {{TAKE}}'],
    ['', '', ''],
  ])('formats default title for %s and %s', (destination, style, expected) => {
    expect(autoTitle(destination, style)).toBe(expected);
  });

  it('supports custom formats with placeholders', () => {
    expect(autoTitle('Workspace', 'ARIA', '{{WORKSPACE}} - {{STYLE}} #{{TAKE}}')).toBe('Workspace - ARIA #{{TAKE}}');
    expect(autoTitle('Workspace', '', '{{WORKSPACE}} ({{STYLE}}) [{{TAKE}}]')).toBe('Workspace [{{TAKE}}]');
  });

  it('supports {{AUDIO}} placeholder when specified', () => {
    expect(autoTitle('Workspace', 'ARIA', '{{AUDIO}} ({{STYLE}}) {{TAKE}}', 'Dragon Quest')).toBe('Dragon Quest (ARIA) {{TAKE}}');
    expect(autoTitle('Workspace', 'ARIA', '{{audio}} - {{STYLE}}', 'Dragon Quest')).toBe('Dragon Quest - ARIA');
    expect(autoTitle('Workspace', '', '{{WORKSPACE}} - {{AUDIO}} {{TAKE}}', 'Dragon Quest')).toBe('Workspace - Dragon Quest {{TAKE}}');
    expect(autoTitle('Workspace', 'ARIA', '{{AUDIO}} ({{STYLE}}) {{TAKE}}', '')).toBe('(ARIA) {{TAKE}}');
    expect(autoTitle('Workspace', '', '{{AUDIO}} ({{STYLE}}) {{TAKE}}', 'Dragon Quest')).toBe('Dragon Quest {{TAKE}}');
    expect(autoTitle('', 'ARIA', '{{AUDIO}} ({{STYLE}})', 'Dragon Quest')).toBe('Dragon Quest (ARIA)');
    // When using DEFAULT_TITLE_FORMAT, workspace is preserved even if audioTitle is provided
    expect(autoTitle('Workspace', 'ARIA', undefined, 'Dragon Quest')).toBe('Workspace (ARIA) {{TAKE}}');
  });

  it('detects take placeholder case-insensitively', () => {
    expect(hasTakePlaceholder('Song {{TAKE}}')).toBe(true);
    expect(hasTakePlaceholder('Song {{take}}')).toBe(true);
    expect(hasTakePlaceholder('Song')).toBe(false);
  });

  it('extracts take key by removing placeholder and trimming whitespace', () => {
    expect(extractTakeKey('Workspace (ARIA) {{TAKE}}')).toBe('Workspace (ARIA)');
    expect(extractTakeKey('Workspace (ARIA) {{take}}')).toBe('Workspace (ARIA)');
    expect(extractTakeKey('Song {{TAKE}}')).toBe('Song');
    expect(extractTakeKey('{{TAKE}}')).toBe('');
  });

  it('replaces take placeholder with formatted take number', () => {
    expect(replaceTakePlaceholder('Workspace (ARIA) {{TAKE}}', 1)).toBe('Workspace (ARIA) 1');
    expect(replaceTakePlaceholder('Song #{{take}}', 42)).toBe('Song #42');
  });
});

describe('names', () => {
  it('rejects a case-insensitive duplicate while allowing its own record', () => {
    const entries = [{ id: 'one', name: 'Master', prompt: '', createdAt: '', updatedAt: '' }];
    expect(validateUniqueName('master', entries)).toBeDefined();
    expect(validateUniqueName('master', entries, 'one')).toBeUndefined();
  });
});
