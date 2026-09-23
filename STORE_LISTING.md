# Chrome Web Store submission kit

This file contains the copy, assets, and disclosure choices needed to create a Chrome Web Store listing. It does not publish the extension.

## Upload artifact

Run `pnpm zip`. Upload `install/suno-create-assistant.zip` to the Chrome Web Store Developer Dashboard.

## Store listing

| Field | English | 日本語 |
| --- | --- | --- |
| Name | Suno Create Assistant | Suno Create Assistant |
| Category | Productivity | 仕事効率化 |
| Short description | Add saved styles, local presets, automatic titles, take history, and workspace switching to Suno Create. | Suno Createに保存スタイル、ローカルプリセット、曲名自動設定、テイク履歴、ワークスペース切り替えを追加します。 |

### Detailed description (English)

Suno Create Assistant adds local productivity controls to the Advanced tab of Suno Create. Choose from Suno's saved styles, your own local style list with optional per-style Exclude values, and your own mastering prompts, save reusable More Options presets, generate titles with take numbers, and reopen recent workspaces from the workspace header.

Your settings stay in Chrome's local extension storage. The extension works only on `suno.com`, uses Suno's visible interface rather than private APIs, and has no developer-operated server, analytics, or advertising.

This is an unofficial, independent extension and is not affiliated with, endorsed by, or sponsored by Suno, Inc.

### 詳細説明（日本語）

Suno Create Assistant は、Suno Createのアドバンストタブへローカルで使える作業支援コントロールを追加します。Sunoの保存済みスタイル、スタイルごとの除外指定を任意で持てる拡張機能側の自前スタイルリスト、独自マスタリングプロンプトの選択、その他のオプションの再利用可能なプリセット、テイク番号付きの曲名自動設定、ワークスペース見出し行からの最近使ったワークスペース切り替えを利用できます。

設定はChromeの拡張機能用ローカルストレージに保存されます。拡張機能は `suno.com` でのみ動作し、非公開APIではなくSunoの可視UIを使用します。開発者が運営するサーバー、分析、広告はありません。

本拡張機能は個人開発による非公式ツールであり、Suno, Inc.との提携、承認、スポンサーシップ等はありません。

## Privacy practices

Declare the single purpose as: **Add local productivity controls to Suno Create, including style selection, reusable presets, title automation, take history, and workspace switching.**

The extension handles website content and user-generated content only on `https://suno.com/*`, and it stores user-created settings in Chrome local extension storage. In the dashboard, disclose that this data is processed locally to provide the stated features, is not sold or used for advertising, and is not transmitted to the developer or another third party. Use the published repository URL for [PRIVACY.md](PRIVACY.md) in the privacy-policy field after pushing this release.

## Permission justifications

| Permission | Justification |
| --- | --- |
| `storage` | Stores the user's extension settings, take counters, and optional take history locally in Chrome. |
| `https://suno.com/*` | Runs only on Suno pages so it can add the documented controls and interact with the visible Suno Create interface. |

## Assets

| Asset | Path | Store requirement |
| --- | --- | --- |
| Store icon | `store-assets/icon-128.png` | 128×128 PNG |
| Screenshot | `store-assets/screenshot-1.png` | 1280×800 PNG |
| Small promotional image | `store-assets/promo-small.png` | 440×280 PNG |

The marquee promotional image (1400×560) is optional and intentionally not included. Before submission, confirm that the screenshots still show the current Suno UI and capture up to four additional locale-appropriate screenshots if useful.

## Final dashboard checklist

1. Create or select the publisher account and upload `install/suno-create-assistant.zip`.
2. Paste the matching English or Japanese listing copy, then upload the three assets above.
3. Enter the single purpose, permission justifications, and data-practice disclosure above.
4. Link the published `PRIVACY.md` in the dashboard's privacy-policy field.
5. Verify the developer contact and support URL, then submit for review. Do not claim affiliation with Suno.
