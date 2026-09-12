import { Fragment, useEffect, useRef, useState } from 'react';
import { validateUniqueName } from '../domain/logic';
import { optionKeys, optionLabels, type MasteringPrompt, type OtherOptionsKey, type OtherOptionsPreset, type OtherOptionsSnapshot } from '../domain/models';
import { deleteMastering, deletePreset, saveMastering, savePreset } from '../storage/repository';
import type { SunoController } from '../suno/controller';
import { useController, useStoredLists } from './components';

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

export function SettingsDialog({ controller }: { controller: SunoController }) {
  const state = useController(controller);
  const { masterings, presets } = useStoredLists();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const masteringSectionRef = useRef<HTMLElement>(null);
  const presetSectionRef = useRef<HTMLElement>(null);
  const [snapshot, setSnapshot] = useState<OtherOptionsSnapshot>();
  const [unreadableKeys, setUnreadableKeys] = useState<OtherOptionsKey[]>([]);
  const [editingMastering, setEditingMastering] = useState<MasteringPrompt>();
  const [masteringForm, setMasteringForm] = useState<{ name: string; prompt: string }>();
  const [editingPreset, setEditingPreset] = useState<OtherOptionsPreset>();
  const [presetForm, setPresetForm] = useState<{ name: string; keys: OtherOptionsKey[] }>();
  const [localError, setLocalError] = useState<string>();

  const open = !!state.settings;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open) return;
    setMasteringForm(undefined);
    setEditingMastering(undefined);
    setPresetForm(undefined);
    setEditingPreset(undefined);
    setLocalError(undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const target = state.settings?.section === 'masterings' ? masteringSectionRef.current : presetSectionRef.current;
    target?.scrollIntoView({ block: 'start' });
  }, [open, state.settings?.section]);

  const close = () => controller.closeSettings();

  const startMastering = (item?: MasteringPrompt) => {
    setEditingMastering(item);
    setMasteringForm({ name: item?.name ?? '', prompt: item?.prompt ?? '' });
    setLocalError(undefined);
  };
  const cancelMastering = () => { setMasteringForm(undefined); setEditingMastering(undefined); };
  const saveCurrentMastering = async () => {
    const name = masteringForm!.name.trim();
    const prompt = masteringForm!.prompt.trim();
    const issue = validateUniqueName(name, masterings, editingMastering?.id)
      ?? (!prompt ? 'プロンプトを入力してください。' : undefined)
      ?? (prompt.length > 1000 ? 'プロンプトは1000文字以内にしてください。' : undefined);
    if (issue) { setLocalError(issue); return; }
    await saveMastering({ id: editingMastering?.id, name, prompt });
    cancelMastering();
  };

  const startPreset = (item?: OtherOptionsPreset) => {
    setEditingPreset(item);
    setPresetForm({ name: item?.name ?? '', keys: item ? Object.keys(item.fields) as OtherOptionsKey[] : optionKeys });
    setLocalError(undefined);
  };
  const cancelPreset = () => { setPresetForm(undefined); setEditingPreset(undefined); };
  const saveCurrentPreset = async () => {
    const name = presetForm!.name.trim();
    const issue = validateUniqueName(name, presets, editingPreset?.id)
      ?? (!snapshot ? '先にSunoの現在の設定を取り込んでください。' : undefined)
      ?? (!presetForm!.keys.length ? '保存する項目を1つ以上選択してください。' : undefined);
    if (issue) { setLocalError(issue); return; }
    const fields = Object.fromEntries(presetForm!.keys.map((key) => [key, snapshot![key]])) as Partial<OtherOptionsSnapshot>;
    await savePreset({ id: editingPreset?.id, name, fields });
    cancelPreset();
  };

  const capture = async () => {
    const result = await controller.captureOptions();
    if (!result) return;
    setSnapshot(result.snapshot);
    setUnreadableKeys(result.unreadable);
  };

  const allSelected = !!presetForm && presetForm.keys.length === optionKeys.length;
  const savedSnapshot = snapshot ? formatSnapshot(snapshot) : undefined;

  return <dialog ref={dialogRef} className="suno-assistant__dialog" closedby="any" onClose={close} onCancel={close}>
    <div className="suno-assistant__dialog-body">
      <div className="suno-assistant__dialog-header">
        <h2>Suno Create Assistant の設定</h2>
        <button type="button" className="suno-assistant__button" onClick={close}>閉じる</button>
      </div>
      {(state.settingsFeedback || localError) && (
        <p className={`suno-assistant__status ${localError || state.settingsFeedback?.kind === 'error' ? 'suno-assistant__status--error' : ''}`} role={localError || state.settingsFeedback?.kind === 'error' ? 'alert' : 'status'}>
          {localError ?? state.settingsFeedback?.message}
        </p>
      )}

      <section ref={masteringSectionRef} aria-labelledby="suno-assistant-mastering-heading">
        <h3 id="suno-assistant-mastering-heading">マスタリングプロンプト</h3>
        <p className="suno-assistant__hint">スタイル本文の後ろに改行で追加する独自プロンプトです。</p>
        {!masteringForm && <>
          <ul className="suno-assistant__list">
            {masterings.map((item) => <li key={item.id}>
              <div><strong>{item.name}</strong><p>{item.prompt}</p></div>
              <div className="suno-assistant__list-actions">
                <button type="button" onClick={() => startMastering(item)}>編集</button>
                <button type="button" onClick={() => void deleteMastering(item.id)}>削除</button>
              </div>
            </li>)}
          </ul>
          {!masterings.length && <p className="suno-assistant__hint">まだ登録されていません。</p>}
          <button type="button" className="suno-assistant__button" onClick={() => startMastering()}>追加</button>
        </>}
        {masteringForm && <form onSubmit={(event) => { event.preventDefault(); void saveCurrentMastering(); }}>
          <label>名前<input type="text" value={masteringForm.name} onChange={(event) => setMasteringForm((current) => ({ ...current!, name: event.target.value }))} /></label>
          <label>プロンプト<textarea value={masteringForm.prompt} maxLength={1000} onChange={(event) => setMasteringForm((current) => ({ ...current!, prompt: event.target.value }))} /></label>
          <div className="suno-assistant__dialog-actions">
            <button type="button" onClick={cancelMastering}>キャンセル</button>
            <button type="submit">保存</button>
          </div>
        </form>}
      </section>

      <section ref={presetSectionRef} aria-labelledby="suno-assistant-preset-heading">
        <h3 id="suno-assistant-preset-heading">その他のオプションプリセット</h3>
        <p className="suno-assistant__hint">直近に取り込んだ値のうち、選んだ項目だけを保存します。</p>
        <button type="button" className="suno-assistant__button" onClick={() => void capture()}>Sunoの現在の設定を取り込む</button>
        {savedSnapshot && <div className="suno-assistant__snapshot"><dl>{savedSnapshot.map(([key, value]) => <Fragment key={key}><dt>{key}</dt><dd>{value}</dd></Fragment>)}</dl></div>}
        {!presetForm && <>
          <p><button type="button" disabled={!snapshot} onClick={() => startPreset()}>現在値からプリセットを作成</button></p>
          <ul className="suno-assistant__list">
            {presets.map((item) => <li key={item.id}>
              <div><strong>{item.name}</strong><p>{Object.keys(item.fields).map((key) => optionLabels[key as OtherOptionsKey]).join('、')}</p></div>
              <div className="suno-assistant__list-actions">
                <button type="button" disabled={!snapshot} onClick={() => startPreset(item)}>編集</button>
                <button type="button" onClick={() => void deletePreset(item.id)}>削除</button>
              </div>
            </li>)}
          </ul>
          {!presets.length && <p className="suno-assistant__hint">まだ登録されていません。</p>}
        </>}
        {presetForm && <form onSubmit={(event) => { event.preventDefault(); void saveCurrentPreset(); }}>
          <label>名前<input type="text" value={presetForm.name} onChange={(event) => setPresetForm((current) => ({ ...current!, name: event.target.value }))} /></label>
          <div className="suno-assistant__checks">
            <label><input type="checkbox" checked={allSelected} onChange={(event) => setPresetForm((current) => ({ ...current!, keys: event.target.checked ? optionKeys : [] }))} />全項目</label>
            {optionKeys.map((key) => <label key={key}>
              <input
                type="checkbox"
                checked={presetForm.keys.includes(key)}
                disabled={unreadableKeys.includes(key)}
                onChange={(event) => setPresetForm((current) => ({
                  ...current!,
                  keys: event.target.checked ? [...new Set([...current!.keys, key])] : current!.keys.filter((item) => item !== key),
                }))}
              />
              {optionLabels[key]}
            </label>)}
          </div>
          <div className="suno-assistant__dialog-actions">
            <button type="button" onClick={cancelPreset}>キャンセル</button>
            <button type="submit">保存</button>
          </div>
        </form>}
      </section>
    </div>
  </dialog>;
}
