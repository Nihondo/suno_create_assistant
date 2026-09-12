# Suno Create Assistant

A local Chrome extension for the Advanced tab of [Suno Create](https://suno.com/create). It adds quick access to saved styles, your own mastering prompts, reusable advanced-option presets, and automatic song titles. Fully supports both English and Japanese interfaces on Suno with automatic language detection.

## Installation

Pre-built extension files are included in this repository under `install/chrome-mv3`, so you can install and use it right away without needing Node.js or any build tools.

1. Download this repository (**Code** → **Download ZIP**) and extract it, or run `git clone https://github.com/Nihondo/suno_extension.git`.
2. In Google Chrome, navigate to `chrome://extensions` and enable **Developer mode** in the upper-right corner.
3. Click **Load unpacked** and select the `install/chrome-mv3` directory inside the repository.
4. Open [Suno Create](https://suno.com/create) and select the **Advanced** tab.

## Use

![Create/Advanced tab](./images/suno_create.png)

### Multilingual support (English & Japanese)

The extension automatically detects Suno's language setting (`en` or `ja`). All host page interactions (Styles, More Options, sliders, toggles, saved styles dialog) function smoothly in both languages, and the extension's UI (dropdowns, buttons, notices, and settings dialog) automatically displays in the matching language.

### Lyrics tag palette

Directly under the **Lyrics** (歌詞) heading, the extension provides a tag palette with rounded rectangular buttons (`Instrumental`, `Intro`, `Verse 1`, `Chorus`, etc.) for quick insertion of song section tags.

- **One-click insertion**: Clicking any tag button inserts the bracketed tag (e.g. `[Verse 1]`) on its own line into the lyrics editor, automatically expanding the lyrics disclosure if it was closed. Caret position and focus are maintained so you can immediately begin typing lyrics.
- **Clean button labels**: Palette buttons display only the tag name without brackets (e.g. `Verse 1` is displayed on the button, while `[Verse 1]` is inserted).
- **Customizable in settings**: Click the gear icon (⚙) on the right of the palette or open the in-page settings dialog to edit tags under **Lyrics Tags** (歌詞タグ). Tags can be freely edited, reordered, added, or deleted (one tag per line), or reset to defaults at any time.

### Styles and mastering

Directly under the **Style** / **Styles** (スタイル) heading, the extension provides style and mastering controls that stay visible whether the style disclosure is open or closed. Choose a saved Suno style and an optional mastering prompt to write them to the Style field on separate lines. Use **Manage…** (管理…) to add, edit, or delete mastering prompts in an in-page dialog.

The extension reads only each saved style's prompt from Suno's existing dialog, without storing it. Style names label the list, and saved dates are never inserted into the Style field. When Suno's saved-style list is opened or changed, the next extension dropdown opening refreshes its in-memory list.

If the combined style and mastering prompt exceeds Suno's 1,000-character limit, nothing is changed and an error is shown.

### Advanced-option presets

The Preset dropdown is shown directly under the **More Options** / **Other options** (その他のオプション) heading, ahead of its collapsible body, so it stays visible whether the disclosure is open or closed. Presets can save all or only selected settings: excluded styles, vocal gender, length, Max mode, weirdness, style influence, variation, and personalization.

Click the **Save Preset** / **設定を保存** button beside the dropdown to open a dialog pre-filled with Suno's live settings. Select the settings to store (excluded styles, vocal gender, length, Max mode, weirdness, style influence, variation, personalization), adjust their values, and save. The extension can read the settings even when More Options is collapsed. Open **Manage presets…** (プリセットを管理…) inside the dropdown to edit or delete existing presets. Applying a preset changes only its saved settings.

### Automatic titles and take numbers ({{TAKE}})
 
Enable **Auto title** (自動設定) inside the title section to generate a title using the configured template. The default format is:
 
```text
{{WORKSPACE}} ({{STYLE}}) {{TAKE}}
```
 
- Customize the format anytime in the in-page settings dialog under **Song Title Format** (曲名フォーマット). Available placeholders:
  - `{{WORKSPACE}}`: Destination / workspace name
  - `{{STYLE}}`: Style name (or `Custom` / `カスタム` if manually edited)
  - `{{AUDIO}}`: Original song title (when remixing or referencing audio)
  - `{{TAKE}}`: Take number
- When a title contains `{{TAKE}}`, clicking the **Create** button or pressing the shortcut automatically increments the take number stored for that title key in `chrome.storage.local`, fills the take number (1, 2, 3...) into the title input, and submits.
- Immediately after submission, the title field reverts back to the `{{TAKE}}` template so the next generation is ready for the next take.
- You can also type `{{TAKE}}` manually with Auto title disabled to track takes for custom song titles.
 
### Create shortcut and inspiration label
 
On the Suno Create page, press `Cmd + Enter` (macOS) or `Ctrl + Enter` (Windows/Linux) to trigger the **Create** button directly without any configuration (with automatic take numbering if `{{TAKE}}` is present). In Japanese UI, the extension also shortens Suno's **インスピレーション** button label to **ひらめき** to prevent the action row from wrapping.

![Extension Settings](./images/suno_setting.png)

### Sidebar "Extension Settings" menu

The extension injects an **Extension Settings** (拡張設定) item with a gear icon into Suno's sidebar navigation (right below Hooks and above the profile item). Clicking it opens the in-page settings dialog where you can manage song title formats, display settings, mastering prompts, and presets. While the settings dialog is open, the menu item highlights in an active state. When the sidebar is collapsed/minimized, the text automatically hides and leaves only the gear icon visible, exactly mirroring Suno's native navigation items.

### Default-collapsed disclosures (Display settings)

When opening the Advanced tab, the "Lyrics", "Styles", and "More options" ("歌詞", "スタイル", "その他のオプション") disclosure sections (accordions) default to a collapsed state. Because the extension's dropdown controls (Style, Mastering, Presets) are permanently anchored to the header rows, you can operate them without expanding the full native sections, keeping your workspace clean and compact.

You can toggle this automatic collapse behavior using the **"Close lyrics, styles, and more options when opening the Advanced tab"** / **"アドバンスドタブを開いた時に歌詞、スタイル、その他のオプションを閉じる"** checkbox in the settings dialog under **Display Settings** / **表示設定** (enabled by default). Once collapsed upon opening the tab, any section you manually click to open stays open while you edit without being unexpectedly re-closed.

## Development & Building from Source

If you want to modify the source code or build the extension from scratch:

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Build the extension:
   ```bash
   pnpm build
   ```
   The unpacked extension will be built into `install/chrome-mv3`.
3. Run tests:
   ```bash
   pnpm test        # Unit tests
   pnpm test:e2e    # Playwright E2E tests
   ```

## Privacy
 
All mastering prompts, presets, the Auto title preference, custom title formats, and take counter records are stored in Chrome local extension storage. The extension does not call Suno private APIs, send data to a server, or store Suno saved-style prompts permanently.

## Disclaimer

This is an unofficial, independent extension and is not affiliated with, endorsed by, or sponsored by Suno, Inc. "Suno" is a registered trademark of Suno, Inc.

Because this extension operates by interacting directly with the Suno web interface, future updates, design overhauls, or specification changes made by Suno may cause some or all features of this extension to stop functioning.

## License

[MIT](LICENSE)

