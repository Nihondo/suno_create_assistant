import styleCss from '../src/content/suno-ui.css?inline';
import { AutoTitleControl, LyricsTagPalette, PresetControls, ReuseParamsButton, SidebarSettingsButton, StyleControls } from '../src/content/components';
import { SettingsDialog } from '../src/content/SettingsDialog';
import { createMounter } from '../src/content/mount';
import { detectSunoTheme } from '../src/content/theme';
import type { TakeRecord } from '../src/domain/models';
import { readStorage } from '../src/storage/repository';
import { createClipLinker } from '../src/suno/clip-linker';
import { SunoController } from '../src/suno/controller';

export default defineContentScript({
  matches: ['https://suno.com/create*'],
  runAt: 'document_idle',
  main() {
    const controller = new SunoController();
    const clipLinker = createClipLinker(controller.adapter);
    let scheduled = false;
    // When Suno's own reconciliation deletes the presets host too often
    // (more than the mounter's thrash threshold within its window), stop
    // fighting for the option-header anchor and fall back to a spot that
    // has proven stable: just above the title field.
    let presetFallback = false;
    let advancedSessionActive = false;
    let autoCloseHandled = false;
    let autoCloseAttempts = 0;
    // A clip-row's reuse-parameters button (key "clip:<songId>") that
    // thrashes is abandoned for good rather than retried like 'presets' -
    // there is no fallback placement for a single row's own button, so
    // syncClipButtons() below simply stops offering it a fresh anchor/JSX.
    const abandonedClipKeys = new Set<string>();
    const mountedClipButtonKeys = new Set<string>();
    // Chains each clip-button sync onto the previous one so two
    // refreshMounts() cycles inside the 80ms debounce window can never
    // race each other's read-then-mount of the same "clip:<id>" key.
    let clipButtonSync = Promise.resolve();
    const mounter = createMounter(styleCss, (key) => {
      if (key === 'presets') presetFallback = true;
      if (key.startsWith('clip:')) abandonedClipKeys.add(key);
      schedule();
    });

    const syncClipButtons = (theme?: 'light' | 'dark') => {
      clipButtonSync = clipButtonSync.then(async () => {
        // Best-effort: a failure here (storage, or the DOM shifting mid-read)
        // must never interrupt the rest of refreshMounts()'s own work.
        try {
          await clipLinker.linkPendingTakes();
          const rows = controller.adapter.clipRows();
          if (!rows.length && !mountedClipButtonKeys.size) return;

          // One storage read for every row, rather than one read per row.
          const stored = await readStorage();
          const recordByClipId = new Map<string, TakeRecord>();
          for (const record of stored.takeHistory) {
            for (const clipId of record.clipIds) {
              if (!recordByClipId.has(clipId)) recordByClipId.set(clipId, record);
            }
          }

          const nextKeys = new Set<string>();
          for (const info of rows) {
            const record = recordByClipId.get(info.songId);
            if (!record) continue;
            const key = `clip:${info.songId}`;
            if (abandonedClipKeys.has(key)) continue;
            nextKeys.add(key);
            const placement = controller.adapter.clipRowActionPlacement(info.row) ?? {
              anchor: controller.adapter.clipRowActionAnchor(info.row),
              position: 'beforeend' as const,
            };
            mounter.mount(key, placement, () => <ReuseParamsButton controller={controller} record={record} />, theme, { shadow: false });
          }
          // A row that no longer has a matching record (or scrolled out of
          // the DOM) loses its button; mount()'s own undefined-anchor path
          // unmounts and removes the host (see mount.ts).
          for (const key of mountedClipButtonKeys) {
            if (!nextKeys.has(key)) mounter.mount(key, { anchor: undefined, position: 'beforeend' }, () => null, theme);
          }
          mountedClipButtonKeys.clear();
          for (const key of nextKeys) mountedClipButtonKeys.add(key);
        } catch {
          // Swallowed - see comment above.
        }
      });
    };

    const refreshMounts = () => {
      scheduled = false;
      controller.adapter.shortenInspirationLabel();
      // Suno's own CSS custom property names for its theme colors are not
      // confirmed (see theme.ts), so following its light/dark mode relies
      // on reading the page's actual rendered appearance instead, once per
      // cycle, and stamping it onto every host as a data attribute the
      // Shadow DOM CSS can select on.
      const theme = detectSunoTheme();
      // The settings dialog is host-page-tab independent; keep it mounted
      // regardless of which tab is selected so it never disappears while
      // the user is interacting with it.
      mounter.mount('settings', { anchor: document.body, position: 'beforeend' }, () => <SettingsDialog controller={controller} />, theme);

      const sidebarPlacement = controller.adapter.sidebarPlacement();
      if (sidebarPlacement) {
        mounter.mount('sidebar', sidebarPlacement, () => <SidebarSettingsButton controller={controller} />, theme, { shadow: false });
      }

      // The workspace clip list (and so the reuse-parameters button on each
      // row) is part of /create regardless of which tab is selected, like
      // the two mounts above - not gated behind the `!advanced` return below.
      syncClipButtons(theme);

      const advanced = controller.adapter.isAdvancedTab();
      if (!advanced) {
        advancedSessionActive = false;
        autoCloseHandled = false;
        autoCloseAttempts = 0;
        return;
      }

      if (!advancedSessionActive) {
        advancedSessionActive = true;
        autoCloseHandled = false;
        autoCloseAttempts = 0;
      }

      if (controller.closeDisclosuresOnAdvanced && !autoCloseHandled) {
        autoCloseAttempts += 1;
        controller.adapter.closeDisclosures();
        const hasLyrics = !!controller.adapter.lyricsHeading();
        const hasStyle = !!controller.adapter.styleHeading();
        const hasOptions = !!controller.adapter.optionHeading();
        if ((hasLyrics && hasStyle && hasOptions) || autoCloseAttempts >= 3) {
          autoCloseHandled = true;
        }
      }
      mounter.mount('lyrics', { anchor: controller.adapter.lyricsAnchor(), position: 'afterend' }, () => <LyricsTagPalette controller={controller} />, theme);
      mounter.mount('styles', { anchor: controller.adapter.styleAnchor(), position: 'afterend' }, () => <StyleControls controller={controller} />, theme);
      const titleAnchor = controller.adapter.titleAnchor();
      // Preferred anchor: the "その他のオプション" header row, which Suno
      // never replaces (see adapter.optionsAnchor). If reattach() reports
      // the host is being torn down faster than it can be restored there,
      // fall back to the verified-stable title anchor instead.
      if (presetFallback) {
        mounter.mount('presets', { anchor: titleAnchor, position: 'beforebegin' }, () => <PresetControls controller={controller} />, theme);
      } else {
        mounter.mount('presets', { anchor: controller.adapter.optionsAnchor() ?? titleAnchor, position: 'afterend' }, () => <PresetControls controller={controller} />, theme);
      }
      // Keep Auto title in Suno's rounded title card. titleControlAnchor()
      // makes the card's input row wrap, allowing this host to take its own
      // line without moving below the separate destination card.
      mounter.mount('title', { anchor: controller.adapter.titleControlAnchor() ?? titleAnchor, position: 'beforeend' }, () => <AutoTitleControl controller={controller} />, theme);
      controller.reconcile();
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(refreshMounts, 80);
    };

    void controller.initialize().then(schedule);
    const unobserve = controller.adapter.observeForm(() => {
      // Synchronous reattachment happens inside the MutationObserver
      // callback itself so a torn-down host is back in place before the
      // next paint, instead of flickering for a debounce cycle.
      mounter.reattach();
      schedule();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        const dialogOpen = !!document.querySelector('suno-create-assistant [role="dialog"][open]');
        if (dialogOpen) return;

        event.preventDefault();
        event.stopPropagation();
        void controller.executeCreateWithTake();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    schedule();
    return () => {
      unobserve();
      controller.dispose();
      document.removeEventListener('keydown', onKeyDown, true);
      mounter.dispose();
    };
  },
});
