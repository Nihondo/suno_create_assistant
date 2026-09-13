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

  it('ignores a workspace clip row\'s own "その他のオプション" context-menu button, even when it precedes the real heading in DOM order', () => {
    // Each clip-row in the workspace clip list has a context-menu trigger
    // with the identical aria-label as the "More Options" disclosure
    // heading (confirmed from docs/alldom_ja.txt / alldom_en.txt). DOM
    // order between the create form and the clip list is not a contract,
    // so the clip-row's button is placed first here to prove the exclusion
    // does not merely rely on document order.
    document.body.innerHTML = `
      <div data-testid="clip-row"><button aria-label="その他のオプション" aria-haspopup="menu">…</button></div>
      <button aria-expanded="false">その他のオプション</button>
      <button aria-label="すべてリセット"></button>
    `;
    const adapter = new SunoAdapter();
    const realHeading = document.querySelectorAll('button')[1];
    expect(adapter.optionHeading()).toBe(realHeading);
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
    // or removed control; every other field must still be read. The fixture
    // also has no audio reference attached, so "オーディオの影響" is
    // legitimately absent too (see the readOtherOptions comment on
    // audioInfluence) - both are expected to land in unreadable.
    document.body.innerHTML = optionsPanelFixture();
    const adapter = new SunoAdapter();
    const result = await adapter.readOtherOptions();

    expect(result).toBeDefined();
    expect(result!.unreadable).toEqual(['styleInfluence', 'audioInfluence']);
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

  function sliderReadoutFixture(initialValue: number): string {
    // Confirmed on the live site: the "NN%" readout - and, once revealed,
    // the editable <input> - are always the slider's own nextElementSibling.
    return `
      <section id="options"><div role="button" aria-expanded="true">その他のオプション</div>
        <div role="slider" aria-label="奇抜さ" aria-valuenow="${initialValue}"></div><div class="readout">${initialValue}%</div>
      </section>
    `;
  }

  it('commits a slider value via the double-click readout + Enter fast path, without falling back to arrow stepping', async () => {
    // Confirmed manually on the live site (double-click 奇抜さ's "NN%"
    // readout, type a value, press Enter, click an unrelated toggle, wait
    // ~1-2s): the committed value survives a subsequent unrelated field's
    // mutation - unlike an earlier, reverted attempt that never pressed
    // Enter (see the comment above trySliderFastCommit in adapter.ts).
    document.body.innerHTML = sliderReadoutFixture(50);
    const adapter = new SunoAdapter();
    const panel = document.querySelector<HTMLElement>('#options')!;
    const readout = panel.querySelector<HTMLElement>('.readout')!;
    const slider = panel.querySelector<HTMLElement>('[role="slider"][aria-label="奇抜さ"]')!;
    let arrowKeyDispatched = false;
    slider.addEventListener('keydown', () => { arrowKeyDispatched = true; });

    readout.addEventListener('dblclick', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = slider.getAttribute('aria-valuenow') ?? '';
      input.addEventListener('keydown', (event) => {
        if ((event as KeyboardEvent).key !== 'Enter') return;
        slider.setAttribute('aria-valuenow', input.value);
        input.replaceWith(readout);
        readout.textContent = `${input.value}%`;
      });
      readout.replaceWith(input);
    });

    const result = await adapter.applyOtherOptions({ weirdness: 80 });

    expect(result.applied).toContain('weirdness');
    expect(panel.querySelector('[role="slider"][aria-label="奇抜さ"]')!.getAttribute('aria-valuenow')).toBe('80');
    expect(arrowKeyDispatched).toBe(false);
  });

  it('falls back to arrow-key stepping when double-clicking the readout reveals no input', async () => {
    document.body.innerHTML = sliderReadoutFixture(50);
    const adapter = new SunoAdapter();
    const panel = document.querySelector<HTMLElement>('#options')!;
    const slider = panel.querySelector<HTMLElement>('[role="slider"][aria-label="奇抜さ"]')!;
    slider.addEventListener('keydown', (event) => {
      const current = Number(slider.getAttribute('aria-valuenow'));
      const delta = (event as KeyboardEvent).key === 'ArrowRight' ? 1 : -1;
      slider.setAttribute('aria-valuenow', String(current + delta));
    });

    const result = await adapter.applyOtherOptions({ weirdness: 53 });

    expect(result.applied).toContain('weirdness');
    expect(slider.getAttribute('aria-valuenow')).toBe('53');
  });

  it('falls back to arrow-key stepping when the fast-commit path reveals an input but the value is never actually reflected back', async () => {
    // Guards against trusting a "looks committed" result: if Enter is
    // dispatched but aria-valuenow does not end up matching afterward,
    // trySliderFastCommit() must report failure rather than a false
    // success, so setSlider() falls through to the proven arrow-key path.
    document.body.innerHTML = sliderReadoutFixture(50);
    const adapter = new SunoAdapter();
    const panel = document.querySelector<HTMLElement>('#options')!;
    const readout = panel.querySelector<HTMLElement>('.readout')!;
    const slider = panel.querySelector<HTMLElement>('[role="slider"][aria-label="奇抜さ"]')!;
    let arrowKeyDispatched = false;
    slider.addEventListener('keydown', (event) => {
      arrowKeyDispatched = true;
      const current = Number(slider.getAttribute('aria-valuenow'));
      const delta = (event as KeyboardEvent).key === 'ArrowRight' ? 1 : -1;
      slider.setAttribute('aria-valuenow', String(current + delta));
    });

    readout.addEventListener('dblclick', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = slider.getAttribute('aria-valuenow') ?? '';
      // Deliberately never updates aria-valuenow, simulating a commit that
      // silently does not take effect.
      readout.replaceWith(input);
    });

    const result = await adapter.applyOtherOptions({ weirdness: 55 });

    expect(result.applied).toContain('weirdness');
    expect(slider.getAttribute('aria-valuenow')).toBe('55');
    expect(arrowKeyDispatched).toBe(true);
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

  it('detects create buttons and gets title from input', () => {
    document.body.innerHTML = `
      <section>
        <div><input placeholder="曲名(任意)" value="My Song {{TAKE}}" /></div>
        <div>保存先…<button>Workspace</button></div>
      </section>
      <main>
        <button id="create-btn">作成 10</button>
        <button id="other-btn">その他</button>
        <suno-create-assistant><button id="assistant-btn">作成</button></suno-create-assistant>
      </main>
    `;

    const adapter = new SunoAdapter();
    expect(adapter.getTitle()).toBe('My Song {{TAKE}}');

    const createBtn = document.querySelector<HTMLElement>('#create-btn')!;
    const otherBtn = document.querySelector<HTMLElement>('#other-btn')!;
    const assistantBtn = document.querySelector<HTMLElement>('#assistant-btn')!;

    expect(adapter.isCreateButton(createBtn)).toBe(true);
    expect(adapter.isCreateButton(otherBtn)).toBe(false);
    expect(adapter.isCreateButton(assistantBtn)).toBe(false);
    expect(adapter.getCreateButton()).toBe(createBtn);
  });
});

describe('SunoAdapter sidebarPlacement', () => {
  it('places after hooks link when present', () => {
    document.body.innerHTML = `
      <div class="flex flex-col gap-px px-3">
        <a href="/discover">ホーム</a>
        <a href="/create">作成</a>
        <a href="/hooks">Hooks</a>
        <div class="group/profile-row hxc-btn-split-root">nihondo</div>
      </div>
    `;

    const adapter = new SunoAdapter();
    const placement = adapter.sidebarPlacement();
    expect(placement).toBeDefined();
    expect(placement!.anchor).toBe(document.querySelector('a[href="/hooks"]'));
    expect(placement!.position).toBe('afterend');
  });

  it('falls back to before profile row when hooks link is absent', () => {
    document.body.innerHTML = `
      <div class="flex flex-col gap-px px-3">
        <a href="/discover">ホーム</a>
        <a href="/create">作成</a>
        <div class="group/profile-row hxc-btn-split-root">nihondo</div>
      </div>
    `;

    const adapter = new SunoAdapter();
    const placement = adapter.sidebarPlacement();
    expect(placement).toBeDefined();
    expect(placement!.anchor).toBe(document.querySelector('.group\\/profile-row'));
    expect(placement!.position).toBe('beforebegin');
  });

  it('falls back to nav container end when neither hooks nor profile row exist', () => {
    document.body.innerHTML = `
      <div id="nav" class="flex flex-col gap-px px-3">
        <a href="/discover">ホーム</a>
        <a href="/create">作成</a>
      </div>
    `;

    const adapter = new SunoAdapter();
    const placement = adapter.sidebarPlacement();
    expect(placement).toBeDefined();
    expect(placement!.anchor).toBe(document.querySelector('#nav'));
    expect(placement!.position).toBe('beforeend');
  });

  it('returns undefined when no sidebar nav can be found', () => {
    document.body.innerHTML = '<div>no nav</div>';
    const adapter = new SunoAdapter();
    expect(adapter.sidebarPlacement()).toBeUndefined();
  });
});

describe('SunoAdapter lyricsHeading', () => {
  it('finds role="button" or button element with 歌詞 or Lyrics', () => {
    document.body.innerHTML = `
      <section id="lyrics">
        <div id="lyrics-btn" role="button" tabindex="0" aria-expanded="true">歌詞</div>
      </section>
      <section id="styles">
        <div role="button" tabindex="0">スタイル</div>
      </section>
    `;

    const adapter = new SunoAdapter();
    const heading = adapter.lyricsHeading();
    expect(heading).toBe(document.querySelector('#lyrics-btn'));
  });

  it('finds English Lyrics heading', () => {
    document.body.innerHTML = `
      <section id="lyrics">
        <button id="lyrics-btn" aria-expanded="true">Lyrics</button>
      </section>
    `;

    const adapter = new SunoAdapter();
    const heading = adapter.lyricsHeading();
    expect(heading).toBe(document.querySelector('#lyrics-btn'));
  });

  it('ignores elements inside suno-create-assistant or dialog', () => {
    document.body.innerHTML = `
      <suno-create-assistant>
        <button>歌詞</button>
      </suno-create-assistant>
      <dialog role="dialog">
        <button>歌詞</button>
      </dialog>
    `;

    const adapter = new SunoAdapter();
    expect(adapter.lyricsHeading()).toBeUndefined();
  });
});

describe('SunoAdapter lyricsAnchor and lyricsEditor', () => {
  it('locates lyrics header row as anchor and finds textarea editor', () => {
    document.body.innerHTML = `
      <section id="lyrics">
        <div id="lyrics-header">
          <div id="lyrics-btn" role="button" tabindex="0" aria-expanded="true">歌詞</div>
        </div>
        <div id="lyrics-wrapper">
          <textarea placeholder="歌詞を入力"></textarea>
        </div>
      </section>
    `;

    const adapter = new SunoAdapter();
    const anchor = adapter.lyricsAnchor();
    expect(anchor).toBe(document.querySelector('#lyrics-header'));

    const editor = adapter.lyricsEditor();
    expect(editor).toBe(document.querySelector('textarea'));
  });

  it('finds Lexical contenteditable editor', () => {
    document.body.innerHTML = `
      <section id="lyrics">
        <div id="lyrics-header">
          <button role="button" aria-expanded="true">Lyrics</button>
        </div>
        <div class="lyrics-editor-content" contenteditable="true" data-lexical-editor="true">
          <p class="lyrics-paragraph"><br></p>
        </div>
      </section>
    `;

    const adapter = new SunoAdapter();
    const editor = adapter.lyricsEditor();
    expect(editor).toBe(document.querySelector('.lyrics-editor-content'));
  });

  it('inserts tag into textarea and expands disclosure if closed', async () => {
    document.body.innerHTML = `
      <section id="lyrics">
        <div id="lyrics-header">
          <div id="lyrics-btn" role="button" tabindex="0" aria-expanded="false">歌詞</div>
        </div>
        <div id="lyrics-wrapper">
          <textarea placeholder="歌詞を入力"></textarea>
        </div>
      </section>
    `;

    const btn = document.querySelector('#lyrics-btn')!;
    btn.addEventListener('click', () => {
      btn.setAttribute('aria-expanded', 'true');
    });

    const adapter = new SunoAdapter();
    const result = await adapter.insertLyricsTag('Verse 1');
    expect(result).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    const textarea = document.querySelector('textarea')!;
    expect(textarea.value).toBe('[Verse 1]\n');
  });

  it('appends tag after existing text in textarea', async () => {
    document.body.innerHTML = `
      <section id="lyrics">
        <div id="lyrics-header">
          <div role="button" tabindex="0" aria-expanded="true">歌詞</div>
        </div>
        <div id="lyrics-wrapper">
          <textarea placeholder="歌詞を入力">Existing line</textarea>
        </div>
      </section>
    `;

    const textarea = document.querySelector('textarea')!;
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;

    const adapter = new SunoAdapter();
    await adapter.insertLyricsTag('[Chorus]');
    expect(textarea.value).toBe('Existing line\n[Chorus]\n');
  });

  it('inserts tag with line breaks into Lexical contenteditable via paste listener', async () => {
    document.body.innerHTML = `
      <section id="lyrics">
        <div id="lyrics-header">
          <div role="button" tabindex="0" aria-expanded="true">歌詞</div>
        </div>
        <div class="lyrics-editor-content" contenteditable="true" data-lexical-editor="true">
          <p class="lyrics-paragraph">Intro line</p>
        </div>
      </section>
    `;

    const editor = document.querySelector<HTMLElement>('.lyrics-editor-content')!;
    let pastedText = '';
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      pastedText = e.clipboardData?.getData('text/plain') ?? '';
      const p = document.createElement('p');
      p.className = 'lyrics-paragraph';
      p.textContent = pastedText.trim();
      editor.appendChild(p);
    });

    const adapter = new SunoAdapter();
    const res = await adapter.insertLyricsTag('Verse 1');
    expect(res).toBe(true);
    expect(pastedText).toBe('\n[Verse 1]\n');
    expect(editor.innerHTML).toContain('[Verse 1]');
  });

  it('inserts tag into contenteditable via DOM fallback if unhandled', async () => {
    document.body.innerHTML = `
      <section id="lyrics">
        <div id="lyrics-header">
          <div role="button" tabindex="0" aria-expanded="true">歌詞</div>
        </div>
        <div class="lyrics-editor-content" contenteditable="true">
          <p class="lyrics-paragraph"><br></p>
        </div>
      </section>
    `;

    const adapter = new SunoAdapter();
    const res = await adapter.insertLyricsTag('Outro');
    expect(res).toBe(true);
    const editor = document.querySelector<HTMLElement>('.lyrics-editor-content')!;
    expect(editor.innerHTML).toContain('[Outro]');
  });

  it('inserts tag from initially unfocused state after selection synchronization', async () => {
    document.body.innerHTML = `
      <section id="lyrics">
        <div id="lyrics-header">
          <div role="button" tabindex="0" aria-expanded="true">歌詞</div>
        </div>
        <div class="lyrics-editor-content" contenteditable="true" data-lexical-editor="true">
          <p class="lyrics-paragraph">Existing line</p>
        </div>
      </section>
    `;

    const editor = document.querySelector<HTMLElement>('.lyrics-editor-content')!;
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const p = document.createElement('p');
      p.className = 'lyrics-paragraph';
      p.textContent = text.trim();
      editor.appendChild(p);
    });

    const adapter = new SunoAdapter();
    const res = await adapter.insertLyricsTag('Chorus');
    expect(res).toBe(true);
    expect(editor.textContent).toContain('[Chorus]');
  });
});

describe('SunoAdapter isAdvancedTab', () => {
  it('detects advanced tab when selected', () => {
    document.body.innerHTML = `
      <div>
        <button role="tab" aria-selected="false">シンプル</button>
        <button role="tab" aria-selected="true">アドバンスト</button>
      </div>
    `;

    const adapter = new SunoAdapter();
    expect(adapter.isAdvancedTab()).toBe(true);
  });

  it('returns false when advanced tab is not selected', () => {
    document.body.innerHTML = `
      <div>
        <button role="tab" aria-selected="true">シンプル</button>
        <button role="tab" aria-selected="false">アドバンスト</button>
      </div>
    `;

    const adapter = new SunoAdapter();
    expect(adapter.isAdvancedTab()).toBe(false);
  });

  it('falls back to anchors when no tabs exist', () => {
    document.body.innerHTML = `
      <section id="styles-card">
        <div id="styles-header"><button>スタイル</button></div>
        <div data-testid="create-form-styles-wrapper"><textarea></textarea></div>
      </section>
    `;

    const adapter = new SunoAdapter();
    expect(adapter.isAdvancedTab()).toBe(true);
  });
});

describe('SunoAdapter closeDisclosures', () => {
  it('clicks only expanded disclosures and leaves closed ones alone', () => {
    document.body.innerHTML = `
      <section id="lyrics">
        <div id="lyrics-head" role="button" aria-expanded="true">歌詞</div>
      </section>
      <section id="styles">
        <div id="styles-head" role="button" aria-expanded="false">スタイル</div>
      </section>
      <section id="options">
        <div id="options-head" role="button" aria-expanded="true">その他のオプション</div>
      </section>
    `;

    const adapter = new SunoAdapter();
    const clicks: string[] = [];
    document.querySelector('#lyrics-head')!.addEventListener('click', () => { clicks.push('lyrics'); });
    document.querySelector('#styles-head')!.addEventListener('click', () => { clicks.push('styles'); });
    document.querySelector('#options-head')!.addEventListener('click', () => { clicks.push('options'); });

    const result = adapter.closeDisclosures();
    expect(result.closedLyrics).toBe(true);
    expect(result.closedStyle).toBe(false); // already false
    expect(result.closedOptions).toBe(true);
    expect(clicks).toEqual(['lyrics', 'options']);
  });
});

describe('SunoAdapter getAudioTitle', () => {
  it('extracts audio title from next sibling of play button as in production DOM', () => {
    document.body.innerHTML = `
      <div class="css-qpmetk e5c85y66">
        <div role="button" tabindex="0" aria-label="オーディオを再生" class="css-bbwqoh e5c85y67" style="border-radius: 8px;">
          <img alt="ドラゴンクエストII 果てしなき世界 (ROADSHOW)のカバーアート" data-src="https://example.com/art.jpg" src="https://example.com/art.jpg">
          <div><svg></svg></div>
        </div>
        <div class="flex min-w-0 flex-1 flex-col">
          <div class="css-14p9rp6 e5c85y68">ドラゴンクエストII 果てしなき世界 (ROADSHOW)</div>
          <div class="css-i9eyaz e5c85y69"><span><span>00:00</span><span>/</span><span>03:20</span></span></div>
        </div>
      </div>
    `;

    const adapter = new SunoAdapter();
    expect(adapter.getAudioTitle()).toBe('ドラゴンクエストII 果てしなき世界 (ROADSHOW)');
  });

  it('supports English Play audio label and pause state', () => {
    document.body.innerHTML = `
      <div>
        <button aria-label="Play audio">
          <img alt="My English Song cover art" src="art.png" />
        </button>
        <div>
          <div>My English Song</div>
          <div>00:15 / 02:40</div>
        </div>
      </div>
    `;

    const adapter = new SunoAdapter();
    expect(adapter.getAudioTitle()).toBe('My English Song');

    // Pause state
    document.querySelector('button')!.setAttribute('aria-label', 'Pause audio');
    expect(adapter.getAudioTitle()).toBe('My English Song');
  });

  it('falls back to cover art img alt attribute if sibling text is missing', () => {
    document.body.innerHTML = `
      <div>
        <div role="button" aria-label="オーディオを再生">
          <img alt="英雄の詩のカバーアート" src="art.png" />
        </div>
      </div>
    `;

    const adapter = new SunoAdapter();
    expect(adapter.getAudioTitle()).toBe('英雄の詩');
  });

  it('returns empty string when no audio card exists', () => {
    document.body.innerHTML = `<div><p>No audio</p></div>`;
    const adapter = new SunoAdapter();
    expect(adapter.getAudioTitle()).toBe('');
  });
});

function clipRowFixture(songId: string, title: string): string {
  // Structure confirmed from docs/alldom_ja.txt / docs/showmore.txt - the
  // <a href="/song/<uuid>"> is the only DOM-visible way to resolve a
  // clip's title to its song id.
  return `
    <div data-testid="clip-row" role="group" aria-label="${title}" data-clip-status="complete">
      <div><a href="/song/${songId}">${title}</a></div>
      <div>
        <button aria-label="クリップに「いいね」"></button>
        <button aria-label="クリップを低評価"></button>
        <button aria-label="クリップをワークスペースに固定"></button>
        <button aria-label="クリップを共有"></button>
      </div>
    </div>
  `;
}

describe('SunoAdapter.clipRows', () => {
  it('extracts title, song id, and status from each clip row', () => {
    document.body.innerHTML = `
      ${clipRowFixture('11111111-1111-1111-1111-111111111111', 'First Song')}
      ${clipRowFixture('22222222-2222-2222-2222-222222222222', 'Second Song')}
    `;
    const adapter = new SunoAdapter();
    const rows = adapter.clipRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ title: 'First Song', songId: '11111111-1111-1111-1111-111111111111', status: 'complete' });
    expect(rows[1]).toMatchObject({ title: 'Second Song', songId: '22222222-2222-2222-2222-222222222222', status: 'complete' });
  });

  it('excludes a row with no resolvable song id', () => {
    document.body.innerHTML = `
      <div data-testid="clip-row" role="group" aria-label="Still generating" data-clip-status="pending"></div>
    `;
    const adapter = new SunoAdapter();
    expect(adapter.clipRows()).toEqual([]);
  });

  it('anchors to the parent of the "like" action button, not the row itself', () => {
    document.body.innerHTML = clipRowFixture('11111111-1111-1111-1111-111111111111', 'First Song');
    const adapter = new SunoAdapter();
    const [row] = adapter.clipRows();
    const likeButton = document.querySelector('[aria-label="クリップに「いいね」"]')!;
    expect(adapter.clipRowActionAnchor(row!.row)).toBe(likeButton.parentElement);
  });
});

describe('SunoAdapter.getModelName', () => {
  it('reads the model name from the aria-expanded selector button', () => {
    document.body.innerHTML = `
      <button aria-expanded="false">v6</button>
      <div role="button" aria-expanded="true">その他のオプション</div>
    `;
    const adapter = new SunoAdapter();
    expect(adapter.getModelName()).toBe('v6');
  });

  it('returns an empty string when no model selector can be found', () => {
    document.body.innerHTML = `<div role="button" aria-expanded="true">その他のオプション</div>`;
    const adapter = new SunoAdapter();
    expect(adapter.getModelName()).toBe('');
  });

  it('ignores a clip row\'s own aria-expanded elements', () => {
    document.body.innerHTML = `
      <div data-testid="clip-row"><button aria-expanded="false">v6-mini</button></div>
      <button aria-expanded="false">v6</button>
    `;
    const adapter = new SunoAdapter();
    expect(adapter.getModelName()).toBe('v6');
  });
});

describe('SunoAdapter English DOM localization (docs/alldom_en.txt)', () => {
  it('detects English More Options heading and reset button', () => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = `
      <section id="options-card">
        <div id="options-header">
          <div role="button" tabindex="0" aria-expanded="false">
            <span><svg></svg></span>
            <div>
              <div>More Options</div>
              <div>Exclude "acordion", Variety</div>
            </div>
          </div>
          <button type="button" aria-label="Reset All">Reset All</button>
        </div>
        <div id="options-body">
          <div role="slider" aria-label="Weirdness" aria-valuenow="50"></div>
          <div role="slider" aria-label="Style Influence" aria-valuenow="50"></div>
        </div>
      </section>
    `;

    const adapter = new SunoAdapter();
    expect(adapter.optionHeading()).toBeDefined();
    expect(adapter.optionHeading()?.textContent).toContain('More Options');
    expect(adapter.optionsAnchor()).toBe(document.querySelector('#options-header'));
  });

  it('detects English Styles and Lyrics headings', () => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = `
      <section id="lyrics-card">
        <div role="button" tabindex="0" aria-expanded="false">
          <span><svg></svg></span>
          <div>Lyrics</div>
        </div>
      </section>
      <section id="styles-card">
        <div role="button" tabindex="0" aria-expanded="false">
          <span><svg></svg></span>
          <div>
            <div>Styles</div>
            <div>Romantic orchestral ensemble...</div>
          </div>
        </div>
      </section>
    `;

    const adapter = new SunoAdapter();
    expect(adapter.lyricsHeading()).toBeDefined();
    expect(adapter.lyricsHeading()?.textContent).toContain('Lyrics');
    expect(adapter.styleHeading()).toBeDefined();
    expect(adapter.styleHeading()?.textContent).toContain('Styles');
  });

  it('locates English Title input and workspace destination', () => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = `
      <section id="title-card">
        <div id="title-row"><input placeholder="Song Title (Optional)" /></div>
        <div>Save to...<button>Dragon Quest II</button></div>
      </section>
    `;

    const adapter = new SunoAdapter();
    expect(adapter.titleAnchor()).toBe(document.querySelector('#title-row'));
    expect(adapter.titleControlAnchor()).toBe(document.querySelector('#title-row'));
    expect(adapter.getDestinationName()).toBe('Dragon Quest II');
  });

  it('reads all English Other Options panel values', async () => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = `
      <section id="options-card">
        <div role="button" tabindex="0" aria-expanded="true">
          <div>More Options</div>
        </div>
        <div id="options-body">
          <div><input placeholder="Exclude styles" value="techno, metal" /></div>
          <div>
            Vocal Gender
            <div>
              <button data-selected="false">Male</button>
              <button data-selected="true">Female</button>
            </div>
          </div>
          <div>
            Duration
            <div>
              <button data-selected="true">Custom</button>
              <button data-selected="false">Auto</button>
            </div>
            <input type="number" value="150" />
          </div>
          <div>
            Max Mode
            <div>
              <button data-selected="false">Off</button>
              <button data-selected="true">On</button>
            </div>
          </div>
          <div>
            <div role="slider" aria-label="Weirdness" aria-valuenow="65"></div>
            <div role="slider" aria-label="Style Influence" aria-valuenow="80"></div>
            <div role="slider" aria-label="Variety" aria-valuenow="10"></div>
            <div role="slider" aria-label="Audio Influence" aria-valuenow="70"></div>
          </div>
          <div>
            Personalize
            <div>
              <button>My Taste</button>
              <button data-selected="false">Off</button>
              <button data-selected="true">On</button>
            </div>
          </div>
        </div>
      </section>
    `;

    const adapter = new SunoAdapter();
    const result = await adapter.readOtherOptions();
    expect(result).toBeDefined();
    expect(result!.unreadable).toEqual([]);
    expect(result!.snapshot).toEqual({
      excludedStyles: 'techno, metal',
      vocalGender: 'female',
      duration: { mode: 'custom', seconds: 150 },
      maxMode: true,
      weirdness: 65,
      styleInfluence: 80,
      variation: 10,
      audioInfluence: 70,
      personalization: { enabled: true, tasteName: 'My Taste' },
    });
  });

  it('applies values to English Other Options panel', async () => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = `
      <section id="options-card">
        <div role="button" tabindex="0" aria-expanded="true">
          <div>More Options</div>
        </div>
        <div id="options-body">
          <div><input placeholder="Exclude styles" value="" /></div>
          <div>
            Vocal Gender
            <div>
              <button id="male-btn" data-selected="false">Male</button>
              <button id="female-btn" data-selected="false">Female</button>
            </div>
          </div>
          <div>
            Duration
            <div>
              <button id="custom-btn" data-selected="false">Custom</button>
              <button id="auto-btn" data-selected="true">Auto</button>
            </div>
            <input type="number" value="" />
          </div>
          <div>
            Max Mode
            <div>
              <button id="off-btn" data-selected="true">Off</button>
              <button id="on-btn" data-selected="false">On</button>
            </div>
          </div>
          <div>
            <div role="slider" aria-label="Weirdness" aria-valuenow="50"></div>
            <div role="slider" aria-label="Style Influence" aria-valuenow="50"></div>
            <div role="slider" aria-label="Variety" aria-valuenow="0"></div>
            <div role="slider" aria-label="Audio Influence" aria-valuenow="70"></div>
          </div>
          <div>
            Personalize
            <div>
              <button>My Taste</button>
              <button id="pers-off" data-selected="true">Off</button>
              <button id="pers-on" data-selected="false">On</button>
            </div>
          </div>
        </div>
      </section>
    `;

    const maleBtn = document.querySelector<HTMLButtonElement>('#male-btn')!;
    maleBtn.addEventListener('click', () => { maleBtn.setAttribute('data-selected', 'true'); });

    const onBtn = document.querySelector<HTMLButtonElement>('#on-btn')!;
    onBtn.addEventListener('click', () => { onBtn.setAttribute('data-selected', 'true'); });

    const adapter = new SunoAdapter();
    const result = await adapter.applyOtherOptions({
      excludedStyles: 'synthwave',
      vocalGender: 'male',
      maxMode: true,
      weirdness: 50,
      styleInfluence: 50,
      variation: 0,
      audioInfluence: 70,
    });

    expect(result.skipped).toEqual([]);
    expect(document.querySelector<HTMLInputElement>('input[placeholder="Exclude styles"]')!.value).toBe('synthwave');
    expect(maleBtn.getAttribute('data-selected')).toBe('true');
    expect(onBtn.getAttribute('data-selected')).toBe('true');
  });

  it('extracts saved styles from English dialog and ignores actions', async () => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = `
      <button aria-label="View saved style prompts">Open</button>
      <div role="dialog" aria-label="Saved Styles">
        <div>
          <button aria-label="Delete">Delete</button>
          <button aria-label="Rename">Rename</button>
          <button aria-label="Grid View">Grid</button>
        </div>
        <div>
          <button aria-label="Cyberpunk Jazz">
            <span>Cyberpunk Jazz</span>
          </button>
          <span>
            <span>Heavy electronic bass with soprano sax and vocoder</span>
            <span>saved: 3 days ago</span>
          </span>
        </div>
      </div>
    `;

    const adapter = new SunoAdapter();
    const styles = await adapter.extractSavedStyles();
    expect(styles).toHaveLength(1);
    expect(styles[0]?.name).toBe('Cyberpunk Jazz');
    expect(styles[0]?.prompt).toBe('Heavy electronic bass with soprano sax and vocoder');
  });
});



