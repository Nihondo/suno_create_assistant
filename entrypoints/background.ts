let lastSunoTabId: number | undefined;

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
    if (message?.type === 'CAPTURE_LAST_SUNO') {
      if (lastSunoTabId === undefined) {
        sendResponse({ ok: false, error: '直近に操作したSuno作成タブがありません。' });
        return;
      }
      chrome.tabs.sendMessage(lastSunoTabId, { type: 'CAPTURE_OPTIONS' })
        .then(sendResponse)
        .catch(() => sendResponse({ ok: false, error: 'Suno作成タブに接続できません。作成画面を開いてください。' }));
      return true;
    }
  });
});
