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
  return `
    <section id="options"><button>その他のオプション</button>
      <input placeholder="スタイルを除外" />
      <div>ボーカル性別<button>男性</button><button>女性</button></div>
      <div>長さ<button>カスタム</button><button class="hxc-btn-variant-standard">Auto</button></div>
      <div>Maxモード<button class="hxc-btn-variant-standard">オフ</button><button>オン</button></div>
      <div role="slider" aria-label="奇抜さ" aria-valuenow="50"></div>
      <div role="slider" aria-label="バリエーション" aria-valuenow="0"></div>
      <div>パーソナライズ<button>マイ・テイスト</button><button class="hxc-btn-variant-standard">オフ</button><button disabled>オン</button></div>
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

  it('returns undefined only when the options heading itself cannot be found', async () => {
    document.body.innerHTML = '<div>no options here</div>';
    const adapter = new SunoAdapter();
    expect(await adapter.readOtherOptions()).toBeUndefined();
  });
});
