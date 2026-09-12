// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SunoAdapter } from '../src/suno/adapter';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('SunoAdapter options mount anchor', () => {
  it('uses the persistent reset action in the closed options header', async () => {
    document.body.innerHTML = `
      <section id="options"><button aria-expanded="false">その他のオプション</button><button aria-label="すべてリセット"></button></section>
      <suno-create-assistant data-suno-create-assistant="presets"></suno-create-assistant>
      <section>曲名<input placeholder="曲名(任意)" />保存先…<button>Workspace</button></section>
    `;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 40 } as DOMRect);

    const adapter = new SunoAdapter();
    const header = document.querySelector<HTMLButtonElement>('button')!;
    expect(adapter.optionsAnchor()).toBe(document.querySelector<HTMLButtonElement>('[aria-label="すべてリセット"]'));

    const listener = vi.fn();
    const stop = adapter.observeForm(listener);
    header.setAttribute('aria-expanded', 'true');
    await new Promise((resolve) => setTimeout(resolve));
    stop();

    expect(listener).toHaveBeenCalled();
  });
});
