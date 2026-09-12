let lastSunoTabId: number | undefined;

type CaptureResponse = { ok: boolean; snapshot?: unknown; error?: string };

async function triggerSunoCreate(): Promise<void> {
  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tabIds = [...new Set([...activeTabs.map((tab) => tab.id), lastSunoTabId].filter((id): id is number => id !== undefined))];
  for (const tabId of tabIds) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'TRIGGER_SUNO_CREATE' }) as { ok?: boolean };
      if (result.ok) return;
    } catch {
      // The tab does not host Suno Create, so try the last active Suno tab.
    }
  }
}

async function captureSunoOptions(): Promise<CaptureResponse> {
  const matchingTabs = await chrome.tabs.query({ url: ['https://suno.com/create*'] });
  const tabIds = [...new Set([
    lastSunoTabId,
    ...matchingTabs.filter((tab) => tab.active).map((tab) => tab.id),
    ...matchingTabs.map((tab) => tab.id),
  ].filter((id): id is number => id !== undefined))];
  if (!tabIds.length) return { ok: false, error: 'Suno作成タブがありません。Sunoのアドバンスト作成画面を開いてください。' };

  for (const tabId of tabIds) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_OPTIONS' }) as CaptureResponse;
      if (result.ok) {
        lastSunoTabId = tabId;
        await chrome.storage.session.set({ lastSunoTabId });
        return result;
      }
    } catch {
      // A matching URL can still be loading or can have no content script yet.
    }
  }
  return { ok: false, error: 'Suno作成画面の設定を読み取れませんでした。アドバンストタブを開いてから、もう一度試してください。' };
}

chrome.storage.session.get('lastSunoTabId').then(({ lastSunoTabId: stored }) => {
  if (typeof stored === 'number') lastSunoTabId = stored;
});

export default defineBackground(() => {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'trigger-suno-create') void triggerSunoCreate();
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'SUNO_TOUCHED' && sender.tab?.id !== undefined) {
      lastSunoTabId = sender.tab.id;
      void chrome.storage.session.set({ lastSunoTabId });
      return;
    }
    if (message?.type === 'OPEN_OPTIONS') {
      void chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'CAPTURE_LAST_SUNO') {
      void captureSunoOptions().then(sendResponse);
      return true;
    }
  });
});
