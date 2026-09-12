# Suno Create Assistant

A local Chrome extension for the Advanced tab of [Suno Create](https://suno.com/create). It adds quick access to saved styles, your own mastering prompts, reusable advanced-option presets, and automatic song titles.

## Install locally

1. Install dependencies with `pnpm install`.
2. Build the extension with `pnpm build`.
3. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `output/chrome-mv3`.
4. Open `https://suno.com/create` and select the **Advanced** tab.

## Use

### Styles and mastering

Directly under the **Style** heading, the extension provides style and mastering controls that stay visible whether the style disclosure is open or closed. Choose a saved Suno style and an optional mastering prompt to write them to the Style field on separate lines. Use **Manage…** to add, edit, or delete mastering prompts in an in-page dialog.

The extension reads only each saved style's prompt from Suno's existing dialog, without storing it. Style names label the list, and saved dates are never inserted into the Style field. When Suno's saved-style list is opened or changed, the next extension dropdown opening refreshes its in-memory list.

If the combined style and mastering prompt exceeds Suno's 1,000-character limit, nothing is changed and an error is shown.

### Advanced-option presets

The Preset dropdown is shown directly under the **Other options** heading, ahead of its collapsible body, so it stays visible whether the disclosure is open or closed. Presets can save all or only selected settings: excluded styles, vocal gender, length, Max mode, weirdness, style influence, variation, and personalization.

Click the **設定を保存** (Save settings) button beside the dropdown to open a dialog pre-filled with Suno's live settings. Select the settings to store (excluded styles, vocal gender, length, Max mode, weirdness, style influence, variation, personalization), adjust their values, and save. The extension can read the settings even when Other options is collapsed. Open **Manage presets…** inside the dropdown to edit or delete existing presets. Applying a preset changes only its saved settings.

### Automatic titles

Enable **Auto title** inside the title section to generate:

```text
Destination (Style name)
```

The setting is stored in Chrome local extension storage and restored as the default the next time you open Suno Create. While enabled, the title field follows destination and style selection changes and is read-only. A manually edited style is named `カスタム`.

### Create shortcut and inspiration label

On the Suno Create page, press `Cmd + Enter` (macOS) or `Ctrl + Enter` (Windows/Linux) to trigger the **Create** button directly without any configuration. The extension also shortens Suno's **インスピレーション** button label to **ひらめき** to prevent the action row from wrapping.

## Privacy

All mastering prompts, presets, and the Auto title preference are stored in Chrome local extension storage. The extension does not call Suno private APIs, send data to a server, or store Suno saved-style prompts permanently.
