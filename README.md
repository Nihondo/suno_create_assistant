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

### Automatic titles and take numbers ({{TAKE}})
 
Enable **Auto title** inside the title section to generate a title using the configured template. The default format is:
 
```text
{{WORKSPACE}} ({{STYLE}}) {{TAKE}}
```
 
- Customize the format anytime in the in-page settings dialog under **曲名フォーマット**. Available placeholders:
  - `{{WORKSPACE}}`: Destination / workspace name
  - `{{STYLE}}`: Style name (or `カスタム` if manually edited)
  - `{{AUDIO}}`: Original song title (when remixing or referencing audio)
  - `{{TAKE}}`: Take number
- When a title contains `{{TAKE}}`, clicking the **Create** button or pressing the shortcut automatically increments the take number stored for that title key in `chrome.storage.local`, fills the take number (1, 2, 3...) into the title input, and submits.
- Immediately after submission, the title field reverts back to the `{{TAKE}}` template so the next generation is ready for the next take.
- You can also type `{{TAKE}}` manually with Auto title disabled to track takes for custom song titles.
 
### Create shortcut and inspiration label
 
On the Suno Create page, press `Cmd + Enter` (macOS) or `Ctrl + Enter` (Windows/Linux) to trigger the **Create** button directly without any configuration (with automatic take numbering if `{{TAKE}}` is present). The extension also shortens Suno's **インスピレーション** button label to **ひらめき** to prevent the action row from wrapping.

### Sidebar "拡張設定" (Extension settings) menu

The extension injects an **拡張設定** (Extension settings) item with a gear icon into Suno's sidebar navigation (right below Hooks and above the profile item). Clicking it opens the in-page settings dialog where you can manage song title formats, mastering prompts, and presets. While the settings dialog is open, the menu item highlights in an active state. When the sidebar is collapsed/minimized, the text automatically hides and leaves only the gear icon visible, exactly mirroring Suno's native navigation items.

### Default-collapsed disclosures (Display settings)

When opening the Advanced tab, the "Lyrics", "Style", and "Other options" disclosure sections (accordions) default to a collapsed state. Because the extension's dropdown controls (Style, Mastering, Presets) are permanently anchored to the header rows, you can operate them without expanding the full native sections, keeping your workspace clean and compact.

You can toggle this automatic collapse behavior using the **"アドバンスドタブを開いた時に歌詞、スタイル、その他のオプションを閉じる"** (Close lyrics, styles, and other options when opening the Advanced tab) checkbox in the settings dialog under **表示設定** (Display settings) (enabled by default). Once collapsed upon opening the tab, any section you manually click to open stays open while you edit without being unexpectedly re-closed.

## Privacy
 
All mastering prompts, presets, the Auto title preference, custom title formats, and take counter records are stored in Chrome local extension storage. The extension does not call Suno private APIs, send data to a server, or store Suno saved-style prompts permanently.
