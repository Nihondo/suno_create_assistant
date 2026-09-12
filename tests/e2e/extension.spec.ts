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
    <section id="styles"><div id="styles-header"><div role="button" tabindex="0" aria-expanded="true">スタイル</div></div><div data-testid="create-form-styles-wrapper"><textarea></textarea></div><button id="saved-styles" aria-label="保存したスタイルプロンプトを見る">保存したスタイル</button></section>
    <dialog role="dialog" aria-label="保存したスタイル"><div><button aria-label="ARIA">ARIA</button><span>gentle acoustic ensemble</span></div></dialog>
    <section id="options"><div id="options-header"><div role="button" tabindex="0" aria-expanded="true">その他のオプション</div><button aria-label="すべてリセット">すべてリセット</button></div><div id="options-body"><input aria-label="スタイルを除外" />
      <div>ボーカル性別<button data-selected="false">男性</button><button data-selected="false">女性</button></div>
      <div>長さ<button data-selected="false">カスタム</button><button data-selected="true">Auto</button></div>
      <div>Maxモード<button data-selected="true">オフ</button><button data-selected="false">オン</button></div>
      <div role="slider" aria-label="奇抜さ" aria-valuenow="50" style="width:100px;height:20px"></div>
      <div role="slider" aria-label="スタイルの影響" aria-valuenow="50" style="width:100px;height:20px"></div>
      <div role="slider" aria-label="バリエーション" aria-valuenow="0" style="width:100px;height:20px"></div>
      <div>パーソナライズ<button data-selected="false">マイ・テイスト</button><button data-selected="true">オフ</button><button data-selected="false" disabled>オン</button></div>
    </div></section>
    <section><div style="display:flex;flex-wrap:nowrap"><input placeholder="曲名(任意)" /></div><div>保存先…<button>Demo Workspace</button></div></section>
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
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const extensionErrors: string[] = [];
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      extensionErrors.push(exceptionDetails.exception?.description ?? exceptionDetails.text);
    });
    await cdp.send('Runtime.enable');
    await page.goto('https://suno.com/create');
    await page.locator('suno-create-assistant').first().waitFor();
    // styles, presets, title, and the always-mounted settings dialog host.
    expect(await page.locator('suno-create-assistant').count(), extensionErrors.join('\n')).toBe(4);
    const titleHost = page.locator('suno-create-assistant[data-suno-create-assistant="title"]');
    await expect(titleHost).toHaveCount(1);
    expect(await titleHost.evaluate((host) => host.parentElement === document.querySelector('input[placeholder="曲名(任意)"]')?.parentElement)).toBe(true);
    expect(await page.locator('input[placeholder="曲名(任意)"]').evaluate((input) => getComputedStyle(input.parentElement!).flexWrap)).toBe('wrap');
    const [titleInputBox, titleHostBox] = await Promise.all([
      page.locator('input[placeholder="曲名(任意)"]').boundingBox(),
      titleHost.boundingBox(),
    ]);
    expect(titleInputBox).not.toBeNull();
    expect(titleHostBox).not.toBeNull();
    expect(titleHostBox!.y).toBeGreaterThanOrEqual(titleInputBox!.y + titleInputBox!.height);

    // Regression: the settings dialog host used to require staying
    // document.body's *last* child. Anything else that also appends to
    // body (tooltips, toasts, portals - all common in a React SPA) would
    // then fight it for that position forever, freezing the page via an
    // unbounded MutationObserver-triggered reinsertion loop. Simulate such
    // portaled siblings and confirm the main thread is still free to run
    // script promptly afterward (a frozen page would time this out).
    await page.evaluate(() => {
      for (let i = 0; i < 50; i += 1) document.body.append(document.createElement('div'));
    });
    await expect.poll(() => page.evaluate(() => 1 + 1), { timeout: 2000 }).toBe(2);
    await expect(page.locator('suno-create-assistant[data-suno-create-assistant="settings"]')).toHaveCount(1);

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

    const stylesHost = page.locator('suno-create-assistant[data-suno-create-assistant="styles"]');
    await expect(page.locator('#styles-header + suno-create-assistant[data-suno-create-assistant="styles"]')).toHaveCount(1);
    await expect(stylesHost).toBeVisible();

    // Verify styles host stays visible even when the styles section is closed/hidden
    await page.evaluate(() => {
      document.querySelector('#styles-header [role="button"]')?.setAttribute('aria-expanded', 'false');
      const wrapper = document.querySelector<HTMLElement>('[data-testid="create-form-styles-wrapper"]');
      if (wrapper) wrapper.style.display = 'none';
    });
    await expect(stylesHost).toBeVisible();

    await expect(page.locator('#inspiration')).toHaveText('＋ ひらめき');
    await expect(page.getByRole('button', { name: /^プリセット:/ })).toBeVisible();
    await page.getByRole('button', { name: /^スタイル:/ }).click();
    await expect(page.getByRole('option', { name: 'ARIA' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'ARIA' })).toHaveCSS('color', 'rgb(247, 244, 239)');
    await page.getByRole('option', { name: 'ARIA' }).click();
    await expect(page.locator('[data-testid="create-form-styles-wrapper"] textarea')).toHaveValue('gentle acoustic ensemble');
    await titleHost.getByRole('checkbox', { name: '自動設定' }).check();
    await expect(page.locator('input[placeholder="曲名(任意)"]')).toHaveValue('Demo Workspace (ARIA)');
    await page.reload();
    await expect(page.locator('suno-create-assistant[data-suno-create-assistant="title"]')).toHaveCount(1);
    await expect(page.locator('suno-create-assistant[data-suno-create-assistant="title"]').getByRole('checkbox', { name: '自動設定' })).toBeChecked();

    // Preset creation is now directly triggered via the "設定を保存" button next to the dropdown.
    await presetsHost.getByRole('button', { name: '設定を保存' }).click();
    const dialog = page.locator('suno-create-assistant[data-suno-create-assistant="settings"]');
    await expect(dialog.getByRole('heading', { name: 'Suno Create Assistant の設定' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '現在値からプリセットを作成' })).toHaveCount(0);

    await dialog.getByRole('textbox', { name: '名前' }).fill('標準');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByText('標準')).toBeVisible();
    await expect(dialog.getByText('奇抜さ: 50%')).toBeVisible();
    await dialog.getByRole('button', { name: '編集' }).click();
    await expect(dialog.getByRole('textbox', { name: '名前' })).toHaveValue('標準');
    await dialog.getByRole('radio', { name: 'カスタム' }).check();
    const secondsLabel = dialog.getByText('秒数', { exact: true });
    const secondsInput = dialog.locator('input[name$="-duration-seconds"]');
    await expect(secondsInput).toBeVisible();
    const [secondsLabelBox, secondsInputBox] = await Promise.all([secondsLabel.boundingBox(), secondsInput.boundingBox()]);
    expect(secondsLabelBox).not.toBeNull();
    expect(secondsInputBox).not.toBeNull();
    expect(secondsInputBox!.x).toBeGreaterThan(secondsLabelBox!.x + secondsLabelBox!.width);
    expect(Math.abs((secondsInputBox!.y + secondsInputBox!.height / 2) - (secondsLabelBox!.y + secondsLabelBox!.height / 2))).toBeLessThan(1);
    await dialog.locator('label').filter({ hasText: /^奇抜さ/ }).locator('input[type="range"]').fill('35');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByText('奇抜さ: 35%')).toBeVisible();
    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog.getByRole('heading', { name: 'Suno Create Assistant の設定' })).toBeHidden();

    await page.getByRole('button', { name: /^プリセット:/ }).click();
    await expect(page.getByRole('option', { name: '標準' })).toBeVisible();
    await page.getByRole('option', { name: '標準' }).click();
    await expect(page.getByRole('button', { name: 'プリセット: 標準' })).toBeVisible();
    const presetTrigger = presetsHost.getByRole('button', { name: 'プリセット: 標準' });
    const presetFeedback = presetsHost.getByText('プリセットを適用しました。');
    await expect(presetFeedback).toBeVisible();
    const [triggerBox, feedbackBox] = await Promise.all([presetTrigger.boundingBox(), presetFeedback.boundingBox()]);
    expect(triggerBox).not.toBeNull();
    expect(feedbackBox).not.toBeNull();
    expect(feedbackBox!.x).toBeGreaterThan(triggerBox!.x + triggerBox!.width);
    expect(Math.abs((feedbackBox!.y + feedbackBox!.height / 2) - (triggerBox!.y + triggerBox!.height / 2))).toBeLessThan(1);
    await expect(page.locator('suno-create-assistant[data-suno-create-assistant="styles"]')).not.toContainText('プリセットを適用しました。');

    // Test in-page keyboard shortcut (Cmd+Enter on macOS, Ctrl+Enter elsewhere)
    await page.bringToFront();
    await page.evaluate(() => document.body.removeAttribute('data-created'));
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.locator('body')).toHaveAttribute('data-created', 'true');
  } finally {
    await context?.close();
    await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
    await rm(profile, { recursive: true, force: true });
  }
});
