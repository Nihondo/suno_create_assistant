// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SunoAdapter } from '../src/suno/adapter';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 40 } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('SunoAdapter title mount anchor', () => {
  it('makes the title card row wrap so Auto title can occupy its own line inside it', () => {
    document.body.innerHTML = `
      <section id="title-card">
        <div id="title-row"><input placeholder="曲名(任意)" /></div>
        <div>保存先…<button>Workspace</button></div>
      </section>
    `;

    const adapter = new SunoAdapter();
    expect(adapter.titleAnchor()).toBe(document.querySelector('#title-row'));
    expect(adapter.titleControlAnchor()).toBe(document.querySelector('#title-row'));
    expect(document.querySelector<HTMLElement>('#title-row')!.style.flexWrap).toBe('wrap');
  });
});

describe('SunoAdapter style mount anchor', () => {
  it('uses the style header row when present, so controls stay mounted when closed', () => {
    document.body.innerHTML = `
      <section id="styles-card">
        <div id="styles-header"><button>スタイル</button></div>
        <div data-testid="create-form-styles-wrapper"><textarea></textarea></div>
      </section>
    `;
    const adapter = new SunoAdapter();
    expect(adapter.styleAnchor()).toBe(document.querySelector('#styles-header'));
  });

  it('falls back to STYLE_WRAPPER when no style heading exists', () => {
    document.body.innerHTML = `
      <section id="styles-card">
        <div data-testid="create-form-styles-wrapper"><textarea></textarea></div>
      </section>
    `;
    const adapter = new SunoAdapter();
    expect(adapter.styleAnchor()).toBe(document.querySelector('[data-testid="create-form-styles-wrapper"]'));
  });

  it('sets and gets style prompt even when textarea is in a closed/hidden wrapper', () => {
    document.body.innerHTML = `
      <section id="styles-card">
        <div id="styles-header"><button>スタイル</button></div>
        <div data-testid="create-form-styles-wrapper" style="display:none"><textarea></textarea></div>
      </section>
    `;
    const adapter = new SunoAdapter();
    const ok = adapter.setStylePrompt('chill ambient');
    expect(ok).toBe(true);
    expect(adapter.getStylePrompt()).toBe('chill ambient');
  });
});

describe('SunoAdapter options mount anchor', () => {
  it('uses the persistent header row (heading + reset action), not the disclosure body', async () => {
    document.body.innerHTML = `
      <section id="options"><button aria-expanded="false">その他のオプション</button><button aria-label="すべてリセット"></button></section>
      <suno-create-assistant data-suno-create-assistant="presets"></suno-create-assistant>
      <section>曲名<input placeholder="曲名(任意)" />保存先…<button>Workspace</button></section>
    `;

    const adapter = new SunoAdapter();
    const header = document.querySelector<HTMLButtonElement>('button')!;
    expect(adapter.optionsAnchor()).toBe(document.querySelector('#options'));

    const listener = vi.fn();
    const stop = adapter.observeForm(listener);
    header.setAttribute('aria-expanded', 'true');
    await new Promise((resolve) => setTimeout(resolve));
    stop();

    expect(listener).toHaveBeenCalled();
  });

  it('falls back to the heading itself when there is no reset action and no room to expand further', () => {
    document.body.innerHTML = `
      <button>その他のオプション</button>
      <div role="slider" aria-label="奇抜さ" aria-valuenow="50"></div>
      <input placeholder="曲名(任意)" />
    `;
    const adapter = new SunoAdapter();
    // The immediate parent already contains the slider body, so the anchor
    // must stop at the heading rather than swallowing the body into the row.
    expect(adapter.optionsAnchor()).toBe(document.querySelector('button'));
  });

  it('finds a role="button" div heading - confirmed production markup, not a real <button>', () => {
    // Verified against the live site: the disclosure trigger is
    // `<div role="button" tabindex="0" aria-expanded="...">`, never a
    // `<button>`. A selector limited to `button` finds nothing there.
    document.body.innerHTML = `
      <div tabindex="0" role="button" aria-expanded="true">
        <div>その他のオプション</div><div>バリエーション</div>
      </div>
      <input placeholder="曲名(任意)" />
    `;
    const adapter = new SunoAdapter();
    expect(adapter.optionsAnchor()).toBe(document.querySelector('[role="button"]'));
  });

  it('notifies the listener when its own host is removed, so callers can restore it', async () => {
    // A mutation record cannot distinguish "we just moved this host" from
    // "Suno deleted it"; the extension needs the latter to reach the
    // listener, so host mutations are deliberately left unfiltered (see
    // observeForm's comment for why this does not loop forever).
    document.body.innerHTML = `
      <section id="options"><button>その他のオプション</button></section>
      <suno-create-assistant data-suno-create-assistant="presets"></suno-create-assistant>
    `;
    const adapter = new SunoAdapter();
    const listener = vi.fn();
    const stop = adapter.observeForm(listener);

    document.querySelector('suno-create-assistant')!.remove();
    await new Promise((resolve) => setTimeout(resolve));
    expect(listener).toHaveBeenCalled();

    stop();
  });
});

function optionsPanelFixture(): string {
  // data-selected="true"/"false" and the role="button" heading below are
  // both confirmed from the live site's DOM, not assumed.
  return `
    <section id="options"><div role="button" aria-expanded="true">その他のオプション</div>
      <input placeholder="スタイルを除外" />
      <div>ボーカル性別<button data-selected="false">男性</button><button data-selected="false">女性</button></div>
      <div>長さ<button data-selected="false">カスタム</button><button data-selected="true">Auto</button></div>
      <div>Maxモード<button data-selected="true">オフ</button><button data-selected="false">オン</button></div>
      <div role="slider" aria-label="奇抜さ" aria-valuenow="50"></div>
      <div role="slider" aria-label="バリエーション" aria-valuenow="0"></div>
      <div>パーソナライズ<button data-selected="false">マイ・テイスト</button><button data-selected="true">オフ</button><button data-selected="false" disabled>オン</button></div>
    </section>
  `;
}

describe('SunoAdapter.readOtherOptions', () => {
  it('returns a partial snapshot with the missing control listed as unreadable, instead of failing outright', async () => {
    // "スタイルの影響" is deliberately omitted to simulate a single relabeled
    // or removed control; every other field must still be read.
    document.body.innerHTML = optionsPanelFixture();
    const adapter = new SunoAdapter();
    const result = await adapter.readOtherOptions();

    expect(result).toBeDefined();
    expect(result!.unreadable).toEqual(['styleInfluence']);
    expect(result!.snapshot.excludedStyles).toBe('');
    expect(result!.snapshot.weirdness).toBe(50);
    expect(result!.snapshot.variation).toBe(0);
    expect(result!.snapshot.maxMode).toBe(false);
  });

  it('reads selection state via the data-selected attribute, not a class name', async () => {
    // Regression test: the toggle buttons' "selected" class name
    // (hxc-btn-variant-standard) is stale on the live site, which now
    // conveys selection only through data-selected="true"/"false". Relying
    // on the class name alone silently misread every toggle's state.
    document.body.innerHTML = optionsPanelFixture();
    const adapter = new SunoAdapter();
    const result = await adapter.readOtherOptions();

    expect(result!.snapshot.vocalGender).toBe('none');
    expect(result!.snapshot.duration.mode).toBe('auto');
    expect(result!.snapshot.maxMode).toBe(false);
    expect(result!.snapshot.personalization.enabled).toBe(false);
  });

  it('returns undefined only when the options heading itself cannot be found', async () => {
    document.body.innerHTML = '<div>no options here</div>';
    const adapter = new SunoAdapter();
    expect(await adapter.readOtherOptions()).toBeUndefined();
  });
});

describe('SunoAdapter.extractSavedStyles', () => {
  it('extracts only the prompt, excluding the saved style name and date', async () => {
    document.body.innerHTML = `
      <dialog role="dialog" aria-label="保存したスタイル" open>
        <div>
          <button aria-label="Night Train">
            <span>Night Train</span>
            <span><span>minimal synthwave, nocturnal pulse</span><span>保存済み: 2026年9月12日</span></span>
          </button>
        </div>
      </dialog>
    `;

    const adapter = new SunoAdapter();

    await expect(adapter.extractSavedStyles()).resolves.toEqual([
      expect.objectContaining({ name: 'Night Train', prompt: 'minimal synthwave, nocturnal pulse' }),
    ]);
  });
});

describe('SunoAdapter.applyOtherOptions', () => {
  it('re-fetches the options panel for each field, so a mid-apply DOM replacement does not leave a later field clicking a detached copy', async () => {
    // Reproduces the reported "プリセットを選択しても、値が設定されない" bug:
    // confirmed on the live site, a single click can make Suno replace the
    // whole options subtree. Reusing one `panel` reference across every
    // field meant every field after the first successful mutation was
    // reading/clicking a detached, stale copy. A click on a truly detached
    // element never bubbles to a document-level listener, so this test's
    // listener firing is direct proof the fix re-fetched a live element.
    document.body.innerHTML = optionsPanelFixture();
    const adapter = new SunoAdapter();

    const femaleButton = [...document.querySelectorAll('button')].find((button) => button.textContent === '女性')!;
    femaleButton.addEventListener('click', () => {
      const options = document.querySelector('#options')!;
      options.replaceWith(options.cloneNode(true));
    }, { once: true });

    let maxOnClickSeenOnConnectedElement = false;
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const row = target.closest('div');
      if (target.tagName === 'BUTTON' && target.textContent === 'オン' && row?.textContent?.replaceAll(/\s+/g, '').startsWith('Maxモード')) {
        maxOnClickSeenOnConnectedElement = target.isConnected;
      }
    }, true);

    const result = await adapter.applyOtherOptions({ vocalGender: 'female', maxMode: true });

    expect(result.skipped).not.toContain('maxMode');
    expect(maxOnClickSeenOnConnectedElement).toBe(true);
  });

  it('steps a slider to the exact target value, one keydown per settled frame', async () => {
    // Confirmed on the live site: firing several ArrowRight keydowns back
    // to back with no yield only moves the slider by one step in total.
    // Waiting a frame (settle()) between each keydown is what makes each
    // one register - this test also guards against requestAnimationFrame
    // being unavailable/unpolyfilled in the test environment, which would
    // otherwise hang this test until timeout instead of failing fast.
    document.body.innerHTML = optionsPanelFixture();
    const adapter = new SunoAdapter();
    const weirdnessSlider = document.querySelector<HTMLElement>('[role="slider"][aria-label="奇抜さ"]')!;
    weirdnessSlider.addEventListener('keydown', (event) => {
      const current = Number(weirdnessSlider.getAttribute('aria-valuenow'));
      const delta = (event as KeyboardEvent).key === 'ArrowRight' ? 1 : -1;
      weirdnessSlider.setAttribute('aria-valuenow', String(current + delta));
    });

    const result = await adapter.applyOtherOptions({ weirdness: 57 });

    expect(result.applied).toContain('weirdness');
    expect(weirdnessSlider.getAttribute('aria-valuenow')).toBe('57');
  });
});

describe('SunoAdapter triggerCreate', () => {
  it('triggers create button with credit counts and ignores navigation buttons', () => {
    document.body.innerHTML = `
      <nav><button>作成</button></nav>
      <main>
        <button id="create-btn"><span>作成</span> <span>10</span></button>
      </main>
    `;

    const adapter = new SunoAdapter();
    let clicked = false;
    document.querySelector('#create-btn')!.addEventListener('click', () => {
      clicked = true;
    });

    const result = adapter.triggerCreate();
    expect(result).toBe(true);
    expect(clicked).toBe(true);
  });

  it('triggers create button matching aria-label and role=button', () => {
    document.body.innerHTML = `
      <main>
        <div role="button" aria-label="Create Song" id="create-div">Create</div>
      </main>
    `;

    const adapter = new SunoAdapter();
    let clicked = false;
    document.querySelector('#create-div')!.addEventListener('click', () => {
      clicked = true;
    });

    const result = adapter.triggerCreate();
    expect(result).toBe(true);
    expect(clicked).toBe(true);
  });

  it('returns false when create button is disabled', () => {
    document.body.innerHTML = `
      <main>
        <button disabled>作成 10</button>
      </main>
    `;

    const adapter = new SunoAdapter();
    const result = adapter.triggerCreate();
    expect(result).toBe(false);
  });
});

