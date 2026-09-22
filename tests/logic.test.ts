import { describe, expect, it } from 'vitest';
import {
  autoTitle,
  applyMusicalSettings,
  applyMusicalSettingsToPrompt,
  calculateTagInsertion,
  composePrompt,
  deriveStyleSelection,
  detectMusicalSettings,
  detectMusicalSpans,
  displayTagName,
  extractTakeKey,
  formatDate,
  formatLyricsTags,
  formatPreset,
  formatTakeNumber,
  formatTime,
  hasTakePlaceholder,
  mergeStyleSources,
  normalizedInsertTag,
  optionFieldsMatch,
  optionFieldSummaryLines,
  parseLyricsTags,
  replaceTakePlaceholder,
  splitMasteringPrompt,
  validateUniqueName,
} from '../src/domain/logic';
import { emptyOtherOptions, type CustomStyle, type MasteringPrompt, type OtherOptionsKey, type OtherOptionsSnapshot, type SavedStyle } from '../src/domain/models';
import { getUiMessages } from '../src/locales';

describe('prompt composition', () => {
  it('joins style and mastering with one newline', () => {
    expect(composePrompt('orchestra', 'wide stereo master')).toBe('orchestra\nwide stereo master');
    expect(composePrompt('orchestra', undefined)).toBe('orchestra');
    expect(composePrompt(undefined, 'wide stereo master')).toBe('wide stereo master');
  });

  it('does not truncate an overflow prompt', () => {
    expect(composePrompt('a'.repeat(1000), 'b')).toBeUndefined();
  });

  it('keeps the style\'s leading and internal whitespace, trimming only what trails it', () => {
    expect(composePrompt('  intro\n\n\nverse  \n', ' master ')).toBe('  intro\n\n\nverse\nmaster');
    expect(composePrompt('   ', 'master')).toBe('master');
  });
});

describe('splitMasteringPrompt', () => {
  const mastering: MasteringPrompt = { id: 'm', name: 'Master', prompt: 'warm master', createdAt: '', updatedAt: '' };

  it('treats text equal to the mastering as an empty base', () => {
    expect(splitMasteringPrompt('warm master', mastering)).toEqual({ base: '', mastering });
    expect(splitMasteringPrompt('warm master\n', mastering)).toEqual({ base: '', mastering });
  });

  it('splits off a mastering that is the final line', () => {
    expect(splitMasteringPrompt('80s city pop\nwarm master', mastering)).toEqual({ base: '80s city pop', mastering });
  });

  it('recognizes no mastering when the text no longer ends with it, or when there is none', () => {
    expect(splitMasteringPrompt('80s city pop\nwarm master X', mastering)).toEqual({ base: '80s city pop\nwarm master X' });
    expect(splitMasteringPrompt('80s city pop', undefined)).toEqual({ base: '80s city pop' });
  });
});

describe('mergeStyleSources', () => {
  const customStyles: CustomStyle[] = [
    { id: 'c1', name: 'Lo-fi Night', prompt: 'lofi chill beats', createdAt: '', updatedAt: '' },
  ];
  const sunoStyles: SavedStyle[] = [
    { id: '0:City Pop:city pop 80s', name: 'City Pop', prompt: 'city pop 80s' },
  ];

  it('puts custom styles first, ahead of Suno styles, in merged mode', () => {
    expect(mergeStyleSources(customStyles, sunoStyles, 'merged')).toEqual([
      { id: 'c1', name: 'Lo-fi Night', prompt: 'lofi chill beats' },
      { id: '0:City Pop:city pop 80s', name: 'City Pop', prompt: 'city pop 80s' },
    ]);
  });

  it('returns only custom styles, stripped to id/name/prompt, in custom mode', () => {
    expect(mergeStyleSources(customStyles, sunoStyles, 'custom')).toEqual([
      { id: 'c1', name: 'Lo-fi Night', prompt: 'lofi chill beats' },
    ]);
  });

  it('returns only Suno styles in suno mode', () => {
    expect(mergeStyleSources(customStyles, sunoStyles, 'suno')).toEqual(sunoStyles);
  });

  it('returns an empty list when the active source has nothing', () => {
    expect(mergeStyleSources([], [], 'merged')).toEqual([]);
    expect(mergeStyleSources(customStyles, [], 'suno')).toEqual([]);
  });
});

describe('musical settings', () => {
  it('extracts English and Japanese key, tempo, and time-signature phrases', () => {
    expect(detectMusicalSettings('The piece is in the key of C Major with a tempo of 160 BPM in 4/4 time.')).toEqual({
      key: 'C Major', tempo: 160, timeSignature: '4/4', conflicts: [],
    });
    expect(detectMusicalSettings('キーはEbマイナー、テンポは92 BPM、3/4拍子です。')).toEqual({
      key: 'Eb Minor', tempo: 92, timeSignature: '3/4', conflicts: [],
    });
  });

  it('does not silently choose between conflicting values or invalid tempos', () => {
    expect(detectMusicalSettings('key of C Major, then key of D Minor, 160 BPM, 999 BPM')).toEqual({
      key: undefined, tempo: 160, timeSignature: undefined, conflicts: ['key'],
    });
  });

  it('uses an extension-managed musical-settings line over incidental style prose', () => {
    expect(detectMusicalSettings('key of D Minor, tempo of 90 BPM\nMusical settings: Key: C Major; Tempo: 160 BPM; Time signature: 4/4.')).toEqual({
      key: 'C Major', tempo: 160, timeSignature: '4/4', conflicts: [],
    });
  });

  it('adds one managed musical-settings line without changing the rest of the prompt', () => {
    expect(applyMusicalSettings('warm synth pop\nMusical settings: Key: D Minor; Tempo: 120 BPM.', {
      key: 'C Major', tempo: 160, timeSignature: '4/4',
    })).toBe('warm synth pop\nMusical settings: Key: C Major; Tempo: 160 BPM; Time signature: 4/4.');
  });

  it('leaves the rest of the prompt alone when it first adds the managed line', () => {
    expect(applyMusicalSettings('  intro\n\n\n\nverse  \n', { key: 'C Major' })).toBe('  intro\n\n\n\nverse\nMusical settings: Key: C Major.');
    expect(applyMusicalSettingsToPrompt('  intro\n\n\n\nverse', { key: 'C Major' })).toBe('  intro\n\n\n\nverse\nMusical settings: Key: C Major.');
    expect(applyMusicalSettings('', { key: 'C Major' })).toBe('Musical settings: Key: C Major.');
  });

  it('returns the prompt as-is when there is no managed line and nothing to add', () => {
    expect(applyMusicalSettings('  intro\n\n\n\nverse  \n', {})).toBe('  intro\n\n\n\nverse  \n');
  });

  it('decides the managed-line priority per field, not per line', () => {
    expect(detectMusicalSettings('tempo of 92 BPM\nMusical settings: Key: C Major.')).toEqual({
      key: 'C Major', tempo: 92, timeSignature: undefined, conflicts: [],
    });
  });
});

describe('musical spans', () => {
  it('locates the value only, without its "key of " prefix or " time" suffix', () => {
    expect(detectMusicalSpans('key of D Minor, 92 BPM in 3/4 time')).toMatchObject([
      { field: 'key', start: 7, end: 14, text: 'D Minor', value: 'D Minor', managed: false },
      { field: 'tempo', start: 16, end: 18, text: '92', value: 92, managed: false },
      { field: 'timeSignature', start: 26, end: 29, text: '3/4', value: '3/4', managed: false },
    ]);
  });

  it('reports one span where the prefixed and bare patterns match the same characters', () => {
    expect(detectMusicalSpans('key of D Minor, tempo of 92 BPM')).toHaveLength(2);
  });

  it('never makes a span out of an out-of-range tempo', () => {
    expect(detectMusicalSpans('999 BPM')).toEqual([]);
  });

  it('marks the spans inside the extension-managed line', () => {
    expect(detectMusicalSpans('rock, key of D Minor\nMusical settings: Key: C Major.').map((span) => span.managed)).toEqual([false, true]);
  });
});

describe('applyMusicalSettingsToPrompt', () => {
  it('rewrites the phrases the prompt states, leaving no managed line', () => {
    expect(applyMusicalSettingsToPrompt('orchestral rock, key of D Minor, tempo of 92 BPM in 3/4 time', {
      key: 'F Minor', tempo: 92, timeSignature: '3/4',
    })).toBe('orchestral rock, key of F Minor, tempo of 92 BPM in 3/4 time');
    expect(applyMusicalSettingsToPrompt('orchestral rock, key of D Minor, tempo of 92 BPM in 3/4 time', {
      key: 'D Minor', tempo: 120, timeSignature: '6/8',
    })).toBe('orchestral rock, key of D Minor, tempo of 120 BPM in 6/8 time');
  });

  it('rewrites every place the same phrase appears, each in its own notation', () => {
    expect(applyMusicalSettingsToPrompt('key of D Minor. Later, in D Minor again (key: D minor)', { key: 'F Minor' }))
      .toBe('key of F Minor. Later, in F Minor again (key: F minor)');
  });

  it('keeps the original notation: Japanese, ♯/♭, case, and spacing', () => {
    expect(applyMusicalSettingsToPrompt('キーはE♭マイナー、テンポは92 BPM、3/4拍子です。', { key: 'F# Major', tempo: 160, timeSignature: '6/8' }))
      .toBe('キーはF♯メジャー、テンポは160 BPM、6/8拍子です。');
    expect(applyMusicalSettingsToPrompt('d minor', { key: 'F Major' })).toBe('f major');
    expect(applyMusicalSettingsToPrompt('キーはC長調', { key: 'A Minor' })).toBe('キーはA短調');
    expect(applyMusicalSettingsToPrompt('key of Bb MAJOR, 3 / 4 time', { key: 'E Minor', timeSignature: '6/8' }))
      .toBe('key of E MINOR, 6 / 8 time');
  });

  it('reads back as the requested settings after a rewrite', () => {
    const settings = { key: 'F# Major', tempo: 160, timeSignature: '6/8' };
    for (const prompt of ['キーはE♭マイナー、テンポは92 BPM、3/4拍子です。', 'key of Bb minor, tempo of 92 BPM in 3 / 4 time']) {
      expect(detectMusicalSettings(applyMusicalSettingsToPrompt(prompt, settings))).toEqual({ ...settings, conflicts: [] });
    }
  });

  it('puts only the fields the prompt does not state into the managed line', () => {
    const next = applyMusicalSettingsToPrompt('moody, key of D Minor', { key: 'F Minor', tempo: 160 });
    expect(next).toBe('moody, key of F Minor\nMusical settings: Tempo: 160 BPM.');
    expect(detectMusicalSettings(next)).toEqual({ key: 'F Minor', tempo: 160, timeSignature: undefined, conflicts: [] });
  });

  it('adds a managed line when the prompt states nothing', () => {
    expect(applyMusicalSettingsToPrompt('gentle acoustic ensemble', { key: 'C Major', tempo: 160, timeSignature: '4/4' }))
      .toBe('gentle acoustic ensemble\nMusical settings: Key: C Major; Tempo: 160 BPM; Time signature: 4/4.');
  });

  it('drops an unset field from the managed line but never deletes prose', () => {
    expect(applyMusicalSettingsToPrompt('key of D Minor\nMusical settings: Tempo: 160 BPM.', {})).toBe('key of D Minor');
    expect(applyMusicalSettingsToPrompt('rock\nMusical settings: Key: C Major; Tempo: 160 BPM.', { key: 'C Major' }))
      .toBe('rock\nMusical settings: Key: C Major.');
    expect(applyMusicalSettingsToPrompt('rock\nMusical settings: Key: C Major; Tempo: 160 BPM.', {})).toBe('rock');
  });

  it('returns the prompt untouched when nothing would change', () => {
    expect(applyMusicalSettingsToPrompt('rock, key of D Minor  ', { key: 'D Minor' })).toBe('rock, key of D Minor  ');
  });

  it('updates only the managed line when an older build left the same field in both places', () => {
    expect(applyMusicalSettingsToPrompt('key of D Minor, tempo of 90 BPM\nMusical settings: Key: C Major; Tempo: 160 BPM; Time signature: 4/4.', {
      key: 'A Minor', tempo: 160, timeSignature: '4/4',
    })).toBe('key of D Minor, tempo of 90 BPM\nMusical settings: Key: A Minor; Tempo: 160 BPM; Time signature: 4/4.');
  });

  it('resolves conflicting prose by rewriting every phrase to the chosen value', () => {
    expect(applyMusicalSettingsToPrompt('key of C Major, then key of D Minor', { key: 'E Minor' }))
      .toBe('key of E Minor, then key of E Minor');
  });
});

describe('deriveStyleSelection', () => {
  const mastering: MasteringPrompt = { id: 'm', name: 'Master', prompt: 'master', createdAt: '', updatedAt: '' };
  const cityPop = { id: 's1', name: 'City Pop', prompt: '80s city pop' };
  const jazz = { id: 's2', name: 'Jazz', prompt: 'smooth jazz' };

  it('keeps both selections while the text still matches them', () => {
    expect(deriveStyleSelection('80s city pop\nmaster', [cityPop, jazz], { style: cityPop, mastering })).toEqual({
      base: '80s city pop', style: cityPop, mastering, isCustomStyle: false,
    });
  });

  it('keeps a saved-style selection when it has an extension-managed musical-settings line', () => {
    expect(deriveStyleSelection('80s city pop\nMusical settings: Key: C Major; Tempo: 160 BPM.', [cityPop, jazz], { style: cityPop })).toMatchObject({
      base: '80s city pop\nMusical settings: Key: C Major; Tempo: 160 BPM.', style: cityPop, isCustomStyle: false,
    });
  });

  describe('musical phrases in the style', () => {
    const keyed = { id: 's3', name: 'Keyed', prompt: 'orchestral rock, key of D Minor, tempo of 92 BPM' };
    const rewritten = 'orchestral rock, key of F Minor, tempo of 120 BPM';

    it('keeps the saved style selected after its key and tempo were rewritten', () => {
      expect(deriveStyleSelection(rewritten, [cityPop, keyed], { style: keyed })).toEqual({
        base: rewritten, style: keyed, mastering: undefined, isCustomStyle: false,
      });
    });

    it('adopts a saved style that matches apart from its musical phrases', () => {
      expect(deriveStyleSelection(rewritten, [cityPop, keyed], {})).toMatchObject({ style: keyed, isCustomStyle: false });
    });

    it('still marks a real text edit as custom', () => {
      const edited = deriveStyleSelection('orchestral pop, key of F Minor, tempo of 120 BPM', [keyed], { style: keyed });
      expect(edited.isCustomStyle).toBe(true);
      expect(edited.style).toBeUndefined();
    });

    it('keeps a rewritten phrase, not the saved wording, when only the mastering text was edited', () => {
      expect(deriveStyleSelection('orchestral rock, key of F Minor, tempo of 92 BPM\nmaster X', [keyed], { style: keyed, mastering })).toEqual({
        base: 'orchestral rock, key of F Minor, tempo of 92 BPM', style: keyed, mastering: undefined, isCustomStyle: false,
      });
    });
  });

  it('marks edited text as custom but keeps the mastering while its suffix remains', () => {
    expect(deriveStyleSelection('my own style\nmaster', [cityPop], { style: cityPop, mastering })).toEqual({
      base: 'my own style', style: undefined, mastering, isCustomStyle: true,
    });
  });

  it('keeps the style but unselects the mastering while only the mastering text is edited', () => {
    const edited = deriveStyleSelection('80s city pop\nwarm master X', [cityPop], { style: cityPop, mastering });
    expect(edited).toEqual({ base: '80s city pop', style: cityPop, mastering: undefined, isCustomStyle: false });
    const deleted = deriveStyleSelection('80s city pop', [cityPop], { style: cityPop, mastering });
    expect(deleted.mastering).toBeUndefined();
    expect(deleted.style).toBe(cityPop);
  });

  it('re-selects the remembered mastering once its text matches again', () => {
    const restored = deriveStyleSelection('80s city pop\nmaster', [cityPop], { style: cityPop, rememberedMastering: mastering });
    expect(restored).toEqual({ base: '80s city pop', style: cityPop, mastering, isCustomStyle: false });
  });

  it('goes custom when both the style and mastering parts no longer match', () => {
    const result = deriveStyleSelection('other\nedited', [cityPop], { style: cityPop, rememberedMastering: mastering });
    expect(result).toEqual({ base: 'other\nedited', style: undefined, mastering: undefined, isCustomStyle: true });
  });

  it('adopts the saved style whose prompt now matches exactly (e.g. after reusing a prompt)', () => {
    expect(deriveStyleSelection('smooth jazz', [cityPop, jazz], { style: cityPop })).toMatchObject({
      style: jazz, isCustomStyle: false,
    });
  });

  it('falls back to unselected, not custom, for empty text', () => {
    expect(deriveStyleSelection('', [cityPop], { style: cityPop })).toEqual({
      base: '', style: undefined, mastering: undefined, isCustomStyle: false,
    });
    expect(deriveStyleSelection('master', [cityPop], { style: cityPop, mastering })).toEqual({
      base: '', style: undefined, mastering, isCustomStyle: false,
    });
  });
});

describe('optionFieldsMatch', () => {
  const capture = (overrides: Partial<OtherOptionsSnapshot> = {}, unreadable: OtherOptionsKey[] = []) => ({
    snapshot: { ...emptyOtherOptions(), weirdness: 70, vocalGender: 'female' as const, ...overrides },
    unreadable,
  });

  it('matches when every stored field equals the live value, ignoring fields the preset does not store', () => {
    expect(optionFieldsMatch({ weirdness: 70, vocalGender: 'female' }, capture())).toBe(true);
    expect(optionFieldsMatch({}, capture())).toBe(true);
  });

  it('does not match once a stored field was changed by hand', () => {
    expect(optionFieldsMatch({ weirdness: 70 }, capture({ weirdness: 71 }))).toBe(false);
    expect(optionFieldsMatch({ vocalGender: 'female' }, capture({ vocalGender: 'male' }))).toBe(false);
    expect(optionFieldsMatch({ maxMode: true }, capture({ maxMode: false }))).toBe(false);
    expect(optionFieldsMatch({ excludedStyles: 'rock ' }, capture({ excludedStyles: 'pop' }))).toBe(false);
    expect(optionFieldsMatch({ personalization: { enabled: true } }, capture())).toBe(false);
  });

  it('compares duration seconds only for a custom duration', () => {
    expect(optionFieldsMatch({ duration: { mode: 'auto' } }, capture({ duration: { mode: 'auto', seconds: 90 } }))).toBe(true);
    expect(optionFieldsMatch({ duration: { mode: 'custom', seconds: 120 } }, capture({ duration: { mode: 'custom', seconds: 90 } }))).toBe(false);
    expect(optionFieldsMatch({ duration: { mode: 'custom', seconds: 120 } }, capture({ duration: { mode: 'custom', seconds: 120 } }))).toBe(true);
  });

  it('never holds unreadable or ignored fields against the preset', () => {
    expect(optionFieldsMatch({ weirdness: 10 }, capture(), new Set(['weirdness']))).toBe(true);
    expect(optionFieldsMatch({ audioInfluence: 10 }, capture({}, ['audioInfluence']))).toBe(true);
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

describe('option field summaries', () => {
  const ui = getUiMessages('ja');

  it('renders one label: value line per present field, in optionKeys order, skipping absent ones', () => {
    const lines = optionFieldSummaryLines({ weirdness: 70, maxMode: true }, ui);
    expect(lines).toEqual(['Maxモード: オン', '奇抜さ: 70%']);
  });

  it('returns no lines for an empty snapshot', () => {
    expect(optionFieldSummaryLines({}, ui)).toEqual([]);
  });

  it('joins the same lines with " / " for the preset summary string', () => {
    expect(formatPreset({ weirdness: 70, maxMode: true }, ui)).toBe('Maxモード: オン / 奇抜さ: 70%');
  });
});
