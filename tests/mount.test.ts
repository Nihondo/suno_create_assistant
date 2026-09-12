// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMounter } from '../src/content/mount';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 40 } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('createMounter', () => {
  it('moves the existing host instead of recreating it when the anchor changes', () => {
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const anchorA = document.querySelector<HTMLElement>('#a')!;
    const anchorB = document.querySelector<HTMLElement>('#b')!;
    const mounter = createMounter('');

    mounter.mount('presets', { anchor: anchorA, position: 'afterend' }, () => null);
    const host = mounter.hostOf('presets');
    expect(host).toBeDefined();
    expect(host!.previousElementSibling).toBe(anchorA);

    mounter.mount('presets', { anchor: anchorB, position: 'afterend' }, () => null);
    // Same instance: Shadow DOM and the React root inside it survive the move.
    expect(mounter.hostOf('presets')).toBe(host);
    expect(host!.previousElementSibling).toBe(anchorB);

    mounter.dispose();
  });

  it('reattach() restores a removed host to its last placement, synchronously', () => {
    document.body.innerHTML = '<div id="a"></div>';
    const anchor = document.querySelector<HTMLElement>('#a')!;
    const mounter = createMounter('');
    mounter.mount('presets', { anchor, position: 'afterend' }, () => null);
    const host = mounter.hostOf('presets')!;

    // Simulates Suno's reconciliation deleting the host outright.
    host.remove();
    expect(host.isConnected).toBe(false);

    const moved = mounter.reattach();
    expect(moved).toBe(true);
    expect(mounter.hostOf('presets')).toBe(host);
    expect(host.previousElementSibling).toBe(anchor);

    mounter.dispose();
  });

  it('leaves a host alone when its anchor has also been removed', () => {
    document.body.innerHTML = '<div id="a"></div>';
    const anchor = document.querySelector<HTMLElement>('#a')!;
    const mounter = createMounter('');
    mounter.mount('presets', { anchor, position: 'afterend' }, () => null);
    const host = mounter.hostOf('presets')!;

    anchor.remove();
    host.remove();
    expect(mounter.reattach()).toBe(false);

    mounter.dispose();
  });

  it('reports thrashing after repeated reattachment within the detection window', () => {
    document.body.innerHTML = '<div id="a"></div>';
    const anchor = document.querySelector<HTMLElement>('#a')!;
    const thrashed: string[] = [];
    const mounter = createMounter('', (key) => thrashed.push(key));
    mounter.mount('presets', { anchor, position: 'afterend' }, () => null);
    const host = mounter.hostOf('presets')!;

    for (let i = 0; i < 9; i += 1) {
      host.remove();
      mounter.reattach();
    }

    expect(thrashed).toEqual(['presets']);
    mounter.dispose();
  });

  it('unmounts and removes the host once the anchor is withdrawn', () => {
    document.body.innerHTML = '<div id="a"></div>';
    const anchor = document.querySelector<HTMLElement>('#a')!;
    const mounter = createMounter('');
    mounter.mount('presets', { anchor, position: 'afterend' }, () => null);
    expect(mounter.hostOf('presets')).toBeDefined();

    mounter.mount('presets', { anchor: undefined, position: 'afterend' }, () => null);
    expect(mounter.hostOf('presets')).toBeUndefined();
    expect(document.querySelector('suno-create-assistant')).toBeNull();
  });
});
