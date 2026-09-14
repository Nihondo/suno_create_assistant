import { EXPECTED_CLIPS_PER_TAKE } from '../domain/models';
import { findUnlinkedTakeRecords, linkTakeToClips } from '../storage/repository';
import type { SunoAdapter } from './adapter';

export interface ClipLinker {
  linkPendingTakes(): Promise<void>;
}

/**
 * Resolves take-history records that have not yet been matched to a
 * generated clip, by title, against the workspace clip list
 * (SunoAdapter.clipRows()). Suno gives no other DOM-visible signal to tie a
 * generation back to its song id, so this is a best-effort match: ambiguous
 * cases are deliberately left unlinked rather than guessed at (see
 * linkPendingTakes below).
 */
export { EXPECTED_CLIPS_PER_TAKE };

export function createClipLinker(adapter: SunoAdapter): ClipLinker {
  // Snapshot every song id already present when the linker is created (page
  // load / content script start). A clip that predates this session must
  // never be claimed by a pending take record just because it happens to
  // share a title - only rows that appear *after* this snapshot are
  // eligible candidates. Across a page reload this snapshot resets, so a
  // take still unlinked from a previous session falls back to title-only
  // matching against whatever is visible then.
  const seenAtStart = new Set(adapter.clipRows().map((info) => info.songId));

  const linkPendingTakes = async (): Promise<void> => {
    const pending = await findUnlinkedTakeRecords();
    if (!pending.length) return;

    const candidates = adapter.clipRows().filter((info) => !seenAtStart.has(info.songId));
    if (!candidates.length) return;

    // Oldest pending record first, so an earlier generation is not left
    // waiting behind a later one that happens to finish rendering sooner.
    const sortedPending = [...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const claimed = new Set<string>();

    for (const record of sortedPending) {
      const needed = Math.max(0, EXPECTED_CLIPS_PER_TAKE - record.clipIds.length);
      if (needed === 0) continue;

      // Suno creates a pair of clips (2 variations) by default per submission.
      // Filter candidates that match the title, haven't been claimed in this pass,
      // and haven't already been linked to this record.
      const matches = candidates.filter(
        (info) => info.title === record.title && !claimed.has(info.songId) && !record.clipIds.includes(info.songId),
      );
      if (!matches.length) continue;

      const toClaim = matches.slice(0, needed);
      for (const match of toClaim) claimed.add(match.songId);
      await linkTakeToClips(record.id, toClaim.map((match) => match.songId));
    }
  };

  return { linkPendingTakes };
}
