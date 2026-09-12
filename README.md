# Suno Create Assistant

A local Chrome extension for the Advanced tab of [Suno Create](https://suno.com/create). It adds quick access to saved styles, your own mastering prompts, reusable advanced-option presets, and automatic song titles.

## Install locally

1. Install dependencies with `pnpm install`.
2. Build the extension with `pnpm build`.
3. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `output/chrome-mv3`.
4. Open `https://suno.com/create` and select the **Advanced** tab.

## Use

### Styles and mastering

Under Suno's Style field, choose a saved Suno style and an optional mastering prompt. The extension writes them to the Style field on separate lines. Use **Manage…** to add, edit, or delete mastering prompts in the extension options page.

The extension reads the saved styles from Suno's existing dialog without storing those prompts. When Suno's saved-style list is opened or changed, the next extension dropdown opening refreshes its in-memory list.

If the combined style and mastering prompt exceeds Suno's 1,000-character limit, nothing is changed and an error is shown.

### Advanced-option presets

The Other options section gains a Preset dropdown. Presets can save all or only selected settings: excluded styles, vocal gender, length, Max mode, weirdness, style influence, variation, and personalization.

Open **Manage presets…** and use **Get current values from Suno** while a Suno Create tab is active. Choose the settings to store and save the preset. Applying a preset changes only its saved settings.

### Automatic titles

Enable **Auto title** beside the title input to generate:

```text
Destination (Style name)
```

The setting is remembered locally. While enabled, the title field follows destination and style selection changes and is read-only. A manually edited style is named `カスタム`.

### Create shortcut and inspiration label

The extension shortens Suno's **インスピレーション** button label to **ひらめき** to prevent the action row from wrapping. In the extension options page, select **Set shortcut** to open Chrome's shortcut settings, then assign a key to **Run Suno Create**. No default shortcut is reserved. The shortcut activates the visible enabled Create button in the active Suno Create tab, or the most recently used Suno Create tab.

## Privacy

All mastering prompts, presets, and the Auto title preference are stored in Chrome local extension storage. The extension does not call Suno private APIs, send data to a server, or store Suno saved-style prompts permanently.
