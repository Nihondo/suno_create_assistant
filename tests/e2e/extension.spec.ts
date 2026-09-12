import { expect, test } from '@playwright/test';
import { createServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext } from 'playwright';

const extensionPath = resolve('output/chrome-mv3');

const sunoFixture = `<!doctype html><html lang="ja"><body>
  <main>
    <button role="tab" aria-selected="true">アドバンスト</button>
    <button id="inspiration">＋ インスピレーション</button>
    <section><div data-testid="create-form-styles-wrapper"><textarea></textarea></div><button id="saved-styles" aria-label="保存したスタイルプロンプトを見る">保存したスタイル</button></section>
    <dialog role="dialog" aria-label="保存したスタイル"><div><button aria-label="ARIA">ARIA</button><span>gentle acoustic ensemble</span></div></dialog>
    <section id="options"><div id="options-header"><button>その他のオプション</button><button aria-label="すべてリセット">すべてリセット</button></div><div id="options-body"><input aria-label="スタイルを除外" />
      <div>ボーカル性別<button>男性</button><button>女性</button></div>
      <div>長さ<button>カスタム</button><button class="hxc-btn-variant-standard">Auto</button></div>
      <div>Maxモード<button class="hxc-btn-variant-standard">オフ</button><button>オン</button></div>
      <div role="slider" aria-label="奇抜さ" aria-valuenow="50" style="width:100px;height:20px"></div>
      <div role="slider" aria-label="スタイルの影響" aria-valuenow="50" style="width:100px;height:20px"></div>
      <div role="slider" aria-label="バリエーション" aria-valuenow="0" style="width:100px;height:20px"></div>
      <div>パーソナライズ<button>マイ・テイスト</button><button class="hxc-btn-variant-standard">オフ</button><button disabled>オン</button></div>
    </div></section>
    <section><div><input placeholder="曲名(任意)" /></div><div>保存先…<button>Demo Workspace</button></div></section>
    <button id="create">作成</button>
    <script>
      document.querySelector('#create').addEventListener('click', () => document.body.dataset.created = 'true');
      document.querySelector('#saved-styles').addEventListener('click', () => {
        const dialog = document.querySelector('[role="dialog"]');
        dialog.open ? dialog.close() : dialog.showModal();
      });
    </script>
  </main>
</body></html>`;

test('mounts the Suno controls beside their anchors, survives host removal, and manages settings in-page', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'suno-create-assistant-'));
  const server = createServer({
    key: await readFile(new URL('./fixture-key.pem', import.meta.url)),
    cert: await readFile(new URL('./fixture-cert.pem', import.meta.url)),
  }, (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(sunoFixture);
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const port = (server.address() as AddressInfo).port;
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: false,
      // Playwright disables extensions by default; keep that default argument
      // out so its bundled Chromium honors --load-extension below.
      ignoreDefaultArgs: ['--disable-extensions'],
      ignoreHTTPSErrors: true,
      args: [
        '--no-proxy-server',
        `--host-resolver-rules=MAP suno.com:443 127.0.0.1:${port}`,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    // Wait until Chrome has registered the extension before navigating to the
    // matched Suno URL; otherwise a fast first navigation can miss injection.
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    expect(worker.url()).toContain('background.js');
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const extensionErrors: string[] = [];
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      extensionErrors.push(exceptionDetails.exception?.description ?? exceptionDetails.text);
    });
    await cdp.send('Runtime.enable');
    await page.goto('https://suno.com/create');
    await page.waitForTimeout(250);
    // styles, presets, title, and the always-mounted settings dialog host.
    expect(await page.locator('suno-create-assistant').count(), extensionErrors.join('\n')).toBe(4);

    // The presets control sits directly under the "その他のオプション" header
    // row, ahead of the disclosure body - not beside the title field.
    const presetsHost = page.locator('suno-create-assistant[data-suno-create-assistant="presets"]');
    await expect(presetsHost).toBeVisible();
    await expect(page.locator('#options-header + suno-create-assistant[data-suno-create-assistant="presets"]')).toHaveCount(1);

    await page.locator('input[placeholder="曲名(任意)"]').dispatchEvent('input');
    await page.waitForTimeout(120);
    await expect(presetsHost).toBeVisible();

    // Suno can delete the extension's host outright during its own
    // reconciliation; the mounter must put it back without recreating it,
    // well inside a debounce cycle.
    await page.evaluate(() => document.querySelector('suno-create-assistant[data-suno-create-assistant="presets"]')?.remove());
    await expect(presetsHost).toBeVisible({ timeout: 300 });
    await expect(page.locator('#options-header + suno-create-assistant[data-suno-create-assistant="presets"]')).toHaveCount(1);

    await expect(page.locator('#inspiration')).toHaveText('＋ ひらめき');
    await expect(page.getByRole('button', { name: /^プリセット:/ })).toBeVisible();
    await page.getByRole('button', { name: /^スタイル:/ }).click();
    await expect(page.getByRole('option', { name: 'ARIA' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'ARIA' })).toHaveCSS('color', 'rgb(245, 245, 246)');
    await page.getByRole('option', { name: 'ARIA' }).click();
    await expect(page.locator('[data-testid="create-form-styles-wrapper"] textarea')).toHaveValue('gentle acoustic ensemble');
    await page.locator('suno-create-assistant').filter({ hasText: '自動設定' }).getByRole('checkbox').check();
    await expect(page.locator('input[placeholder="曲名(任意)"]')).toHaveValue('Demo Workspace (ARIA)');

    // Settings management (masterings and presets) now lives in a modal
    // dialog inside the Suno page itself, opened from the preset dropdown.
    await page.getByRole('button', { name: /^プリセット:/ }).click();
    await page.getByRole('option', { name: 'プリセットを管理…' }).click();
    const dialog = page.locator('suno-create-assistant[data-suno-create-assistant="settings"]');
    await expect(dialog.getByRole('heading', { name: 'Suno Create Assistant の設定' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Sunoの現在の設定を取り込む' }).click();
    await expect(dialog.getByText('現在の設定を取り込みました。')).toBeVisible();
    await dialog.getByRole('button', { name: '現在値からプリセットを作成' }).click();
    await dialog.getByRole('textbox', { name: '名前' }).fill('標準');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByText('標準')).toBeVisible();
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog.getByRole('heading', { name: 'Suno Create Assistant の設定' })).toBeHidden();

    await page.getByRole('button', { name: /^プリセット:/ }).click();
    await expect(page.getByRole('option', { name: '標準' })).toBeVisible();
    await page.getByRole('option', { name: '標準' }).click();
    await expect(page.getByRole('button', { name: 'プリセット: 標準' })).toBeVisible();

    // The extension options page now hosts only the shortcut setting.
    const extensionId = new URL(worker.url()).host;
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(optionsPage.getByRole('heading', { name: 'キーボードショートカット' })).toBeVisible();
    await expect(optionsPage.getByRole('button', { name: 'Sunoから現在値を取得' })).toHaveCount(0);

    await page.bringToFront();
    const shortcutResult = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id === undefined) throw new Error('Suno作成タブが見つかりません。');
      return chrome.tabs.sendMessage(tab.id!, { type: 'TRIGGER_SUNO_CREATE' });
    });
    expect(shortcutResult).toEqual({ ok: true });
    await expect(page.locator('body')).toHaveAttribute('data-created', 'true');
  } finally {
    await context?.close();
    await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
    await rm(profile, { recursive: true, force: true });
  }
});
