import { DEFAULT_TITLE_FORMAT } from '../domain/logic';
import type { MasteringPrompt, OtherOptionsPreset, StorageSchemaV1 } from '../domain/models';

const STORAGE_KEY = 'sunoCreateAssistant';

const defaults = (): StorageSchemaV1 => ({
  schemaVersion: 1,
  masteringPrompts: [],
  optionPresets: [],
  autoTitleEnabled: false,
  titleFormat: DEFAULT_TITLE_FORMAT,
  takeNumbers: {},
});

function isSchema(value: unknown): value is StorageSchemaV1 {
  return !!value && typeof value === 'object' && (value as StorageSchemaV1).schemaVersion === 1
    && Array.isArray((value as StorageSchemaV1).masteringPrompts)
    && Array.isArray((value as StorageSchemaV1).optionPresets)
    && typeof (value as StorageSchemaV1).autoTitleEnabled === 'boolean';
}

export async function readStorage(): Promise<StorageSchemaV1> {
  const value = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  if (!isSchema(value)) return defaults();
  return {
    ...defaults(),
    ...value,
    titleFormat: value.titleFormat || DEFAULT_TITLE_FORMAT,
    takeNumbers: value.takeNumbers ?? {},
  };
}

export async function writeStorage(next: StorageSchemaV1): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
}

export async function updateStorage(mutator: (current: StorageSchemaV1) => StorageSchemaV1): Promise<StorageSchemaV1> {
  const next = mutator(await readStorage());
  await writeStorage(next);
  return next;
}

export async function setAutoTitleEnabled(autoTitleEnabled: boolean): Promise<void> {
  await updateStorage((current) => ({ ...current, autoTitleEnabled }));
}

export async function getTitleFormat(): Promise<string> {
  return (await readStorage()).titleFormat ?? DEFAULT_TITLE_FORMAT;
}

export async function saveTitleFormat(titleFormat: string): Promise<void> {
  await updateStorage((current) => ({ ...current, titleFormat }));
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

export function subscribeStorage(listener: () => void): () => void {
  const handler = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'local' && changes[STORAGE_KEY]) listener();
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
