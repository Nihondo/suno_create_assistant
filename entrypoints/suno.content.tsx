import styleCss from '../src/content/suno-ui.css?inline';
import { AutoTitleControl, PresetControls, StyleControls } from '../src/content/components';
import { SettingsDialog } from '../src/content/SettingsDialog';
import { createMounter } from '../src/content/mount';
import { detectSunoTheme } from '../src/content/theme';
import { SunoController } from '../src/suno/controller';

export default defineContentScript({
  matches: ['https://suno.com/create*'],
  runAt: 'document_idle',
  main() {
    const controller = new SunoController();
    let scheduled = false;
    // When Suno's own reconciliation deletes the presets host too often
    // (more than the mounter's thrash threshold within its window), stop
    // fighting for the option-header anchor and fall back to a spot that
    // has proven stable: just above the title field.
    let presetFallback = false;
    const mounter = createMounter(styleCss, (key) => {
      if (key === 'presets') presetFallback = true;
      schedule();
    });

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

      const advanced = [...document.querySelectorAll('[role="tab"]')].some((tab) => {
        const label = tab.textContent ?? '';
        return /アドバンスト|アドバンスド|advanced/i.test(label) && tab.getAttribute('aria-selected') !== 'false';
      });
      if (!advanced) return;
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
      mounter.mount('title', { anchor: titleAnchor, position: 'afterend' }, () => <AutoTitleControl controller={controller} />, theme);
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
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'TRIGGER_SUNO_CREATE') {
        const ok = controller.adapter.triggerCreate();
        sendResponse(ok ? { ok: true } : { ok: false, error: '有効な「作成」ボタンが見つかりませんでした。' });
      }
    });
    const touched = () => chrome.runtime.sendMessage({ type: 'SUNO_TOUCHED' });
    document.addEventListener('pointerdown', touched, true);
    window.addEventListener('focus', touched);
    void chrome.runtime.sendMessage({ type: 'SUNO_TOUCHED' });
    schedule();
    return () => {
      unobserve();
      controller.dispose();
      document.removeEventListener('pointerdown', touched, true);
      window.removeEventListener('focus', touched);
      mounter.dispose();
    };
  },
});
