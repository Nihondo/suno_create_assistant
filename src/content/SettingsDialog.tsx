import { useEffect, useId, useRef, useState } from 'react';
import { validateUniqueName } from '../domain/logic';
import { emptyOtherOptions, optionKeys, optionLabels, type MasteringPrompt, type OtherOptionsKey, type OtherOptionsPreset, type OtherOptionsSnapshot, type VocalGender } from '../domain/models';
import { deleteMastering, deletePreset, saveMastering, savePreset } from '../storage/repository';
import type { SunoController } from '../suno/controller';
import { useController, useStoredLists } from './components';

type PresetForm = { name: string; fields: Partial<OtherOptionsSnapshot> };

function cloneFields(fields: Partial<OtherOptionsSnapshot>): Partial<OtherOptionsSnapshot> {
  return {
    ...fields,
    ...(fields.duration && { duration: { ...fields.duration } }),
    ...(fields.personalization && { personalization: { ...fields.personalization } }),
  };
}

function capturedFields(snapshot: OtherOptionsSnapshot, unreadable: OtherOptionsKey[]): Partial<OtherOptionsSnapshot> {
  return Object.fromEntries(optionKeys
    .filter((key) => !unreadable.includes(key))
    .map((key) => [key, snapshot[key]])) as Partial<OtherOptionsSnapshot>;
}

function formatPreset(fields: Partial<OtherOptionsSnapshot>): string {
  const values: string[] = [];
  if (fields.excludedStyles !== undefined) values.push(`${optionLabels.excludedStyles}: ${fields.excludedStyles || 'なし'}`);
  if (fields.vocalGender !== undefined) values.push(`${optionLabels.vocalGender}: ${fields.vocalGender === 'none' ? '指定なし' : fields.vocalGender === 'male' ? '男性' : '女性'}`);
  if (fields.duration !== undefined) values.push(`${optionLabels.duration}: ${fields.duration.mode === 'auto' ? 'Auto' : `カスタム${fields.duration.seconds ? ` (${fields.duration.seconds}秒)` : ''}`}`);
  if (fields.maxMode !== undefined) values.push(`${optionLabels.maxMode}: ${fields.maxMode ? 'オン' : 'オフ'}`);
  if (fields.weirdness !== undefined) values.push(`${optionLabels.weirdness}: ${fields.weirdness}%`);
  if (fields.styleInfluence !== undefined) values.push(`${optionLabels.styleInfluence}: ${fields.styleInfluence}%`);
  if (fields.variation !== undefined) values.push(`${optionLabels.variation}: ${fields.variation}`);
  if (fields.personalization !== undefined) values.push(`${optionLabels.personalization}: ${fields.personalization.enabled ? 'オン' : 'オフ'}`);
  return values.join(' / ');
}

export function SettingsDialog({ controller }: { controller: SunoController }) {
  const state = useController(controller);
  const { masterings, presets } = useStoredLists();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const masteringSectionRef = useRef<HTMLElement>(null);
  const presetSectionRef = useRef<HTMLElement>(null);
  const [editingMastering, setEditingMastering] = useState<MasteringPrompt>();
  const [masteringForm, setMasteringForm] = useState<{ name: string; prompt: string }>();
  const [editingPreset, setEditingPreset] = useState<OtherOptionsPreset>();
  const [presetForm, setPresetForm] = useState<PresetForm>();
  const [localError, setLocalError] = useState<string>();
  const presetFormId = useId();

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
    setPresetForm({ name: item?.name ?? '', fields: item ? cloneFields(item.fields) : {} });
    setLocalError(undefined);
  };
  const cancelPreset = () => { setPresetForm(undefined); setEditingPreset(undefined); };
  const createPresetFromCurrentOptions = async () => {
    const result = await controller.captureOptions();
    if (!result) return;
    setEditingPreset(undefined);
    setPresetForm({ name: '', fields: capturedFields(result.snapshot, result.unreadable) });
    setLocalError(undefined);
  };
  const saveCurrentPreset = async () => {
    const name = presetForm!.name.trim();
    const issue = validateUniqueName(name, presets, editingPreset?.id)
      ?? (!Object.keys(presetForm!.fields).length ? '保存する項目を1つ以上選択してください。' : undefined);
    if (issue) { setLocalError(issue); return; }
    await savePreset({ id: editingPreset?.id, name, fields: cloneFields(presetForm!.fields) });
    cancelPreset();
  };
  const updatePresetField = <K extends OtherOptionsKey>(key: K, value: OtherOptionsSnapshot[K]) => {
    setPresetForm((current) => current && { ...current, fields: { ...current.fields, [key]: value } });
  };
  const setPresetFieldIncluded = (key: OtherOptionsKey, included: boolean) => {
    setPresetForm((current) => {
      if (!current) return current;
      if (included) return { ...current, fields: { ...current.fields, [key]: emptyOtherOptions()[key] } };
      const fields = { ...current.fields };
      delete fields[key];
      return { ...current, fields };
    });
  };
  const allSelected = !!presetForm && optionKeys.every((key) => presetForm.fields[key] !== undefined);

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
        <p className="suno-assistant__hint">各項目のチェックで保存対象を選び、値を直接編集できます。</p>
        {!presetForm && <>
          <p><button type="button" onClick={() => void createPresetFromCurrentOptions()}>現在値からプリセットを作成</button></p>
          <ul className="suno-assistant__list">
            {presets.map((item) => <li key={item.id}>
              <div><strong>{item.name}</strong><p>{formatPreset(item.fields)}</p></div>
              <div className="suno-assistant__list-actions">
                <button type="button" onClick={() => startPreset(item)}>編集</button>
                <button type="button" onClick={() => void deletePreset(item.id)}>削除</button>
              </div>
            </li>)}
          </ul>
          {!presets.length && <p className="suno-assistant__hint">まだ登録されていません。</p>}
        </>}
        {presetForm && <form onSubmit={(event) => { event.preventDefault(); void saveCurrentPreset(); }}>
          <label>名前<input type="text" value={presetForm.name} onChange={(event) => setPresetForm((current) => ({ ...current!, name: event.target.value }))} /></label>
          <fieldset className="suno-assistant__preset-fields">
            <legend>保存する設定</legend>
            <label className="suno-assistant__preset-field-toggle"><input type="checkbox" checked={allSelected} onChange={(event) => setPresetForm((current) => current && { ...current, fields: event.target.checked ? emptyOtherOptions() : {} })} />全項目</label>
            {optionKeys.map((key) => {
              const included = presetForm.fields[key] !== undefined;
              return <div className="suno-assistant__preset-field" key={key}>
                <label className="suno-assistant__preset-field-toggle"><input type="checkbox" checked={included} onChange={(event) => setPresetFieldIncluded(key, event.target.checked)} />{optionLabels[key]}</label>
                {included && <div className="suno-assistant__preset-field-value">
                  {key === 'excludedStyles' && <label>除外するスタイル<input name={`${presetFormId}-excluded-styles`} type="text" value={presetForm.fields.excludedStyles ?? ''} onChange={(event) => updatePresetField('excludedStyles', event.target.value)} /></label>}
                  {key === 'vocalGender' && <fieldset><legend>ボーカル性別</legend>{(['none', 'male', 'female'] as VocalGender[]).map((value) => <label key={value}><input name={`${presetFormId}-vocal-gender`} type="radio" checked={presetForm.fields.vocalGender === value} onChange={() => updatePresetField('vocalGender', value)} />{value === 'none' ? '指定なし' : value === 'male' ? '男性' : '女性'}</label>)}</fieldset>}
                  {key === 'duration' && <fieldset><legend>長さ</legend><label><input name={`${presetFormId}-duration`} type="radio" checked={presetForm.fields.duration?.mode === 'auto'} onChange={() => updatePresetField('duration', { mode: 'auto' })} />Auto</label><label><input name={`${presetFormId}-duration`} type="radio" checked={presetForm.fields.duration?.mode === 'custom'} onChange={() => updatePresetField('duration', { mode: 'custom', seconds: presetForm.fields.duration?.seconds })} />カスタム</label>{presetForm.fields.duration?.mode === 'custom' && <label className="suno-assistant__duration-seconds"><span>秒数</span><input name={`${presetFormId}-duration-seconds`} type="number" min="1" inputMode="numeric" value={presetForm.fields.duration.seconds ?? ''} onChange={(event) => updatePresetField('duration', { mode: 'custom', seconds: event.target.value ? Number(event.target.value) : undefined })} /></label>}</fieldset>}
                  {key === 'maxMode' && <label><input name={`${presetFormId}-max-mode`} type="checkbox" checked={presetForm.fields.maxMode ?? false} onChange={(event) => updatePresetField('maxMode', event.target.checked)} />Maxモードをオンにする</label>}
                  {(key === 'weirdness' || key === 'styleInfluence' || key === 'variation') && (() => { const value = presetForm.fields[key] ?? 0; return <label>{optionLabels[key]}<span className="suno-assistant__range"><input name={`${presetFormId}-${key}`} type="range" min="0" max="100" value={value} onChange={(event) => updatePresetField(key, Number(event.target.value))} /><output>{key === 'variation' ? value : `${value}%`}</output></span></label>; })()}
                  {key === 'personalization' && <label><input name={`${presetFormId}-personalization`} type="checkbox" checked={presetForm.fields.personalization?.enabled ?? false} onChange={(event) => updatePresetField('personalization', { ...presetForm.fields.personalization, enabled: event.target.checked })} />パーソナライズをオンにする</label>}
                </div>}
              </div>;
            })}
          </fieldset>
          <div className="suno-assistant__dialog-actions">
            <button type="button" onClick={cancelPreset}>キャンセル</button>
            <button type="submit">保存</button>
          </div>
        </form>}
      </section>
    </div>
  </dialog>;
}
