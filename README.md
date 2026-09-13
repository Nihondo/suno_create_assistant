# Suno Create Assistant

A local Chrome extension for the Advanced tab of [Suno Create](https://suno.com/create). It adds quick access to saved styles, your own mastering prompts, reusable advanced-option presets, and automatic song titles. Works with both English and Japanese Suno interfaces, detected automatically.

![](./images/suno_lead.png)

## Installation

Pre-built extension files are included in this repository under `install/chrome-mv3`, so you can install and use it right away without needing Node.js or any build tools.

1. Download this repository (**Code** → **Download ZIP**) and extract it, or run `git clone https://github.com/Nihondo/suno_create_assistant.git`.
2. In Google Chrome, navigate to `chrome://extensions` and enable **Developer mode** in the upper-right corner.
3. Click **Load unpacked** and select the `install/chrome-mv3` directory inside the repository.
4. Open [Suno Create](https://suno.com/create) and select the **Advanced** tab.

## Features

![Create/Advanced tab](./images/suno_create.png)

### Lyrics tag palette

Directly under the **Lyrics** heading, the extension adds a row of buttons (`Instrumental`, `Intro`, `Verse 1`, `Chorus`, etc.) for quick insertion of song section tags.

- Clicking a tag button inserts it on its own line (e.g. `[Verse 1]`) into the lyrics editor, automatically expanding the Lyrics section if it was closed, without losing your cursor position.
- Edit, reorder, add, or delete tags (one per line) under **Lyrics Tags** in the settings dialog, or restore the defaults at any time.

### Styles and mastering

Directly under the **Style** heading, the extension adds a Style dropdown and a Mastering dropdown that stay visible whether the section is open or closed.

- Choose a saved Suno style and, optionally, a mastering prompt of your own; both are written into the Style field on separate lines.
- Use **Manage…** to add, edit, or delete your mastering prompts.
- If you add, rename, or delete a saved style inside Suno, reopen the extension's dropdown to see the updated list.
- If the combined style and mastering text would exceed Suno's 1,000-character limit, nothing is changed and an error is shown instead.

### Advanced-option presets

The Preset dropdown appears directly under the **More Options** heading, so it stays visible whether the section is open or closed. A preset can save any combination of: excluded styles, vocal gender, length, Max mode, weirdness, style influence, variation, audio influence, and personalization.

- Click **Save Preset** beside the dropdown to open a dialog pre-filled with Suno's current settings — this works even while More Options is collapsed. Choose which settings to include, adjust their values, and save.
- Use **Manage presets…** inside the dropdown to edit or delete existing presets.
- Applying a preset changes only the settings it includes; everything else is left as-is.

### Automatic titles and take numbers

Enable **Auto title** inside the title section to generate a title automatically from a template. The default is:

```text
{{WORKSPACE}} ({{STYLE}}) {{TAKE}}
```

Customize the template anytime under **Song Title Format** in the settings dialog. Available placeholders:

- `{{WORKSPACE}}` — destination / workspace name
- `{{STYLE}}` — style name (or `Custom` if manually edited)
- `{{AUDIO}}` — original song title (when remixing or referencing audio)
- `{{TAKE}}` — take number, incremented automatically

When a title contains `{{TAKE}}`, clicking **Create** (or using the shortcut below) fills in the next take number, submits, and then restores the `{{TAKE}}` template so it's ready for the next take. You can also type `{{TAKE}}` manually with Auto title disabled if you just want take numbering on your own titles.

### Create shortcut

Press `Cmd + Enter` (macOS) or `Ctrl + Enter` (Windows/Linux) anywhere on the Suno Create page to trigger the **Create** button, no setup required.

![Extension Settings](./images/suno_setting.png)

### Extension Settings menu

The extension adds an **Extension Settings** item with a gear icon to Suno's sidebar, just below Hooks. Click it to open the settings dialog, where you manage song title formats, display settings, mastering prompts, and presets.

### Auto-collapsed sections

When you open the Advanced tab, the "Lyrics", "Styles", and "More Options" sections default to collapsed, since the extension's own controls stay visible either way. You can turn this off with the **"Close lyrics, styles, and more options when opening the Advanced tab"** checkbox under **Display Settings** in the settings dialog. Any section you manually reopen stays open while you keep working in it.

### Take history and reuse parameters

Every time you press **Create**, the extension automatically records the Style, Mastering, Preset, and More Options settings that were in effect at that moment. Once a matching clip appears in Suno's own clip list, a small **reuse parameters** button appears among its row actions (next to Like, Share, and so on) — click it to reapply that generation's More Options settings.

- Browse, restore, or delete past entries under **Take History** in the settings dialog.
- **Save as preset** turns a past entry's settings into a reusable preset.
- Only the More Options settings are reapplied — the Style field is left untouched, since Suno's own "Reuse prompt" action already covers reusing style text.
- A clip generated before you started using this feature, or one you navigate away from before it finishes generating, may not get a reuse button.

### Backup (export / import)

Under **Backup** in the settings dialog, export all your settings — mastering prompts, presets, lyrics tags, title format, and (optionally) take history — as a JSON file, or import a previously exported file. Importing replaces all current settings, so use it to move settings to another computer, recover from a lost Chrome profile, or keep your own copy under version control. Nothing is ever sent anywhere; the file is written and read entirely on your device.

## Privacy

All your settings — mastering prompts, presets, take history, the Auto title preference, the title format, and take-number counters — are stored locally in your browser and never leave it. The extension does not call any private Suno API or send data to a server, and it does not permanently store the saved-style prompts it reads from Suno's dialog. Exporting settings saves a file directly on your device; nothing is ever uploaded anywhere.

## Disclaimer

This is an unofficial, independent extension and is not affiliated with, endorsed by, or sponsored by Suno, Inc. "Suno" is a registered trademark of Suno, Inc.

Because this extension operates by interacting directly with the Suno web interface, future updates, design overhauls, or specification changes made by Suno may cause some or all features of this extension to stop functioning.

## License

[MIT](LICENSE)
