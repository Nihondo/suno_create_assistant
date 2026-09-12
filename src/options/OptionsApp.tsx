import { useEffect, useMemo, useRef, useState } from 'react';
import { validateUniqueName } from '../domain/logic';
import { optionKeys, optionLabels, type MasteringPrompt, type OtherOptionsKey, type OtherOptionsPreset, type OtherOptionsSnapshot } from '../domain/models';
import { deleteMastering, deletePreset, readStorage, saveMastering, savePreset, subscribeStorage } from '../storage/repository';

function formatSnapshot(snapshot: OtherOptionsSnapshot): Array<[string, string]> {
  return [
    ['スタイルを除外', snapshot.excludedStyles || 'なし'],
    ['ボーカル性別', snapshot.vocalGender === 'none' ? '指定なし' : snapshot.vocalGender === 'male' ? '男性' : '女性'],
    ['長さ', snapshot.duration.mode === 'auto' ? 'Auto' : `カスタム${snapshot.duration.seconds ? ` (${snapshot.duration.seconds})` : ''}`],
    ['Maxモード', snapshot.maxMode ? 'オン' : 'オフ'],
    ['奇抜さ', `${snapshot.weirdness}%`],
    ['スタイルの影響', `${snapshot.styleInfluence}%`],
    ['バリエーション', String(snapshot.variation)],
    ['パーソナライズ', snapshot.personalization.enabled ? `オン${snapshot.personalization.tasteName ? ` (${snapshot.personalization.tasteName})` : ''}` : 'オフ'],
  ];
}

export function OptionsApp() {
  const [masterings, setMasterings] = useState<MasteringPrompt[]>([]);
  const [presets, setPresets] = useState<OtherOptionsPreset[]>([]);
  const [snapshot, setSnapshot] = useState<OtherOptionsSnapshot>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const masteringDialog = useRef<HTMLDialogElement>(null);
  const presetDialog = useRef<HTMLDialogElement>(null);
  const [editingMastering, setEditingMastering] = useState<MasteringPrompt>();
  const [editingPreset, setEditingPreset] = useState<OtherOptionsPreset>();
  const [masteringName, setMasteringName] = useState('');
  const [masteringPrompt, setMasteringPrompt] = useState('');
  const [presetName, setPresetName] = useState('');
  const [presetKeys, setPresetKeys] = useState<OtherOptionsKey[]>(optionKeys);

  const reload = async () => {
    const stored = await readStorage();
    setMasterings(stored.masteringPrompts);
    setPresets(stored.optionPresets);
  };
  useEffect(() => {
    void reload();
    return subscribeStorage(() => { void reload(); });
  }, []);

  const getSnapshot = async () => {
    setError(undefined); setNotice(undefined);
    try {
      const result = await chrome.runtime.sendMessage({ type: 'CAPTURE_LAST_SUNO' }) as { ok: boolean; snapshot?: OtherOptionsSnapshot; error?: string };
      if (!result.ok || !result.snapshot) { setError(result.error ?? '現在値を取得できませんでした。'); return; }
      setSnapshot(result.snapshot); setNotice('Sunoの現在値を取得しました。');
    } catch {
      setError('現在値を取得できませんでした。Sunoのアドバンスト作成画面を開いてから、もう一度試してください。');
    }
  };
  const openShortcutSettings = async () => {
    try {
      await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    } catch {
      setError('ショートカット設定を開けませんでした。chrome://extensions/shortcuts を開いてください。');
    }
  };
  const openMastering = (item?: MasteringPrompt) => {
    setEditingMastering(item); setMasteringName(item?.name ?? ''); setMasteringPrompt(item?.prompt ?? ''); masteringDialog.current?.showModal();
  };
  const openPreset = (item?: OtherOptionsPreset) => {
    setEditingPreset(item); setPresetName(item?.name ?? ''); setPresetKeys(item ? Object.keys(item.fields) as OtherOptionsKey[] : optionKeys); presetDialog.current?.showModal();
  };
  const saveCurrentMastering = async () => {
    const name = masteringName.trim();
    const prompt = masteringPrompt.trim();
    const issue = validateUniqueName(name, masterings, editingMastering?.id) ?? (!prompt ? 'プロンプトを入力してください。' : undefined) ?? (prompt.length > 1000 ? 'プロンプトは1000文字以内にしてください。' : undefined);
    if (issue) { setError(issue); return; }
    await saveMastering({ id: editingMastering?.id, name, prompt });
    masteringDialog.current?.close(); setNotice('マスタリングプロンプトを保存しました。'); setError(undefined);
  };
  const saveCurrentPreset = async () => {
    const name = presetName.trim();
    const issue = validateUniqueName(name, presets, editingPreset?.id) ?? (!snapshot ? '先にSunoから現在値を取得してください。' : undefined) ?? (!presetKeys.length ? '保存する項目を1つ以上選択してください。' : undefined);
    if (issue) { setError(issue); return; }
    const fields = Object.fromEntries(presetKeys.map((key) => [key, snapshot![key]])) as Partial<OtherOptionsSnapshot>;
    await savePreset({ id: editingPreset?.id, name, fields });
    presetDialog.current?.close(); setNotice('プリセットを保存しました。'); setError(undefined);
  };
  const allSelected = presetKeys.length === optionKeys.length;
  const savedSnapshot = useMemo(() => snapshot && formatSnapshot(snapshot), [snapshot]);

  return <main className="page">
    <h1>Suno Create Assistant</h1>
    <p className="lead">マスタリングプロンプトと「その他のオプション」プリセットを、このブラウザだけに保存します。</p>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}

    <section className="panel" aria-labelledby="shortcut-heading">
      <div className="panel__heading"><div><h2 id="shortcut-heading">キーボードショートカット</h2><p>「Sunoの『作成』を実行」に任意のキーを割り当てると、現在のSuno作成タブ、または直近に操作したSuno作成タブの作成ボタンを押します。</p></div><button className="button" type="button" onClick={() => void openShortcutSettings()}>ショートカットを設定</button></div>
    </section>

    <section className="panel" aria-labelledby="mastering-heading">
      <div className="panel__heading"><div><h2 id="mastering-heading">マスタリングプロンプト</h2><p>スタイル本文の後ろに改行で追加する独自プロンプトです。</p></div><button className="button" type="button" onClick={() => openMastering()}>追加</button></div>
      <ul className="list">{masterings.map((item) => <li key={item.id}><div><strong>{item.name}</strong><p>{item.prompt}</p></div><div className="list__actions"><button className="button button--secondary" type="button" onClick={() => openMastering(item)}>編集</button><button className="button button--danger" type="button" onClick={() => void deleteMastering(item.id)}>削除</button></div></li>)}</ul>
      {!masterings.length && <p className="notice">まだ登録されていません。</p>}
    </section>

    <section className="panel" aria-labelledby="preset-heading">
      <div className="panel__heading"><div><h2 id="preset-heading">その他のオプションプリセット</h2><p>直近に操作したSuno作成タブから取得した値のうち、選んだ項目だけを保存します。</p></div><button className="button" type="button" onClick={() => void getSnapshot()}>Sunoから現在値を取得</button></div>
      {savedSnapshot && <div className="snapshot"><dl>{savedSnapshot.map(([key, value]) => <><dt key={`${key}-key`}>{key}</dt><dd key={`${key}-value`}>{value}</dd></>)}</dl></div>}
      <p><button className="button button--secondary" type="button" disabled={!snapshot} onClick={() => openPreset()}>現在値からプリセットを作成</button></p>
      <ul className="list">{presets.map((item) => <li key={item.id}><div><strong>{item.name}</strong><p>{Object.keys(item.fields).map((key) => optionLabels[key as OtherOptionsKey]).join('、')}</p></div><div className="list__actions"><button className="button button--secondary" type="button" disabled={!snapshot} onClick={() => openPreset(item)}>編集</button><button className="button button--danger" type="button" onClick={() => void deletePreset(item.id)}>削除</button></div></li>)}</ul>
      {!presets.length && <p className="notice">まだ登録されていません。</p>}
    </section>

    <dialog ref={masteringDialog} closedby="any"><form method="dialog" onSubmit={(event) => { event.preventDefault(); void saveCurrentMastering(); }}><h2>{editingMastering ? 'マスタリングを編集' : 'マスタリングを追加'}</h2><label>名前<input type="text" value={masteringName} onChange={(event) => setMasteringName(event.target.value)} /></label><label>プロンプト<textarea value={masteringPrompt} onChange={(event) => setMasteringPrompt(event.target.value)} maxLength={1000} /></label><div className="dialog__actions"><button className="button button--secondary" type="button" onClick={() => masteringDialog.current?.close()}>キャンセル</button><button className="button" type="submit">保存</button></div></form></dialog>
    <dialog ref={presetDialog} closedby="any"><form method="dialog" onSubmit={(event) => { event.preventDefault(); void saveCurrentPreset(); }}><h2>{editingPreset ? 'プリセットを編集' : 'プリセットを追加'}</h2><label>名前<input type="text" value={presetName} onChange={(event) => setPresetName(event.target.value)} /></label><div className="checks"><label><input type="checkbox" checked={allSelected} onChange={(event) => setPresetKeys(event.target.checked ? optionKeys : [])} />全項目</label>{optionKeys.map((key) => <label key={key}><input type="checkbox" checked={presetKeys.includes(key)} onChange={(event) => setPresetKeys((current) => event.target.checked ? [...new Set([...current, key])] : current.filter((item) => item !== key))} />{optionLabels[key]}</label>)}</div><div className="dialog__actions"><button className="button button--secondary" type="button" onClick={() => presetDialog.current?.close()}>キャンセル</button><button className="button" type="submit">保存</button></div></form></dialog>
  </main>;
}
