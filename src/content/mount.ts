import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';

export type MountPosition = 'afterend' | 'beforebegin' | 'beforeend';

export interface Placement {
  anchor?: HTMLElement;
  position: MountPosition;
}

interface Entry {
  host: HTMLElement;
  root: Root;
  placement: Placement;
  reattachTimestamps: number[];
}

const THRASH_WINDOW_MS = 2000;
const THRASH_LIMIT = 8;

function placedCorrectly(host: HTMLElement, placement: Placement): boolean {
  const { anchor, position } = placement;
  if (!anchor) return false;
  if (position === 'afterend') return host.previousElementSibling === anchor;
  if (position === 'beforebegin') return host.nextElementSibling === anchor;
  // 'beforeend': host must be the last child of anchor.
  return host.parentElement === anchor && anchor.lastElementChild === host;
}

function insertAt(host: HTMLElement, placement: Placement): void {
  const { anchor, position } = placement;
  if (!anchor) return;
  anchor.insertAdjacentElement(position, host);
}

/**
 * Creates hosts that survive Suno's own re-renders. Unlike a naive
 * mount/unmount cycle, an existing host is *moved* back into place rather
 * than torn down and recreated, so its Shadow DOM and React root (and any
 * in-flight component state, such as an open dropdown) are preserved.
 */
export function createMounter(styleCss: string, onThrash?: (key: string) => void) {
  const entries = new Map<string, Entry>();

  const mount = (key: string, placement: Placement, render: () => ReactNode): void => {
    const current = entries.get(key);
    if (!placement.anchor) {
      if (current) {
        current.root.unmount();
        current.host.remove();
        entries.delete(key);
      }
      return;
    }
    if (current) {
      if (!placedCorrectly(current.host, placement)) insertAt(current.host, placement);
      current.placement = placement;
      current.root.render(render());
      return;
    }
    const host = document.createElement('suno-create-assistant');
    host.dataset.sunoCreateAssistant = key;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = styleCss;
    const container = document.createElement('div');
    shadow.append(style, container);
    insertAt(host, placement);
    const root = createRoot(container);
    root.render(render());
    entries.set(key, { host, root, placement, reattachTimestamps: [] });
  };

  const reattach = (): boolean => {
    let moved = false;
    const now = Date.now();
    entries.forEach((entry, key) => {
      const { host, placement } = entry;
      // Fully removed (Suno deleted it) counts as "not correctly placed"
      // just like a host that merely drifted next to the wrong sibling -
      // both are fixed the same way, by reinserting at the placement.
      if (host.isConnected && placedCorrectly(host, placement)) return;
      if (!placement.anchor?.isConnected) return;
      insertAt(host, placement);
      moved = true;
      entry.reattachTimestamps = [...entry.reattachTimestamps.filter((timestamp) => now - timestamp < THRASH_WINDOW_MS), now];
      if (entry.reattachTimestamps.length > THRASH_LIMIT) onThrash?.(key);
    });
    return moved;
  };

  const hostOf = (key: string): HTMLElement | undefined => entries.get(key)?.host;

  const dispose = (): void => {
    entries.forEach(({ root, host }) => {
      root.unmount();
      host.remove();
    });
    entries.clear();
  };

  return { mount, reattach, hostOf, dispose };
}

export type Mounter = ReturnType<typeof createMounter>;
