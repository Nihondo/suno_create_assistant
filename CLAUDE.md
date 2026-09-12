# Suno Create Assistant development notes

## Stack and commands

This is a Manifest V3 Chrome extension built with WXT, React, TypeScript, and pnpm.

Permissions are `['storage']` only. There is no `tabs` permission and no cross-tab option-capture messaging: the mastering/preset management UI runs inside the Suno tab itself (see below), so there is nothing left that needs to read another tab's state.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build` before handoff. The unpacked build output is `output/chrome-mv3`.

`tests/e2e/extension.spec.ts` starts a local HTTPS fixture mapped to `suno.com` only inside Playwright Chromium. Install its browser with `pnpm exec playwright install chromium`; the E2E test does not contact Suno.

## Suno integration rules

- Run the content script only on `https://suno.com/create*`. The settings dialog host is mounted unconditionally; the styles/presets/title controls only mount while the Advanced tab is active.
- Keep all host-page selectors in `src/suno/adapter.ts`. Prefer stable data attributes, accessible labels, placeholders, and relative structure over CSS classes.
- Suno is a React SPA. Update controlled host inputs through native property setters followed by bubbling `input` and `change` events.
- Never access private Suno APIs, cookies, or page-framework state. Saved styles are read only from the visible native dialog and are never persisted by the extension.
- Content UI is mounted in a Shadow DOM and must not use untrusted text as HTML.
- **Mounting survives Suno's re-renders by moving hosts, not recreating them.** `src/content/mount.ts`'s `createMounter()` keeps one `<suno-create-assistant>` host (and its React root) per key for the life of the page; when Suno's reconciliation deletes or displaces a host, the mounter moves the *same* host back into place via `insertAdjacentElement` instead of unmounting/remounting React. `Mounter.reattach()` runs synchronously inside the `MutationObserver` callback in `entrypoints/suno.content.tsx` (before the debounced `refreshMounts()`), so a deleted host reappears before the next paint instead of flickering. Do not reintroduce the old pattern of tearing down and recreating the host on every anchor change.
- `SunoAdapter.observeForm()` deliberately does **not** filter out mutations caused by the extension's own hosts. A `MutationRecord` cannot distinguish "we just moved this host" from "Suno deleted it," and the latter is exactly the case `reattach()` must react to. This is safe because `reattach()`/`mount()` are idempotent (a correctly-placed host triggers no further DOM change), so the self-triggered pass terminates after one cycle. If you're tempted to add a self-mutation filter here again, don't — see `tests/adapter.test.ts`'s "notifies the listener when its own host is removed" case, which exists specifically to catch a regression of this.
- The Preset control's anchor is `SunoAdapter.optionsAnchor()` (→ `optionHeaderRow()`), which returns the *persistent header row* of the "その他のオプション" disclosure (the heading plus its "すべてリセット" button, when present) — never the disclosure body, which Suno replaces wholesale during reconciliation. If `optionHeaderRow()` cannot find a heading, `mount.ts`'s thrash detector (>8 reattachments within 2s) trips `onThrash('presets')` in `entrypoints/suno.content.tsx`, which falls back to placing the presets control directly above the title input (`titleAnchor`, `beforebegin`) for the rest of that page session.
- Dropdown listboxes are native Popovers so they escape Suno's overflow clipping. Their document-level outside-click check must use `Event.composedPath()` because Shadow DOM retargets events at the host.
- Keep the host-page inspiration-label shortening and Create-button lookup in `src/suno/adapter.ts`. The Manifest `trigger-suno-create` command has no default key; users assign it in Chrome's extension shortcut settings.
- **Mastering and preset management live in `src/content/SettingsDialog.tsx`**, a modal `<dialog>` mounted inside the Suno page's Shadow DOM (key `'settings'` in `suno.content.tsx`, always mounted regardless of the active tab). `SunoController.openSettings('masterings' | 'presets')` / `closeSettings()` drive it. There is no more `OPEN_OPTIONS` or `CAPTURE_LAST_SUNO` messaging, and no `chrome.tabs.query` for a Suno tab — `SunoController.captureOptions()` calls `SunoAdapter.readOtherOptions()` directly in the same page, which is why the previous background-tab timer-throttling failure mode (Chrome deprioritizing `requestAnimationFrame`/timers in an inactive tab, starving the disclosure-open polling loop) cannot happen anymore. The extension options page (`src/options/OptionsApp.tsx`) now only hosts the Create-shortcut link to `chrome://extensions/shortcuts`.
- `SunoAdapter.readOtherOptions()` returns `OtherOptionsCapture { snapshot, unreadable }` rather than failing outright when one control can't be found: each of the 8 fields is read independently, and only the ones whose row/slider/input is missing are added to `unreadable`. `optionPanelAndHeading()`/`optionControlsVisible()` locate the panel via `PANEL_MATCHERS`, staged from most to least specific (both known sliders → any slider → any known settings row), so a single relabeled control no longer fails the whole capture. `SettingsDialog` disables the checkbox for any key listed in `unreadable` and shows `describeSkipped()` of them as a notice.
- **Confirmed production DOM facts (verified via a live-site console dump, not assumed)** — check these before "fixing" a selector back to something that only looks more idiomatic:
  - The "その他のオプション" disclosure trigger is `<div role="button" tabindex="0" aria-expanded="...">`, **not** a `<button>`. `optionHeading()` matches `'button, [role="button"]'` for exactly this reason; don't narrow it back to `button` alone.
  - Its "すべてリセット" action *is* a real `<button aria-label="すべてリセット">`.
  - The row toggle buttons (男性/女性, カスタム/Auto, オン/オフ, etc.) are real `<button>` elements, but selection is conveyed via `data-selected="true"/"false"`, not a class name — `hxc-btn-variant-standard` (still used as a last-resort fallback in `selected()`) was already stale at the time this was checked. If presets ever silently misjudge which toggle is active again, check `data-selected` first, not the class list.

## Storage

`chrome.storage.local` holds schema version 1, mastering prompts, option presets, and the Auto title preference. Tab-local selection state and saved-style caches must remain ephemeral.
