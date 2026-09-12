import { useState } from 'react';

export function OptionsApp() {
  const [error, setError] = useState<string>();

  const openShortcutSettings = async () => {
    try {
      await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    } catch {
      setError('ショートカット設定を開けませんでした。chrome://extensions/shortcuts を開いてください。');
    }
  };

  return <main className="page">
    <h1>Suno Create Assistant</h1>
    <p className="lead">マスタリングプロンプトと「その他のオプション」プリセットの管理は、Sunoの作成画面内（アドバンストタブ）のダイアログから行います。</p>
    {error && <p className="error" role="alert">{error}</p>}

    <section className="panel" aria-labelledby="shortcut-heading">
      <div className="panel__heading"><div><h2 id="shortcut-heading">キーボードショートカット</h2><p>「Sunoの『作成』を実行」に任意のキーを割り当てると、現在のSuno作成タブ、または直近に操作したSuno作成タブの作成ボタンを押します。</p></div><button className="button" type="button" onClick={() => void openShortcutSettings()}>ショートカットを設定</button></div>
    </section>
  </main>;
}
