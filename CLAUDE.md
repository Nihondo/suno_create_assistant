# Suno Create Assistant development notes

## Stack and commands

This is a Manifest V3 Chrome extension built with WXT, React, TypeScript, and pnpm.

The `tabs` permission is used only to find an open `https://suno.com/create*` tab when the options page requests its current option values.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build` before handoff. The unpacked build output is `output/chrome-mv3`.

`tests/e2e/extension.spec.ts` starts a local HTTPS fixture mapped to `suno.com` only inside Playwright Chromium. Install its browser with `pnpm exec playwright install chromium`; the E2E test does not contact Suno.

## Suno integration rules

- Run the content script only on `https://suno.com/create*` and only mount UI while the Advanced tab is active.
- Keep all host-page selectors in `src/suno/adapter.ts`. Prefer stable data attributes, accessible labels, placeholders, and relative structure over CSS classes.
- Suno is a React SPA. Update controlled host inputs through native property setters followed by bubbling `input` and `change` events.
- Never access private Suno APIs, cookies, or page-framework state. Saved styles are read only from the visible native dialog and are never persisted by the extension.
- Content UI is mounted in a Shadow DOM and must not use untrusted text as HTML.
- Suno replaces the Other options disclosure during reconciliation. Mount `PresetControls` beside the verified title input anchor in `entrypoints/suno.content.tsx`; do not attach it to that disclosure.
- Dropdown listboxes are native Popovers so they escape Suno's overflow clipping. Their document-level outside-click check must use `Event.composedPath()` because Shadow DOM retargets events at the host.
- Keep the host-page inspiration-label shortening and Create-button lookup in `src/suno/adapter.ts`. The Manifest `trigger-suno-create` command has no default key; users assign it in Chrome's extension shortcut settings.
- `CAPTURE_LAST_SUNO` is asynchronous: the Background finds a matching Suno tab and forwards `CAPTURE_OPTIONS`; `SunoAdapter.readOtherOptions()` temporarily opens a collapsed disclosure before reading it.

## Storage

`chrome.storage.local` holds schema version 1, mastering prompts, option presets, and the Auto title preference. Tab-local selection state and saved-style caches must remain ephemeral.
