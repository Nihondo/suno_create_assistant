import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_STYLE_SOURCE, DEFAULT_TAKE_HISTORY_LIMIT, type TakeRecord } from '../src/domain/models';
import {
  appendTakeRecord,
  clearTakeHistory,
  deleteCustomStyle,
  deleteTakeRecord,
  exportBackup,
  findTakeByClipId,
  findUnlinkedTakeRecords,
  getNextTakeNumber,
  getTakeHistoryLimit,
  linkTakeToClips,
  parseBackup,
  readStorage,
  replaceStorage,
  saveCustomStyle,
  setStyleSource,
  setTakeHistoryLimit,
  subscribeStorage,
  writeStorage,
} from '../src/storage/repository';

const STORAGE_KEY = 'sunoCreateAssistant';

function mockChrome(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => { Object.assign(store, items); },
      },
      onChanged: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
  } as unknown as typeof chrome;
  return store;
}

const takeInput: Omit<TakeRecord, 'id' | 'createdAt'> = {
  title: 'My Song {{TAKE}}',
  stylePrompt: 'lofi chill',
  options: { weirdness: 40 },
  unreadable: [],
  clipIds: [],
};

describe('storage schema migration', () => {
  beforeEach(() => {
    mockChrome();
  });

  it('migrates v1 data to v2, adding takeHistory while preserving existing fields', async () => {
    mockChrome({
      [STORAGE_KEY]: {
        schemaVersion: 1,
        masteringPrompts: [{ id: 'm1', name: 'Warm', prompt: 'warm master', createdAt: '', updatedAt: '' }],
        optionPresets: [],
        autoTitleEnabled: true,
        titleFormat: '{{WORKSPACE}}',
        takeNumbers: { foo: 3 },
        closeDisclosuresOnAdvanced: false,
        lyricsTags: ['[Intro]'],
      },
    });

    const result = await readStorage();
    expect(result.schemaVersion).toBe(2);
    expect(result.masteringPrompts).toHaveLength(1);
    expect(result.masteringPrompts[0]!.name).toBe('Warm');
    expect(result.autoTitleEnabled).toBe(true);
    expect(result.titleFormat).toBe('{{WORKSPACE}}');
    expect(result.takeNumbers).toEqual({ foo: 3 });
    expect(result.closeDisclosuresOnAdvanced).toBe(false);
    expect(result.lyricsTags).toEqual(['[Intro]']);
    expect(result.takeHistory).toEqual([]);
    // v1 data predates customStyles/styleSource entirely; readStorage() must
    // fall back to empty/default rather than treating their absence as
    // reason to reset the rest of the migrated data.
    expect(result.customStyles).toEqual([]);
    expect(result.styleSource).toBe(DEFAULT_STYLE_SOURCE);
  });

  it('does not reset an unknown future schema version, preserving its fields', async () => {
    mockChrome({
      [STORAGE_KEY]: {
        schemaVersion: 99,
        masteringPrompts: [],
        optionPresets: [],
        autoTitleEnabled: false,
        takeHistory: [],
        someFutureField: 'kept',
      },
    });

    const result = await readStorage();
    expect(result.schemaVersion).toBe(99);
    expect((result as unknown as { someFutureField: string }).someFutureField).toBe('kept');
  });

  it('falls back to defaults when the stored value does not match any known schema shape', async () => {
    mockChrome({ [STORAGE_KEY]: { garbage: true } });
    const result = await readStorage();
    expect(result.schemaVersion).toBe(2);
    expect(result.takeHistory).toEqual([]);
  });

  it('falls back to defaults when nothing is stored yet', async () => {
    const result = await readStorage();
    expect(result.schemaVersion).toBe(2);
    expect(result.masteringPrompts).toEqual([]);
  });
});

describe('extension-context invalidation', () => {
  it('uses defaults and does not reject when a stale content script loses storage access', async () => {
    globalThis.chrome = {
      storage: {
        local: {
          get: async () => { throw new Error('Extension context invalidated.'); },
          set: async () => { throw new Error('Extension context invalidated.'); },
        },
        onChanged: {
          addListener: () => { throw new Error('Extension context invalidated.'); },
          removeListener: () => { throw new Error('Extension context invalidated.'); },
        },
      },
    } as unknown as typeof chrome;

    await expect(readStorage()).resolves.toMatchObject({ schemaVersion: 2, takeHistory: [] });
    await expect(writeStorage({
      schemaVersion: 2, masteringPrompts: [], optionPresets: [], autoTitleEnabled: false,
      titleFormat: '{{WORKSPACE}}', takeNumbers: {}, closeDisclosuresOnAdvanced: true,
      lyricsTags: [], takeHistory: [], takeHistoryLimit: 500,
    })).resolves.toBeUndefined();
    expect(() => subscribeStorage(() => {})).not.toThrow();
  });
});

describe('take history', () => {
  beforeEach(() => {
    mockChrome();
  });

  it('appends records newest-first and enforces the configured limit', async () => {
    await setTakeHistoryLimit(2);
    await appendTakeRecord({ ...takeInput, title: 'First' });
    await appendTakeRecord({ ...takeInput, title: 'Second' });
    await appendTakeRecord({ ...takeInput, title: 'Third' });

    const stored = await readStorage();
    expect(stored.takeHistory.map((r) => r.title)).toEqual(['Third', 'Second']);
  });

  it('links a record to clip ids and finds it by clip id', async () => {
    const record = await appendTakeRecord(takeInput);
    expect(record.clipIds).toEqual([]);

    await linkTakeToClips(record.id, ['song-1', 'song-2']);
    const found = await findTakeByClipId('song-2');
    expect(found?.id).toBe(record.id);
    expect(found?.clipIds).toEqual(['song-1', 'song-2']);
    expect(found?.linkedAt).toBeDefined();
  });

  it('returns only unlinked or partially-linked records for the clip-linker to consider', async () => {
    const fullyLinked = await appendTakeRecord({ ...takeInput, title: 'Fully Linked' });
    const partiallyLinked = await appendTakeRecord({ ...takeInput, title: 'Partially Linked' });
    await appendTakeRecord({ ...takeInput, title: 'Unlinked' });
    await linkTakeToClips(fullyLinked.id, ['song-1', 'song-2']);
    await linkTakeToClips(partiallyLinked.id, ['song-3']);

    const pending = await findUnlinkedTakeRecords();
    expect(pending).toHaveLength(2);
    expect(pending.map((r) => r.title)).toEqual(['Unlinked', 'Partially Linked']);
  });

  it('deletes a single record and clears the whole history', async () => {
    const a = await appendTakeRecord({ ...takeInput, title: 'A' });
    await appendTakeRecord({ ...takeInput, title: 'B' });

    await deleteTakeRecord(a.id);
    let stored = await readStorage();
    expect(stored.takeHistory.map((r) => r.title)).toEqual(['B']);

    await clearTakeHistory();
    stored = await readStorage();
    expect(stored.takeHistory).toEqual([]);
  });

  it('defaults the history limit when not configured and returns via getTakeHistoryLimit', async () => {
    const stored = await readStorage();
    expect(stored.takeHistoryLimit).toBe(DEFAULT_TAKE_HISTORY_LIMIT);
    const limit = await getTakeHistoryLimit();
    expect(limit).toBe(DEFAULT_TAKE_HISTORY_LIMIT);

    await setTakeHistoryLimit(200);
    expect(await getTakeHistoryLimit()).toBe(200);
  });
});

describe('custom styles', () => {
  beforeEach(() => {
    mockChrome();
  });

  it('creates a new custom style and sorts the list by name', async () => {
    await saveCustomStyle({ name: 'Zeta', prompt: 'zeta prompt' });
    await saveCustomStyle({ name: 'Alpha', prompt: 'alpha prompt' });

    const stored = await readStorage();
    expect(stored.customStyles?.map((item) => item.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('updates an existing custom style in place, preserving createdAt', async () => {
    const created = await saveCustomStyle({ name: 'Lo-fi', prompt: 'lofi v1' });
    const updated = await saveCustomStyle({ id: created.id, name: 'Lo-fi', prompt: 'lofi v2' });

    expect(updated.createdAt).toBe(created.createdAt);
    const stored = await readStorage();
    expect(stored.customStyles).toHaveLength(1);
    expect(stored.customStyles?.[0]?.prompt).toBe('lofi v2');
  });

  it('deletes a custom style', async () => {
    const created = await saveCustomStyle({ name: 'Lo-fi', prompt: 'lofi' });
    await deleteCustomStyle(created.id);

    const stored = await readStorage();
    expect(stored.customStyles).toEqual([]);
  });

  it('defaults styleSource to merged and persists a change', async () => {
    expect((await readStorage()).styleSource).toBe(DEFAULT_STYLE_SOURCE);

    await setStyleSource('custom');
    expect((await readStorage()).styleSource).toBe('custom');
  });
});

describe('concurrent storage writes', () => {
  beforeEach(() => {
    mockChrome();
  });

  // Regression test for a lost-update race: appendTakeRecord() (fired on
  // every Create submission) and linkTakeToClips() (fired on every
  // refreshMounts() cycle by the clip-button sync) both go through
  // updateStorage()'s read-modify-write cycle. Before updateStorage()
  // serialized its callers via writeQueue, two overlapping calls like these
  // would each read the same pre-write snapshot and the one that wrote last
  // would silently discard the other's change.
  it('does not lose a write when appendTakeRecord and linkTakeToClips race', async () => {
    const seeded = await appendTakeRecord({ ...takeInput, title: 'Seed' });

    const [appended] = await Promise.all([
      appendTakeRecord({ ...takeInput, title: 'Second' }),
      linkTakeToClips(seeded.id, ['song-1']),
    ]);

    const stored = await readStorage();
    expect(stored.takeHistory).toHaveLength(2);
    expect(stored.takeHistory.some((r) => r.title === 'Second')).toBe(true);
    expect(stored.takeHistory.find((r) => r.id === seeded.id)?.clipIds).toEqual(['song-1']);
    expect(appended.title).toBe('Second');
  });

  it('serializes overlapping take-number increments for the same key without dropping any', async () => {
    const numbers = await Promise.all([
      getNextTakeNumber('same-key'),
      getNextTakeNumber('same-key'),
      getNextTakeNumber('same-key'),
    ]);

    expect(numbers.sort((a, b) => a - b)).toEqual([1, 2, 3]);
    const stored = await readStorage();
    expect(stored.takeNumbers?.['same-key']).toBe(3);
  });

  it('keeps both keys when incrementing take numbers for two different keys concurrently', async () => {
    const [a, b] = await Promise.all([getNextTakeNumber('a'), getNextTakeNumber('b')]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    const stored = await readStorage();
    expect(stored.takeNumbers).toEqual({ a: 1, b: 1 });
  });
});

describe('backup export/import', () => {
  beforeEach(() => {
    mockChrome();
  });

  it('includes custom styles and the style source in the export', async () => {
    await saveCustomStyle({ name: 'Lo-fi', prompt: 'lofi' });
    await setStyleSource('suno');

    const backup = await exportBackup(false);
    expect(backup.customStyles?.map((item) => item.name)).toEqual(['Lo-fi']);
    expect(backup.styleSource).toBe('suno');
  });

  it('excludes take history from the export when requested', async () => {
    await appendTakeRecord(takeInput);
    const withHistory = await exportBackup(true);
    expect(withHistory.takeHistory).toHaveLength(1);

    const withoutHistory = await exportBackup(false);
    expect(withoutHistory.takeHistory).toEqual([]);
  });

  it('parses and migrates a v1 backup file, rejecting invalid JSON', async () => {
    const v1Backup = JSON.stringify({
      schemaVersion: 1,
      masteringPrompts: [],
      optionPresets: [],
      autoTitleEnabled: false,
    });
    const parsed = parseBackup(v1Backup);
    expect(parsed?.schemaVersion).toBe(2);
    expect(parsed?.takeHistory).toEqual([]);

    expect(parseBackup('not json')).toBeUndefined();
    expect(parseBackup('{"not":"a schema"}')).toBeUndefined();
  });

  it('replaceStorage overwrites the entire stored schema', async () => {
    await appendTakeRecord(takeInput);
    const backup = await exportBackup(false);
    await replaceStorage({ ...backup, autoTitleEnabled: true });

    const result = await readStorage();
    expect(result.autoTitleEnabled).toBe(true);
    expect(result.takeHistory).toEqual([]);
  });
});
