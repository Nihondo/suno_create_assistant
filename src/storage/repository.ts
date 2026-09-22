import { DEFAULT_TITLE_FORMAT } from '../domain/logic';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_LYRICS_TAGS,
  DEFAULT_STYLE_SOURCE,
  DEFAULT_TAKE_HISTORY_LIMIT,
  EXPECTED_CLIPS_PER_TAKE,
  type CustomStyle,
  type MasteringPrompt,
  type OtherOptionsPreset,
  type StorageSchema,
  type StyleSource,
  type TakeRecord,
} from '../domain/models';

const STORAGE_KEY = 'sunoCreateAssistant';

function isContextInvalidated(error: unknown): boolean {
  return error instanceof Error && /extension context invalidated/i.test(error.message);
}

/**
 * Chrome invalidates content scripts that belong to an extension version
 * which has just been reloaded or updated. Accessing `chrome.storage` from
 * one of those stale scripts throws synchronously, so treat its absence as a
 * read-only shutdown state rather than letting a pending UI task crash.
 */
function extensionStorage(): typeof chrome.storage | undefined {
  try {
    return typeof chrome === 'undefined' ? undefined : chrome.storage;
  } catch {
    return undefined;
  }
}

const defaults = (): StorageSchema => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  masteringPrompts: [],
  optionPresets: [],
  autoTitleEnabled: false,
  titleFormat: DEFAULT_TITLE_FORMAT,
  takeNumbers: {},
  closeDisclosuresOnAdvanced: true,
  lyricsTags: [...DEFAULT_LYRICS_TAGS],
  takeHistory: [],
  takeHistoryLimit: DEFAULT_TAKE_HISTORY_LIMIT,
  customStyles: [],
  styleSource: DEFAULT_STYLE_SOURCE,
});

function isStyleSource(value: unknown): value is StyleSource {
  return value === 'merged' || value === 'custom' || value === 'suno';
}

// The minimal shape shared by every schema version so far - fields present
// since v1 that every migration step is required to carry forward.
interface KnownStorageShape {
  schemaVersion: number;
  masteringPrompts: unknown;
  optionPresets: unknown;
  autoTitleEnabled: unknown;
}

function isKnownStorageShape(value: unknown): value is KnownStorageShape {
  return !!value && typeof value === 'object'
    && typeof (value as KnownStorageShape).schemaVersion === 'number'
    && Array.isArray((value as KnownStorageShape).masteringPrompts)
    && Array.isArray((value as KnownStorageShape).optionPresets)
    && typeof (value as KnownStorageShape).autoTitleEnabled === 'boolean';
}

// One step per version, keyed by the version it upgrades *from*. Each step
// must only add/rename fields - never drop data the user already has.
const migrations: Record<number, (value: Record<string, unknown>) => Record<string, unknown>> = {
  1: (value) => ({ ...value, schemaVersion: 2, takeHistory: [] }),
};

// Walks a possibly-stale (or possibly-future) stored value up to the current
// schema version. A version older than CURRENT is migrated step by step. A
// version *newer* than CURRENT (written by a future build of the extension)
// is deliberately passed through unchanged rather than reset to defaults -
// resetting it would silently destroy a newer install's data the moment an
// older build (or a downgrade) reads it. Returns undefined only when the
// value does not even match the shape every known version shares, e.g. it
// is missing, corrupted, or predates schemaVersion entirely.
function migrate(value: unknown): StorageSchema | undefined {
  if (!isKnownStorageShape(value)) return undefined;
  let current: Record<string, unknown> = value as unknown as Record<string, unknown>;
  while (typeof current.schemaVersion === 'number' && current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const step = migrations[current.schemaVersion as number];
    if (!step) break; // no known path forward - stop migrating, keep what we have
    current = step(current);
  }
  return current as unknown as StorageSchema;
}

export async function readStorage(): Promise<StorageSchema> {
  const storage = extensionStorage();
  if (!storage) return defaults();
  let value: unknown;
  try {
    value = (await storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  } catch (error) {
    if (isContextInvalidated(error)) return defaults();
    throw error;
  }
  const migrated = migrate(value);
  if (!migrated) return defaults();
  return {
    ...defaults(),
    ...migrated,
    titleFormat: migrated.titleFormat || DEFAULT_TITLE_FORMAT,
    takeNumbers: migrated.takeNumbers ?? {},
    closeDisclosuresOnAdvanced: migrated.closeDisclosuresOnAdvanced ?? true,
    lyricsTags: Array.isArray(migrated.lyricsTags) ? migrated.lyricsTags : [...DEFAULT_LYRICS_TAGS],
    takeHistory: Array.isArray(migrated.takeHistory) ? migrated.takeHistory : [],
    takeHistoryLimit: migrated.takeHistoryLimit ?? DEFAULT_TAKE_HISTORY_LIMIT,
    customStyles: Array.isArray(migrated.customStyles) ? migrated.customStyles : [],
    styleSource: isStyleSource(migrated.styleSource) ? migrated.styleSource : DEFAULT_STYLE_SOURCE,
  };
}

export async function writeStorage(next: StorageSchema): Promise<void> {
  const storage = extensionStorage();
  if (!storage) return;
  try {
    await storage.local.set({ [STORAGE_KEY]: next });
  } catch (error) {
    if (isContextInvalidated(error)) return;
    throw error;
  }
}

// Every storage mutation (updateStorage and replaceStorage below) is chained
// onto this single promise rather than run independently. Without this, two
// callers racing a read-modify-write cycle - e.g. appendTakeRecord() from a
// Create submission and linkTakeToClips() from the clip-button sync that
// runs on every refreshMounts() cycle - could both read the same pre-write
// snapshot and then each write back their own version, silently discarding
// whichever finished last. Chaining onto writeQueue forces every caller's
// readStorage() to wait until the previous caller's writeStorage() has
// actually completed, closing that window entirely.
let writeQueue: Promise<unknown> = Promise.resolve();

export async function updateStorage(mutator: (current: StorageSchema) => StorageSchema): Promise<StorageSchema> {
  const run = writeQueue.then(async () => {
    const next = mutator(await readStorage());
    await writeStorage(next);
    return next;
  });
  // Swallow here (not on `run`, which callers still observe) so one
  // caller's rejected mutation doesn't permanently wedge the queue for
  // every mutation queued after it.
  writeQueue = run.catch(() => undefined);
  return run;
}

// Replaces the entire stored schema, e.g. from an imported backup file.
// Callers are responsible for passing something that has already been
// through `migrate()` (see importBackup in this module) so a backup saved
// by an older build of the extension is upgraded, not written back as-is.
// Chained onto the same writeQueue as updateStorage() so a full-replace
// import can't race an in-flight mutation from elsewhere.
export async function replaceStorage(next: StorageSchema): Promise<void> {
  const run = writeQueue.then(() => writeStorage(next));
  writeQueue = run.catch(() => undefined);
  return run;
}

// Parses and migrates a JSON backup (as produced by exportBackup) without
// writing it. Returns undefined if the content does not match any known
// schema shape, so callers can show an error instead of silently wiping the
// user's current settings.
export function parseBackup(json: string): StorageSchema | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  return migrate(parsed);
}

export async function exportBackup(includeTakeHistory = true): Promise<StorageSchema> {
  const current = await readStorage();
  return includeTakeHistory ? current : { ...current, takeHistory: [] };
}

export async function setAutoTitleEnabled(autoTitleEnabled: boolean): Promise<void> {
  await updateStorage((current) => ({ ...current, autoTitleEnabled }));
}

export async function getCloseDisclosuresOnAdvanced(): Promise<boolean> {
  return (await readStorage()).closeDisclosuresOnAdvanced ?? true;
}

export async function setCloseDisclosuresOnAdvanced(closeDisclosuresOnAdvanced: boolean): Promise<void> {
  await updateStorage((current) => ({ ...current, closeDisclosuresOnAdvanced }));
}

export async function getTitleFormat(): Promise<string> {
  return (await readStorage()).titleFormat ?? DEFAULT_TITLE_FORMAT;
}

export async function saveTitleFormat(titleFormat: string): Promise<void> {
  await updateStorage((current) => ({ ...current, titleFormat }));
}

export async function getLyricsTags(): Promise<string[]> {
  return (await readStorage()).lyricsTags ?? [...DEFAULT_LYRICS_TAGS];
}

export async function saveLyricsTags(lyricsTags: string[]): Promise<void> {
  await updateStorage((current) => ({ ...current, lyricsTags }));
}

export async function getNextTakeNumber(key: string): Promise<number> {
  let nextTake = 1;
  await updateStorage((current) => {
    const takes = current.takeNumbers ?? {};
    const currentTake = takes[key] ?? 0;
    nextTake = currentTake + 1;
    return {
      ...current,
      takeNumbers: {
        ...takes,
        [key]: nextTake,
      },
    };
  });
  return nextTake;
}

export async function getTakeNumber(key: string): Promise<number> {
  const current = await readStorage();
  return current.takeNumbers?.[key] ?? 0;
}

export async function resetTakeNumber(key: string): Promise<void> {
  await updateStorage((current) => {
    const takes = { ...(current.takeNumbers ?? {}) };
    delete takes[key];
    return { ...current, takeNumbers: takes };
  });
}

export async function saveMastering(input: Omit<MasteringPrompt, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<MasteringPrompt> {
  const now = new Date().toISOString();
  const entry: MasteringPrompt = input.id
    ? { ...input, id: input.id, createdAt: now, updatedAt: now }
    : { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await updateStorage((current) => {
    const existing = current.masteringPrompts.find((item) => item.id === entry.id);
    const next = existing ? { ...entry, createdAt: existing.createdAt } : entry;
    return {
      ...current,
      masteringPrompts: [...current.masteringPrompts.filter((item) => item.id !== entry.id), next]
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
  return entry;
}

export async function deleteMastering(id: string): Promise<void> {
  await updateStorage((current) => ({ ...current, masteringPrompts: current.masteringPrompts.filter((item) => item.id !== id) }));
}

export async function saveCustomStyle(input: Omit<CustomStyle, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<CustomStyle> {
  const now = new Date().toISOString();
  const entry: CustomStyle = input.id
    ? { ...input, id: input.id, createdAt: now, updatedAt: now }
    : { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await updateStorage((current) => {
    const existing = (current.customStyles ?? []).find((item) => item.id === entry.id);
    const next = existing ? { ...entry, createdAt: existing.createdAt } : entry;
    return {
      ...current,
      customStyles: [...(current.customStyles ?? []).filter((item) => item.id !== entry.id), next]
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
  return entry;
}

export async function deleteCustomStyle(id: string): Promise<void> {
  await updateStorage((current) => ({ ...current, customStyles: (current.customStyles ?? []).filter((item) => item.id !== id) }));
}

export async function setStyleSource(styleSource: StyleSource): Promise<void> {
  await updateStorage((current) => ({ ...current, styleSource }));
}

export async function savePreset(input: Omit<OtherOptionsPreset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<OtherOptionsPreset> {
  const now = new Date().toISOString();
  const entry: OtherOptionsPreset = input.id
    ? { ...input, id: input.id, createdAt: now, updatedAt: now }
    : { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  await updateStorage((current) => {
    const existing = current.optionPresets.find((item) => item.id === entry.id);
    const next = existing ? { ...entry, createdAt: existing.createdAt } : entry;
    return {
      ...current,
      optionPresets: [...current.optionPresets.filter((item) => item.id !== entry.id), next]
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
  return entry;
}

export async function deletePreset(id: string): Promise<void> {
  await updateStorage((current) => ({ ...current, optionPresets: current.optionPresets.filter((item) => item.id !== id) }));
}

export async function appendTakeRecord(input: Omit<TakeRecord, 'id' | 'createdAt'>): Promise<TakeRecord> {
  const entry: TakeRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await updateStorage((current) => {
    const limit = current.takeHistoryLimit ?? DEFAULT_TAKE_HISTORY_LIMIT;
    // Newest first; drop the oldest once over the limit.
    const takeHistory = [entry, ...current.takeHistory].slice(0, Math.max(0, limit));
    return { ...current, takeHistory };
  });
  return entry;
}

export async function linkTakeToClips(id: string, clipIds: string[]): Promise<void> {
  await updateStorage((current) => ({
    ...current,
    takeHistory: current.takeHistory.map((record) => (record.id === id
      ? { ...record, clipIds: [...new Set([...record.clipIds, ...clipIds])], linkedAt: new Date().toISOString() }
      : record)),
  }));
}

export async function findUnlinkedTakeRecords(): Promise<TakeRecord[]> {
  const current = await readStorage();
  return current.takeHistory.filter((record) => record.clipIds.length < EXPECTED_CLIPS_PER_TAKE);
}

export async function getTakeHistoryLimit(): Promise<number> {
  const current = await readStorage();
  return current.takeHistoryLimit ?? DEFAULT_TAKE_HISTORY_LIMIT;
}

export async function findTakeByClipId(clipId: string): Promise<TakeRecord | undefined> {
  const current = await readStorage();
  return current.takeHistory.find((record) => record.clipIds.includes(clipId));
}

export async function deleteTakeRecord(id: string): Promise<void> {
  await updateStorage((current) => ({ ...current, takeHistory: current.takeHistory.filter((record) => record.id !== id) }));
}

export async function clearTakeHistory(): Promise<void> {
  await updateStorage((current) => ({ ...current, takeHistory: [] }));
}

export async function setTakeHistoryLimit(limit: number): Promise<void> {
  const clamped = Math.max(0, Math.floor(limit));
  await updateStorage((current) => ({
    ...current,
    takeHistoryLimit: clamped,
    takeHistory: current.takeHistory.slice(0, clamped),
  }));
}

export function subscribeStorage(listener: () => void): () => void {
  const storage = extensionStorage();
  if (!storage) return () => {};
  const handler = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'local' && changes[STORAGE_KEY]) listener();
  };
  try {
    storage.onChanged.addListener(handler);
  } catch (error) {
    if (isContextInvalidated(error)) return () => {};
    throw error;
  }
  return () => {
    try {
      storage.onChanged.removeListener(handler);
    } catch (error) {
      if (!isContextInvalidated(error)) throw error;
    }
  };
}
