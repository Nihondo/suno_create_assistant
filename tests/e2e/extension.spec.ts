import { expect, test } from '@playwright/test';
import { createServer } from 'node:https';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext } from 'playwright';
import { generate } from 'selfsigned';

const extensionPath = resolve('install/chrome-mv3');

const sunoFixture = `<!doctype html><html lang="ja"><body>
  <aside class="group/sidebar">
    <div class="flex flex-col gap-px px-3">
      <a href="/discover">ホーム</a>
      <a href="/explore">探索</a>
      <a href="/create">作成</a>
      <a href="/studio">Studio</a>
      <a href="/me" data-testid="navbar-library-tab">ライブラリ</a>
      <a href="/hooks">Hooks</a>
      <div class="group/profile-row hxc-btn-split-root">
        <button type="button" data-testid="profile-menu-button">nihondo</button>
      </div>
    </div>
  </aside>
  <main>
    <button role="tab" aria-selected="true">アドバンスト</button>
    <button id="inspiration">＋ インスピレーション</button>
    <section id="lyrics"><div id="lyrics-header"><div role="button" tabindex="0" aria-expanded="true">歌詞</div></div><div id="lyrics-wrapper"><textarea placeholder="歌詞を入力"></textarea></div></section>
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
    <div id="clip-list"></div>
    <script>
      let clipCounter = 0;
      function addClipRow(title) {
        clipCounter += 1;
        const id = 'clip-' + clipCounter;
        const row = document.createElement('div');
        row.setAttribute('data-testid', 'clip-row');
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', title);
        row.setAttribute('data-clip-status', 'complete');
        row.innerHTML = '<a href="/song/' + id + '">' + title + '</a>'
          + '<div>'
          + '<button aria-label="クリップに「いいね」"></button>'
          + '<button aria-label="クリップを低評価"></button>'
          + '<button aria-label="クリップをワークスペースに固定"></button>'
          + '<button aria-label="クリップを共有"></button>'
          + '</div>';
        document.querySelector('#clip-list').prepend(row);
      }
      document.querySelector('#create').addEventListener('click', () => {
        document.body.dataset.created = 'true';
        const title = document.querySelector('input[placeholder="曲名(任意)"]').value;
        document.body.dataset.createdTitle = title;
        // Approximates Suno showing the newly generated clips (2 variations)
        // in the workspace list right after a submission.
        addClipRow(title);
        addClipRow(title);
      });
      document.querySelector('#saved-styles').addEventListener('click', () => {
        const dialog = document.querySelector('[role="dialog"]');
        dialog.open ? dialog.close() : dialog.showModal();
      });
      document.querySelectorAll('#lyrics-header [role="button"], #styles-header [role="button"], #options-header [role="button"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const expanded = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', String(!expanded));
        });
      });
    </script>
  </main>
</body></html>`;

test('mounts the Suno controls beside their anchors, survives host removal, and manages settings in-page', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'suno-create-assistant-'));
  const pems = await generate([{ name: 'commonName', value: 'suno.com' }], { algorithm: 'sha256' });
  const server = createServer({
    key: pems.private,
    cert: pems.cert,
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
    // lyrics, styles, presets, title, sidebar, and the always-mounted settings dialog host.
    expect(await page.locator('suno-create-assistant').count(), extensionErrors.join('\n')).toBe(6);

    // Verify sidebar settings button is mounted after hooks link, in light DOM
    const sidebarHost = page.locator('suno-create-assistant[data-suno-create-assistant="sidebar"]');
    await expect(sidebarHost).toHaveCount(1);
    await expect(page.locator('a[href="/hooks"] + suno-create-assistant[data-suno-create-assistant="sidebar"]')).toHaveCount(1);
    const sidebarButton = sidebarHost.locator('button[data-suno-assistant="sidebar-settings-button"]');
    await expect(sidebarButton).toBeVisible();
    await expect(sidebarButton).toHaveText(/拡張設定/);
    await expect(sidebarButton).toHaveAttribute('data-inactive', '');
    await expect(sidebarButton.locator('svg.hxc-btn-icon')).toHaveCSS('color', 'rgb(234, 122, 59)');
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

    const lyricsHost = page.locator('suno-create-assistant[data-suno-create-assistant="lyrics"]');
    await expect(page.locator('#lyrics-header + suno-create-assistant[data-suno-create-assistant="lyrics"]')).toHaveCount(1);
    await expect(lyricsHost).toBeVisible();

    // Verify section borders have subtle orange styling
    await expect(lyricsHost.locator('.suno-assistant--lyrics')).toHaveCSS('border-top-color', 'rgba(234, 122, 59, 0.45)');
    await expect(stylesHost.locator('.suno-assistant--styles')).toHaveCSS('border-top-color', 'rgba(234, 122, 59, 0.45)');
    await expect(presetsHost.locator('.suno-assistant--presets')).toHaveCSS('border-top-color', 'rgba(234, 122, 59, 0.45)');

    // Verify tag buttons display without brackets
    const verse1Button = lyricsHost.getByRole('button', { name: 'Verse 1' });
    await expect(verse1Button).toBeVisible();

    // Verify disclosures (lyrics, styles, options) are automatically closed by default on Advanced tab
    await expect(page.locator('#lyrics-header [role="button"]')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#styles-header [role="button"]')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#options-header [role="button"]')).toHaveAttribute('aria-expanded', 'false');

    // Clicking a tag button automatically expands the lyrics disclosure and inserts [Verse 1]\n
    await verse1Button.click();
    await expect(page.locator('#lyrics-header [role="button"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#lyrics-wrapper textarea')).toHaveValue('[Verse 1]\n');

    // Verify user can manually expand a disclosure and it stays expanded without being re-closed
    await page.locator('#styles-header [role="button"]').click();
    await expect(page.locator('#styles-header [role="button"]')).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(100);
    await expect(page.locator('#styles-header [role="button"]')).toHaveAttribute('aria-expanded', 'true');

    await expect(stylesHost).toBeVisible();

    await expect(page.locator('#inspiration')).toHaveText('＋ Inspo');
    await expect(page.getByRole('button', { name: /^プリセット:/ })).toBeVisible();
    await page.getByRole('button', { name: /^スタイル:/ }).click();
    await expect(page.getByRole('option', { name: 'ARIA' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'ARIA' })).toHaveCSS('color', 'rgb(247, 244, 239)');
    await page.getByRole('option', { name: 'ARIA' }).click();
    await expect(page.locator('[data-testid="create-form-styles-wrapper"] textarea')).toHaveValue('gentle acoustic ensemble');
    await titleHost.getByRole('checkbox', { name: '自動設定' }).check();
    await expect(page.locator('input[placeholder="曲名(任意)"]')).toHaveValue('Demo Workspace (ARIA) {{TAKE}}');
    await page.reload();
    await expect(page.locator('suno-create-assistant[data-suno-create-assistant="title"]')).toHaveCount(1);
    await expect(page.locator('suno-create-assistant[data-suno-create-assistant="title"]').getByRole('checkbox', { name: '自動設定' })).toBeChecked();

    // Preset creation is now directly triggered via the "設定を保存" button next to the dropdown.
    await presetsHost.getByRole('button', { name: '設定を保存' }).click();
    const dialog = page.locator('suno-create-assistant[data-suno-create-assistant="settings"]');
    // The dialog is now split into a sidebar of section tabs (see
    // SettingsDialog.tsx's SECTION_ORDER) rather than one long scrolling
    // page, so only one section's content is visible/interactable at a
    // time - this helper switches tabs by their sidebar label.
    const gotoTab = (label: string) => dialog.getByRole('button', { name: label, exact: true }).click();

    await expect(dialog.getByRole('heading', { name: 'Suno Create Assistant の設定' })).toBeVisible();
    // "設定を保存" opens directly on the presets tab with Suno's current
    // values already captured - there is no separate capture button inside
    // the dialog.
    await expect(dialog.getByRole('button', { name: '現在値からプリセットを作成' })).toHaveCount(0);
    // Name and save it here, before visiting any other tab: switching tabs
    // mid-edit intentionally clears the in-progress preset form (see the
    // effect in SettingsDialog.tsx), the same way it always has for any
    // other way of arriving at the presets section.
    await dialog.getByRole('textbox', { name: '名前' }).fill('標準');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog.getByText('標準')).toBeVisible();
    await expect(dialog.getByText('奇抜さ: 50%')).toBeVisible();

    await gotoTab('曲名フォーマット');
    await expect(dialog.getByRole('heading', { name: '曲名フォーマット' })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: '曲名フォーマット' })).toHaveValue('{{WORKSPACE}} ({{STYLE}}) {{TAKE}}');
    await expect(dialog.getByRole('heading', { name: '表示設定' })).toHaveCount(0);

    await gotoTab('表示設定');
    await expect(dialog.getByRole('heading', { name: '表示設定' })).toBeVisible();
    const closeDisclosuresCheck = dialog.getByRole('checkbox', { name: 'アドバンスドタブを開いた時に歌詞、スタイル、その他のオプションを閉じる' });
    await expect(closeDisclosuresCheck).toBeChecked();

    await gotoTab('歌詞タグ');
    await expect(dialog.getByRole('heading', { name: '歌詞タグ' })).toBeVisible();
    const lyricsTagsTextarea = dialog.locator('textarea.suno-assistant__tags-textarea');
    await expect(lyricsTagsTextarea).toBeVisible();
    await expect(lyricsTagsTextarea).toHaveValue(/\[Verse 1\]/);
    await lyricsTagsTextarea.fill('[Intro]\n[Solo]\n[Outro]');
    await dialog.getByRole('button', { name: 'タグを保存' }).click();
    await expect(dialog.locator('.suno-assistant__format-saved', { hasText: '保存しました' })).toBeVisible();

    // Back to presets, now showing the list (the tab switches above cleared
    // the finished form), to edit the preset just saved.
    await gotoTab('その他のオプションプリセット');
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

    // Open settings from sidebar button and verify active state. The
    // sidebar button opens on the first tab (display), matching SECTION_ORDER.
    await sidebarButton.click();
    await expect(dialog.getByRole('heading', { name: 'Suno Create Assistant の設定' })).toBeVisible();
    await expect(sidebarButton).toHaveAttribute('data-active', '');

    // Toggle closeDisclosuresOnAdvanced setting off
    await gotoTab('表示設定');
    await closeDisclosuresCheck.uncheck();
    await expect(closeDisclosuresCheck).not.toBeChecked();

    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog.getByRole('heading', { name: 'Suno Create Assistant の設定' })).toBeHidden();
    await expect(sidebarButton).toHaveAttribute('data-inactive', '');

    // Verify lyrics palette updated to the newly saved tags
    await expect(lyricsHost.getByRole('button', { name: 'Solo' })).toBeVisible();
    await expect(lyricsHost.getByRole('button', { name: 'Verse 1' })).toHaveCount(0);

    // Reload page with setting OFF: disclosures should stay open (aria-expanded="true")
    await page.reload();
    await page.locator('suno-create-assistant').first().waitFor();
    await expect(page.locator('#lyrics-header [role="button"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#styles-header [role="button"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#options-header [role="button"]')).toHaveAttribute('aria-expanded', 'true');

    // Turn setting back ON from sidebar
    await sidebarButton.click();
    await gotoTab('表示設定');
    await expect(closeDisclosuresCheck).not.toBeChecked();
    await closeDisclosuresCheck.check();
    await expect(closeDisclosuresCheck).toBeChecked();
    // Turning ON while on Advanced tab closes them immediately
    await expect(page.locator('#lyrics-header [role="button"]')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#styles-header [role="button"]')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#options-header [role="button"]')).toHaveAttribute('aria-expanded', 'false');

    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog.getByRole('heading', { name: 'Suno Create Assistant の設定' })).toBeHidden();
    await expect(sidebarButton).toHaveAttribute('data-inactive', '');

    await page.getByRole('button', { name: /^プリセット:/ }).click();
    await expect(page.getByRole('option', { name: '標準' })).toBeVisible();
    await page.getByRole('option', { name: '標準' }).click();
    await expect(page.getByRole('button', { name: 'プリセット: 標準' })).toBeVisible();
    const presetTrigger = presetsHost.getByRole('button', { name: 'プリセット: 標準' });
    const saveButton = presetsHost.getByRole('button', { name: '設定を保存' });
    await expect(presetsHost.getByText('プリセットを適用しました。')).toHaveCount(0);
    const [triggerBox, saveBox] = await Promise.all([presetTrigger.boundingBox(), saveButton.boundingBox()]);
    expect(triggerBox).not.toBeNull();
    expect(saveBox).not.toBeNull();
    expect(saveBox!.x).toBeGreaterThan(triggerBox!.x + triggerBox!.width);
    expect(Math.abs((saveBox!.y + saveBox!.height / 2) - (triggerBox!.y + triggerBox!.height / 2))).toBeLessThan(2);
    // Button height should be standard single-line height (~32px), not wrapped vertically
    expect(saveBox!.height).toBeLessThan(40);

    // Re-select style to test full Workspace (Style) {{TAKE}} formatting
    await page.getByRole('button', { name: /^スタイル:/ }).click();
    await page.getByRole('option', { name: 'ARIA' }).click();
    await expect(page.locator('input[placeholder="曲名(任意)"]')).toHaveValue('Demo Workspace (ARIA) {{TAKE}}');

    // Test in-page keyboard shortcut (Cmd+Enter on macOS, Ctrl+Enter elsewhere)
    // First creation: take 1 is submitted, title reverts to {{TAKE}}
    await page.bringToFront();
    await page.evaluate(() => {
      document.body.removeAttribute('data-created');
      document.body.removeAttribute('data-created-title');
    });
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.locator('body')).toHaveAttribute('data-created', 'true');
    await expect(page.locator('body')).toHaveAttribute('data-created-title', 'Demo Workspace (ARIA) 1');
    await expect(page.locator('input[placeholder="曲名(任意)"]')).toHaveValue('Demo Workspace (ARIA) {{TAKE}}');

    // Second creation via mouse click on #create: take 2 is submitted, title reverts to {{TAKE}}
    await page.evaluate(() => {
      document.body.removeAttribute('data-created');
      document.body.removeAttribute('data-created-title');
    });
    await page.locator('#create').click();
    await expect(page.locator('body')).toHaveAttribute('data-created', 'true');
    await expect(page.locator('body')).toHaveAttribute('data-created-title', 'Demo Workspace (ARIA) 2');
    await expect(page.locator('input[placeholder="曲名(任意)"]')).toHaveValue('Demo Workspace (ARIA) {{TAKE}}');

    // Both creates recorded a take-history entry (see SunoController.
    // executeCreateWithTake / captureTakeSnapshot), visible in Settings.
    await sidebarButton.click();
    await expect(dialog.getByRole('heading', { name: 'Suno Create Assistant の設定' })).toBeVisible();
    await gotoTab('テイク履歴');
    await expect(dialog.getByRole('heading', { name: 'テイク履歴' })).toBeVisible();
    await expect(dialog.getByText('Demo Workspace (ARIA) 1', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Demo Workspace (ARIA) 2', { exact: true })).toBeVisible();

    // Verify take history limit setting can be changed and saved
    const limitInput = dialog.locator('.suno-assistant__take-history-limit input[type="number"]');
    await expect(limitInput).toHaveValue('500');
    await limitInput.fill('200');
    await dialog.locator('.suno-assistant__take-history-limit button', { hasText: '保存' }).click();
    await expect(dialog.locator('.suno-assistant__take-history-limit .suno-assistant__format-saved')).toBeVisible();

    // Verify multiple song links are displayed for 2 generated clips
    await expect(dialog.getByRole('link', { name: '曲1を開く' }).first()).toBeVisible();
    await expect(dialog.getByRole('link', { name: '曲2を開く' }).first()).toBeVisible();

    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(dialog.getByRole('heading', { name: 'Suno Create Assistant の設定' })).toBeHidden();

    // Each submission's clip rows (simulated by the fixture's own #create
    // handler, see addClipRow above) get a "パラメータを再利用" button once
    // SunoController's clip-linker matches them to their take-history record.
    const firstClipRows = page.locator('[data-testid="clip-row"]', { hasText: 'Demo Workspace (ARIA) 1' });
    await expect(firstClipRows).toHaveCount(2);
    const reuseBtn = firstClipRows.first().getByRole('button', { name: 'パラメータを再利用' });
    await expect(reuseBtn).toBeVisible();
    await expect(reuseBtn).toHaveCSS('color', 'rgb(234, 122, 59)');
    await expect(firstClipRows.last().getByRole('button', { name: 'パラメータを再利用' })).toBeVisible();

    const secondClipRows = page.locator('[data-testid="clip-row"]', { hasText: 'Demo Workspace (ARIA) 2' });
    await expect(secondClipRows).toHaveCount(2);
    await expect(secondClipRows.first().getByRole('button', { name: 'パラメータを再利用' })).toBeVisible();
    await expect(secondClipRows.last().getByRole('button', { name: 'パラメータを再利用' })).toBeVisible();

    // Clicking it re-applies the recorded More Options without touching Style.
    const styleValueBeforeReuse = await page.locator('[data-testid="create-form-styles-wrapper"] textarea').inputValue();
    await firstClipRows.first().getByRole('button', { name: 'パラメータを再利用' }).click();
    await expect(page.locator('[data-testid="create-form-styles-wrapper"] textarea')).toHaveValue(styleValueBeforeReuse);

    // Export downloads the live settings (including the two take-history
    // entries just recorded) as a JSON backup file.
    await sidebarButton.click();
    await gotoTab('バックアップ');
    await expect(dialog.getByRole('heading', { name: 'バックアップ' })).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'エクスポート' }).click();
    const download = await downloadPromise;
    const exportPath = await download.path();
    expect(exportPath).toBeTruthy();
    const exported = JSON.parse(await readFile(exportPath!, 'utf-8'));
    expect(exported.schemaVersion).toBe(2);
    expect(exported.optionPresets).toHaveLength(1);
    expect(exported.takeHistory.length).toBeGreaterThanOrEqual(2);

    // Import replaces the entire stored schema with the chosen file, after
    // a confirm() the user must accept.
    const importPath = join(profile, 'import-backup.json');
    await writeFile(importPath, JSON.stringify({
      schemaVersion: 2, masteringPrompts: [], optionPresets: [], autoTitleEnabled: false, takeHistory: [],
    }));
    page.once('dialog', (nativeDialog) => void nativeDialog.accept());
    await dialog.locator('input[type="file"]').setInputFiles(importPath);
    await expect(dialog.getByText('設定を読み込みました。')).toBeVisible();
    await gotoTab('テイク履歴');
    await expect(dialog.getByRole('heading', { name: 'テイク履歴' })).toBeVisible();
    await expect(dialog.getByText('まだ記録がありません。')).toBeVisible();
  } finally {
    await context?.close();
    await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
    await rm(profile, { recursive: true, force: true });
  }
});
