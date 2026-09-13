import { describe, expect, it } from 'vitest';
import {
  autoTitle,
  calculateTagInsertion,
  composePrompt,
  displayTagName,
  extractTakeKey,
  formatDate,
  formatLyricsTags,
  formatTakeNumber,
  formatTime,
  hasTakePlaceholder,
  nextBaseAfterManualEdit,
  normalizedInsertTag,
  parseLyricsTags,
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

  it('detects take placeholder case-insensitively including padded specs', () => {
    expect(hasTakePlaceholder('Song {{TAKE}}')).toBe(true);
    expect(hasTakePlaceholder('Song {{take}}')).toBe(true);
    expect(hasTakePlaceholder('Song {{TAKE:3}}')).toBe(true);
    expect(hasTakePlaceholder('Song {{take:001}}')).toBe(true);
    expect(hasTakePlaceholder('Song {{take:02}}')).toBe(true);
    expect(hasTakePlaceholder('Song')).toBe(false);
  });

  it('extracts take key by removing placeholder and trimming whitespace', () => {
    expect(extractTakeKey('Workspace (ARIA) {{TAKE}}')).toBe('Workspace (ARIA)');
    expect(extractTakeKey('Workspace (ARIA) {{take}}')).toBe('Workspace (ARIA)');
    expect(extractTakeKey('Workspace (ARIA) {{TAKE:3}}')).toBe('Workspace (ARIA)');
    expect(extractTakeKey('Workspace (ARIA) {{take:001}}')).toBe('Workspace (ARIA)');
    expect(extractTakeKey('Song {{TAKE}}')).toBe('Song');
    expect(extractTakeKey('{{TAKE}}')).toBe('');
    expect(extractTakeKey('{{TAKE:3}}')).toBe('');
  });

  it('formats take numbers with optional padding', () => {
    expect(formatTakeNumber(1)).toBe('1');
    expect(formatTakeNumber(1, '2')).toBe('01');
    expect(formatTakeNumber(1, '3')).toBe('001');
    expect(formatTakeNumber(1, '01')).toBe('01');
    expect(formatTakeNumber(1, '001')).toBe('001');
    expect(formatTakeNumber(1, '000')).toBe('001');
    expect(formatTakeNumber(42, '3')).toBe('042');
    expect(formatTakeNumber(1234, '2')).toBe('1234');
  });

  it('replaces take placeholder with formatted take number', () => {
    expect(replaceTakePlaceholder('Workspace (ARIA) {{TAKE}}', 1)).toBe('Workspace (ARIA) 1');
    expect(replaceTakePlaceholder('Song #{{take}}', 42)).toBe('Song #42');
    expect(replaceTakePlaceholder('Workspace (ARIA) {{TAKE:3}}', 1)).toBe('Workspace (ARIA) 001');
    expect(replaceTakePlaceholder('Song #{{take:001}}', 42)).toBe('Song #042');
    expect(replaceTakePlaceholder('Song #{{take:2}}', 7)).toBe('Song #07');
  });

  it('formats dates and times', () => {
    const d = new Date(2026, 8, 13, 14, 5, 9); // Month is 0-indexed: 8 = September
    expect(formatDate(d)).toBe('2026-09-13');
    expect(formatDate(d, 'YYYYMMDD')).toBe('20260913');
    expect(formatDate(d, 'YYYY/MM/DD')).toBe('2026/09/13');
    expect(formatDate(d, 'YY-M-D')).toBe('26-9-13');
    expect(formatTime(d)).toBe('14:05');
    expect(formatTime(d, 'HHmm')).toBe('1405');
    expect(formatTime(d, 'HHmmss')).toBe('140509');
    expect(formatTime(d, 'H:m:s')).toBe('14:5:9');
  });

  it('supports expanded placeholders (MODEL, MASTERING, PRESET, DATE, TIME)', () => {
    const now = new Date(2026, 8, 13, 14, 5, 0);
    expect(autoTitle('Workspace', 'ARIA', '{{WORKSPACE}} - {{STYLE}} - {{MODEL}} {{TAKE:3}}', { model: 'v6' })).toBe('Workspace - ARIA - v6 {{TAKE:3}}');
    expect(autoTitle('Workspace', 'ARIA', '{{WORKSPACE}} ({{STYLE}}) [{{MASTERING}}] {{TAKE}}', { mastering: 'Warm Master' })).toBe('Workspace (ARIA) [Warm Master] {{TAKE}}');
    expect(autoTitle('Workspace', 'ARIA', '{{WORKSPACE}} - {{PRESET}}', { preset: 'Acoustic Standard' })).toBe('Workspace - Acoustic Standard');
    expect(autoTitle('Workspace', '', '{{DATE}} {{TIME}} {{WORKSPACE}}', { now })).toBe('2026-09-13 14:05 Workspace');
    expect(autoTitle('Workspace', '', '{{DATE:YYYYMMDD}} - {{WORKSPACE}}', { now })).toBe('20260913 - Workspace');
    // Clean up empty bracket pairs
    expect(autoTitle('Workspace', '', '{{WORKSPACE}} [{{PRESET}}] ({{MASTERING}}) {{TAKE}}', {})).toBe('Workspace {{TAKE}}');
  });
});

describe('names', () => {
  it('rejects a case-insensitive duplicate while allowing its own record', () => {
    const entries = [{ id: 'one', name: 'Master', prompt: '', createdAt: '', updatedAt: '' }];
    expect(validateUniqueName('master', entries)).toBeDefined();
    expect(validateUniqueName('master', entries, 'one')).toBeUndefined();
  });
});

describe('lyrics tags logic', () => {
  it('displays tag name without brackets', () => {
    expect(displayTagName('[Verse 1]')).toBe('Verse 1');
    expect(displayTagName('[Chorus]')).toBe('Chorus');
    expect(displayTagName('Intro')).toBe('Intro');
    expect(displayTagName('  [Outro]  ')).toBe('Outro');
  });

  it('normalizes tag for insertion with brackets', () => {
    expect(normalizedInsertTag('[Verse 1]')).toBe('[Verse 1]');
    expect(normalizedInsertTag('Verse 1')).toBe('[Verse 1]');
    expect(normalizedInsertTag('  [Intro]  ')).toBe('[Intro]');
    expect(normalizedInsertTag('Intro')).toBe('[Intro]');
  });

  it('parses and formats lyrics tags', () => {
    const text = ' [Intro] \n\n [Verse 1] \n [Chorus]\n ';
    const tags = parseLyricsTags(text);
    expect(tags).toEqual(['[Intro]', '[Verse 1]', '[Chorus]']);
    expect(formatLyricsTags(tags)).toBe('[Intro]\n[Verse 1]\n[Chorus]');
  });

  it('calculates tag insertion in empty text', () => {
    const res = calculateTagInsertion('', 0, 0, 'Verse 1');
    expect(res.insertion).toBe('[Verse 1]\n');
    expect(res.newText).toBe('[Verse 1]\n');
    expect(res.newCursor).toBe(10);
  });

  it('calculates tag insertion after existing line', () => {
    const text = 'Hello world';
    const res = calculateTagInsertion(text, 11, 11, '[Chorus]');
    expect(res.newText).toBe('Hello world\n[Chorus]\n');
    expect(res.newCursor).toBe('Hello world\n[Chorus]\n'.length);
  });

  it('calculates tag insertion between lines with existing newlines', () => {
    const text = 'Line 1\nLine 2';
    const res = calculateTagInsertion(text, 7, 7, 'Bridge');
    expect(res.newText).toBe('Line 1\n[Bridge]\nLine 2');
    expect(res.newCursor).toBe('Line 1\n[Bridge]\n'.length);
  });
});

