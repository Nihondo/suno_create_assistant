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
      // A single "Create" submission commonly yields more than one clip
      // with the identical title, so every currently-unclaimed title match
      // is attributed to this one record. If two separate pending records
      // happen to share the exact same title (e.g. a title format with no
      // {{TAKE}}), whichever is processed first (the older one) claims all
      // of them and the other is left unlinked - an ambiguous split like
      // that is exactly the case this module is designed to leave alone
      // rather than guess at.
      const matches = candidates.filter((info) => info.title === record.title && !claimed.has(info.songId));
      if (!matches.length) continue;
      for (const match of matches) claimed.add(match.songId);
      await linkTakeToClips(record.id, matches.map((match) => match.songId));
    }
  };

  return { linkPendingTakes };
}
