import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TAKE_HISTORY_LIMIT, type TakeRecord } from '../src/domain/models';
import {
  appendTakeRecord,
  clearTakeHistory,
  deleteTakeRecord,
  exportBackup,
  findTakeByClipId,
  findUnlinkedTakeRecords,
  linkTakeToClips,
  parseBackup,
  readStorage,
  replaceStorage,
  setTakeHistoryLimit,
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

  it('returns only unlinked records for the clip-linker to consider', async () => {
    const linked = await appendTakeRecord({ ...takeInput, title: 'Linked' });
    await appendTakeRecord({ ...takeInput, title: 'Unlinked' });
    await linkTakeToClips(linked.id, ['song-1']);

    const unlinked = await findUnlinkedTakeRecords();
    expect(unlinked).toHaveLength(1);
    expect(unlinked[0]!.title).toBe('Unlinked');
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

  it('defaults the history limit when not configured', async () => {
    const stored = await readStorage();
    expect(stored.takeHistoryLimit).toBe(DEFAULT_TAKE_HISTORY_LIMIT);
  });
});

describe('backup export/import', () => {
  beforeEach(() => {
    mockChrome();
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
