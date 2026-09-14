// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TakeRecord } from '../src/domain/models';
import { readStorage, writeStorage } from '../src/storage/repository';
import { SunoAdapter } from '../src/suno/adapter';
import { createClipLinker } from '../src/suno/clip-linker';

const storageMock: Record<string, unknown> = {};
globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: storageMock[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(storageMock, items); }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
} as unknown as typeof chrome;

beforeEach(() => {
  for (const key of Object.keys(storageMock)) delete storageMock[key];
  document.body.replaceChildren();
});

async function seedTakeHistory(records: TakeRecord[]): Promise<void> {
  const current = await readStorage();
  await writeStorage({ ...current, takeHistory: records });
}

function pendingRecord(overrides: Partial<TakeRecord> & { id: string; createdAt: string; title: string }): TakeRecord {
  return {
    stylePrompt: '',
    options: {},
    unreadable: [],
    clipIds: [],
    ...overrides,
  };
}

function clipRow(songId: string, title: string): string {
  return `
    <div data-testid="clip-row" role="group" aria-label="${title}" data-clip-status="complete">
      <a href="/song/${songId}">${title}</a>
    </div>
  `;
}

describe('createClipLinker', () => {
  it('does nothing when there are no unlinked take records', async () => {
    const adapter = new SunoAdapter();
    // createClipLinker() itself calls clipRows() once, to snapshot pre-existing
    // clips (see "does not claim a clip that already existed" below) -
    // linkPendingTakes() must not call it again when there is nothing pending.
    const linker = createClipLinker(adapter);
    const clipRowsSpy = vi.spyOn(adapter, 'clipRows');

    await linker.linkPendingTakes();

    expect(clipRowsSpy).not.toHaveBeenCalled();
  });

  it('links a pending record to a clip row with a matching title that appeared after the linker started', async () => {
    await seedTakeHistory([
      pendingRecord({ id: 'r1', createdAt: '2024-01-01T00:00:00.000Z', title: 'My Song 1' }),
    ]);
    const adapter = new SunoAdapter();
    const linker = createClipLinker(adapter);

    document.body.innerHTML = clipRow('song-1', 'My Song 1');
    await linker.linkPendingTakes();

    const stored = await readStorage();
    expect(stored.takeHistory[0]!.clipIds).toEqual(['song-1']);
    expect(stored.takeHistory[0]!.linkedAt).toBeDefined();
  });

  it('does not claim a clip that already existed when the linker was created', async () => {
    // The clip is present *before* createClipLinker() snapshots the page,
    // simulating a pre-existing song that happens to share a title with a
    // later, unrelated pending record.
    document.body.innerHTML = clipRow('pre-existing', 'My Song 1');
    const adapter = new SunoAdapter();
    const linker = createClipLinker(adapter);

    await seedTakeHistory([
      pendingRecord({ id: 'r1', createdAt: '2024-01-01T00:00:00.000Z', title: 'My Song 1' }),
    ]);
    await linker.linkPendingTakes();

    const stored = await readStorage();
    expect(stored.takeHistory[0]!.clipIds).toEqual([]);
  });

  it('assigns every matching clip to the same record when one submission yields multiple clips', async () => {
    await seedTakeHistory([
      pendingRecord({ id: 'r1', createdAt: '2024-01-01T00:00:00.000Z', title: 'Twin Take' }),
    ]);
    const adapter = new SunoAdapter();
    const linker = createClipLinker(adapter);

    document.body.innerHTML = clipRow('song-a', 'Twin Take') + clipRow('song-b', 'Twin Take');
    await linker.linkPendingTakes();

    const stored = await readStorage();
    expect(stored.takeHistory[0]!.clipIds.sort()).toEqual(['song-a', 'song-b']);
  });

  it('links each of several differently-titled pending records to its own clip', async () => {
    await seedTakeHistory([
      pendingRecord({ id: 'r1', createdAt: '2024-01-01T00:00:00.000Z', title: 'Song A' }),
      pendingRecord({ id: 'r2', createdAt: '2024-01-01T00:00:01.000Z', title: 'Song B' }),
    ]);
    const adapter = new SunoAdapter();
    const linker = createClipLinker(adapter);

    document.body.innerHTML = clipRow('song-a', 'Song A') + clipRow('song-b', 'Song B');
    await linker.linkPendingTakes();

    const stored = await readStorage();
    const byId = Object.fromEntries(stored.takeHistory.map((r) => [r.id, r.clipIds]));
    expect(byId.r1).toEqual(['song-a']);
    expect(byId.r2).toEqual(['song-b']);
  });

  it('leaves the newer of two identically-titled pending records unlinked, rather than guessing', async () => {
    await seedTakeHistory([
      pendingRecord({ id: 'older', createdAt: '2024-01-01T00:00:00.000Z', title: 'Same Title' }),
      pendingRecord({ id: 'newer', createdAt: '2024-01-01T00:00:01.000Z', title: 'Same Title' }),
    ]);
    const adapter = new SunoAdapter();
    const linker = createClipLinker(adapter);

    document.body.innerHTML = clipRow('only-clip', 'Same Title');
    await linker.linkPendingTakes();

    const stored = await readStorage();
    const byId = Object.fromEntries(stored.takeHistory.map((r) => [r.id, r.clipIds]));
    expect(byId.older).toEqual(['only-clip']);
    expect(byId.newer).toEqual([]);
  });

  it('leaves a record unlinked when no clip row matches its title', async () => {
    await seedTakeHistory([
      pendingRecord({ id: 'r1', createdAt: '2024-01-01T00:00:00.000Z', title: 'Unmatched Title' }),
    ]);
    const adapter = new SunoAdapter();
    const linker = createClipLinker(adapter);

    document.body.innerHTML = clipRow('song-x', 'A Completely Different Title');
    await linker.linkPendingTakes();

    const stored = await readStorage();
    expect(stored.takeHistory[0]!.clipIds).toEqual([]);
  });

  it('claims only EXPECTED_CLIPS_PER_TAKE clips per record even when more same-title candidates are visible at once', async () => {
    // Deliberate, tested boundary (see EXPECTED_CLIPS_PER_TAKE in
    // domain/models.ts): Suno generates a pair of clips per submission by
    // default, so a record is considered fully linked - and stops being
    // offered fresh matches by findUnlinkedTakeRecords() - once it reaches
    // that count. A third same-title row (e.g. a coincidentally identical
    // title from an unrelated later submission) must not be swept in.
    await seedTakeHistory([
      pendingRecord({ id: 'r1', createdAt: '2024-01-01T00:00:00.000Z', title: 'Triple Title' }),
    ]);
    const adapter = new SunoAdapter();
    const linker = createClipLinker(adapter);

    document.body.innerHTML = clipRow('song-a', 'Triple Title') + clipRow('song-b', 'Triple Title') + clipRow('song-c', 'Triple Title');
    await linker.linkPendingTakes();

    const stored = await readStorage();
    expect(stored.takeHistory[0]!.clipIds.sort()).toEqual(['song-a', 'song-b']);

    // The record is now "fully linked" and is no longer reconsidered, even
    // on a later pass where song-c is still visible and still unclaimed.
    await linker.linkPendingTakes();
    const restored = await readStorage();
    expect(restored.takeHistory[0]!.clipIds.sort()).toEqual(['song-a', 'song-b']);
  });

  it('links both clips when two clips for the same take appear sequentially over multiple runs', async () => {
    await seedTakeHistory([
      pendingRecord({ id: 'r1', createdAt: '2024-01-01T00:00:00.000Z', title: 'Sequential Take' }),
    ]);
    const adapter = new SunoAdapter();
    const linker = createClipLinker(adapter);

    // First clip appears
    document.body.innerHTML = clipRow('song-1', 'Sequential Take');
    await linker.linkPendingTakes();

    let stored = await readStorage();
    expect(stored.takeHistory[0]!.clipIds).toEqual(['song-1']);

    // Second clip appears later
    document.body.innerHTML = clipRow('song-1', 'Sequential Take') + clipRow('song-2', 'Sequential Take');
    await linker.linkPendingTakes();

    stored = await readStorage();
    expect(stored.takeHistory[0]!.clipIds.sort()).toEqual(['song-1', 'song-2']);
  });
});
