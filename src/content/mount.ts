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
  thrashNotified: boolean;
}

const THRASH_WINDOW_MS = 2000;
const THRASH_LIMIT = 8;

function placedCorrectly(host: HTMLElement, placement: Placement): boolean {
  const { anchor, position } = placement;
  if (!anchor) return false;
  if (position === 'afterend') return host.previousElementSibling === anchor;
  if (position === 'beforebegin') return host.nextElementSibling === anchor;
  // 'beforeend': merely being a child of anchor is enough. Requiring it to
  // stay the *last* child would fight anything else that also appends to
  // the same anchor (e.g. Suno's own portaled tooltips/toasts on
  // document.body): each of their appends would displace us, our reinsert
  // would displace them back, and - because both sides react via
  // MutationObserver - that exchange can become an unbounded synchronous
  // mutate/react/mutate microtask chain that starves rendering entirely.
  return host.parentElement === anchor;
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
    entries.set(key, { host, root, placement, reattachTimestamps: [], thrashNotified: false });
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
      entry.reattachTimestamps = entry.reattachTimestamps.filter((timestamp) => now - timestamp < THRASH_WINDOW_MS);
      if (entry.reattachTimestamps.length >= THRASH_LIMIT) {
        // Circuit breaker: an anchor that is genuinely being fought over
        // (by Suno, or by anything else) would otherwise have every
        // reinsertion trigger a fresh MutationObserver record, which
        // triggers another reinsertion, forever - a synchronous microtask
        // chain that starves rendering. Stop reinserting for this key
        // until the window ages out on its own; the debounced
        // refreshMounts() (at most every 80ms) still gets a chance to pick
        // a different placement (see suno.content.tsx's onThrash handling).
        if (!entry.thrashNotified) {
          entry.thrashNotified = true;
          onThrash?.(key);
        }
        return;
      }
      entry.thrashNotified = false;
      insertAt(host, placement);
      moved = true;
      entry.reattachTimestamps.push(now);
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
