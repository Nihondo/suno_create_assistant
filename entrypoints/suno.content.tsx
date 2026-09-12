import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import styleCss from '../src/content/suno-ui.css?inline';
import { AutoTitleControl, PresetControls, StyleControls } from '../src/content/components';
import { SunoController } from '../src/suno/controller';

export default defineContentScript({
  matches: ['https://suno.com/create*'],
  runAt: 'document_idle',
  main() {
    const controller = new SunoController();
    const roots = new Map<string, { host: HTMLElement; root: Root }>();
    let scheduled = false;

    const mount = (key: string, anchor: HTMLElement | undefined, render: () => ReactNode) => {
      const current = roots.get(key);
      if (!anchor) {
        current?.root.unmount();
        current?.host.remove();
        roots.delete(key);
        return;
      }
      if (current && current.host.previousElementSibling === anchor) return;
      current?.root.unmount();
      current?.host.remove();
      const host = document.createElement('suno-create-assistant');
      host.dataset.sunoCreateAssistant = key;
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = styleCss;
      const container = document.createElement('div');
      shadow.append(style, container);
      anchor.insertAdjacentElement('afterend', host);
      const root = createRoot(container);
      root.render(render());
      roots.set(key, { host, root });
    };

    const refreshMounts = () => {
      scheduled = false;
      controller.adapter.shortenInspirationLabel();
      const advanced = [...document.querySelectorAll('[role="tab"]')].some((tab) => {
        const label = tab.textContent ?? '';
        return /アドバンスト|アドバンスド|advanced/i.test(label) && tab.getAttribute('aria-selected') !== 'false';
      });
      if (!advanced) return;
      mount('styles', controller.adapter.styleAnchor(), () => <StyleControls controller={controller} />);
      mount('presets', controller.adapter.optionsAnchor(), () => <PresetControls controller={controller} />);
      mount('title', controller.adapter.titleAnchor(), () => <AutoTitleControl controller={controller} />);
      controller.reconcile();
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(refreshMounts, 80);
    };

    void controller.initialize().then(schedule);
    const unobserve = controller.adapter.observeForm(schedule);
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'CAPTURE_OPTIONS') {
        const snapshot = controller.adapter.readOtherOptions();
        sendResponse(snapshot ? { ok: true, snapshot } : { ok: false, error: 'Sunoのその他オプションを見つけられませんでした。' });
      }
      if (message?.type === 'TRIGGER_SUNO_CREATE') {
        const ok = controller.adapter.triggerCreate();
        sendResponse(ok ? { ok: true } : { ok: false, error: '有効な「作成」ボタンが見つかりませんでした。' });
      }
    });
    const touched = () => chrome.runtime.sendMessage({ type: 'SUNO_TOUCHED' });
    document.addEventListener('pointerdown', touched, true);
    window.addEventListener('focus', touched);
    schedule();
    return () => {
      unobserve();
      controller.dispose();
      document.removeEventListener('pointerdown', touched, true);
      window.removeEventListener('focus', touched);
      roots.forEach(({ root, host }) => { root.unmount(); host.remove(); });
    };
  },
});
