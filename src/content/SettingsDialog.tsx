import { useEffect, useId, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { DEFAULT_TITLE_FORMAT, formatLyricsTags, parseLyricsTags, readableOptionFields, validateUniqueName } from '../domain/logic';
import { DEFAULT_LYRICS_TAGS, emptyOtherOptions, optionKeys, type MasteringPrompt, type OtherOptionsKey, type OtherOptionsPreset, type OtherOptionsSnapshot, type TakeRecord, type VocalGender } from '../domain/models';
import { clearTakeHistory, deleteMastering, deletePreset, deleteTakeRecord, exportBackup, parseBackup, replaceStorage, saveMastering, savePreset } from '../storage/repository';
import type { SettingsSection, SunoController } from '../suno/controller';
import { useController, useStoredLists } from './components';
import { getUiMessages, type UiMessages } from '../locales';

type PresetForm = { name: string; fields: Partial<OtherOptionsSnapshot> };

function cloneFields(fields: Partial<OtherOptionsSnapshot>): Partial<OtherOptionsSnapshot> {
  return {
    ...fields,
    ...(fields.duration && { duration: { ...fields.duration } }),
    ...(fields.personalization && { personalization: { ...fields.personalization } }),
  };
}

function formatPreset(fields: Partial<OtherOptionsSnapshot>, ui: UiMessages): string {
  const values: string[] = [];
  const onText = ui.dialog.onOption;
  const offText = ui.dialog.offOption;
  if (fields.excludedStyles !== undefined) values.push(`${ui.optionLabels.excludedStyles}: ${fields.excludedStyles || ui.dialog.noneOption}`);
  if (fields.vocalGender !== undefined) values.push(`${ui.optionLabels.vocalGender}: ${fields.vocalGender === 'none' ? ui.dialog.noneOption : fields.vocalGender === 'male' ? ui.dialog.maleOption : ui.dialog.femaleOption}`);
  if (fields.duration !== undefined) values.push(`${ui.optionLabels.duration}: ${fields.duration.mode === 'auto' ? 'Auto' : `${ui.custom}${fields.duration.seconds ? ` (${fields.duration.seconds}${ui.dialog.secondsLabel})` : ''}`}`);
  if (fields.maxMode !== undefined) values.push(`${ui.optionLabels.maxMode}: ${fields.maxMode ? onText : offText}`);
  if (fields.weirdness !== undefined) values.push(`${ui.optionLabels.weirdness}: ${fields.weirdness}%`);
  if (fields.styleInfluence !== undefined) values.push(`${ui.optionLabels.styleInfluence}: ${fields.styleInfluence}%`);
  if (fields.variation !== undefined) values.push(`${ui.optionLabels.variation}: ${fields.variation}`);
  if (fields.audioInfluence !== undefined) values.push(`${ui.optionLabels.audioInfluence}: ${fields.audioInfluence}%`);
  if (fields.personalization !== undefined) values.push(`${ui.optionLabels.personalization}: ${fields.personalization.enabled ? onText : offText}`);
  return values.join(' / ');
}

export function SettingsDialog({ controller }: { controller: SunoController }) {
  const state = useController(controller);
  const { masterings, presets, takeHistory } = useStoredLists();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleFormatSectionRef = useRef<HTMLElement>(null);
  const displaySectionRef = useRef<HTMLElement>(null);
  const lyricsTagsSectionRef = useRef<HTMLElement>(null);
  const backupSectionRef = useRef<HTMLElement>(null);
  const masteringSectionRef = useRef<HTMLElement>(null);
  const presetSectionRef = useRef<HTMLElement>(null);
  const takeHistorySectionRef = useRef<HTMLElement>(null);
  const [titleFormat, setTitleFormat] = useState(state.titleFormat);
  const [formatSavedNotice, setFormatSavedNotice] = useState(false);
  const [lyricsTagsText, setLyricsTagsText] = useState(formatLyricsTags(state.lyricsTags));
  const [lyricsTagsSavedNotice, setLyricsTagsSavedNotice] = useState(false);
  const [editingMastering, setEditingMastering] = useState<MasteringPrompt>();
  const [masteringForm, setMasteringForm] = useState<{ name: string; prompt: string }>();
  const [editingPreset, setEditingPreset] = useState<OtherOptionsPreset>();
  const [presetForm, setPresetForm] = useState<PresetForm>();
  const [localError, setLocalError] = useState<string>();
  const [includeTakeHistoryOnExport, setIncludeTakeHistoryOnExport] = useState(true);
  const [backupNotice, setBackupNotice] = useState<string>();
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const presetFormId = useId();

  const open = !!state.settings;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    setTitleFormat(state.titleFormat);
    setFormatSavedNotice(false);
  }, [open, state.titleFormat]);

  useEffect(() => {
    setLyricsTagsText(formatLyricsTags(state.lyricsTags));
    setLyricsTagsSavedNotice(false);
  }, [open, state.lyricsTags]);

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
    if (state.settings?.action === 'create-preset') {
      void (async () => {
        const result = await controller.captureOptions();
        if (!result) return;
        setEditingPreset(undefined);
        setPresetForm({ name: '', fields: readableOptionFields(result.snapshot, result.unreadable) });
        setLocalError(undefined);
      })();
    } else {
      setPresetForm(undefined);
    }
    const sectionRefs: Partial<Record<SettingsSection, RefObject<HTMLElement | null>>> = {
      masterings: masteringSectionRef,
      titleFormat: titleFormatSectionRef,
      display: displaySectionRef,
      lyricsTags: lyricsTagsSectionRef,
      backup: backupSectionRef,
      presets: presetSectionRef,
      takeHistory: takeHistorySectionRef,
    };
    const target = (state.settings?.section && sectionRefs[state.settings.section]?.current) || presetSectionRef.current;
    target?.scrollIntoView({ block: 'start' });
  }, [open, state.settings?.section, state.settings?.action, controller]);

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
    const ui = getUiMessages();
    const issue = validateUniqueName(name, masterings, editingMastering?.id)
      ?? (!prompt ? ui.feedback.promptRequired : undefined)
      ?? (prompt.length > 1000 ? ui.feedback.promptTooLong(1000) : undefined);
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
  const saveCurrentPreset = async () => {
    const name = presetForm!.name.trim();
    const ui = getUiMessages();
    const issue = validateUniqueName(name, presets, editingPreset?.id)
      ?? (!Object.keys(presetForm!.fields).length ? ui.feedback.selectAtLeastOneField : undefined);
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

  const handleSaveTitleFormat = async () => {
    await controller.saveTitleFormat(titleFormat);
    setFormatSavedNotice(true);
    setTimeout(() => setFormatSavedNotice(false), 2000);
  };
  const handleResetTitleFormat = () => {
    setTitleFormat(DEFAULT_TITLE_FORMAT);
  };

  const handleSaveLyricsTags = async () => {
    const parsed = parseLyricsTags(lyricsTagsText);
    await controller.saveLyricsTags(parsed);
    setLyricsTagsSavedNotice(true);
    setTimeout(() => setLyricsTagsSavedNotice(false), 2000);
  };
  const handleResetLyricsTags = () => {
    setLyricsTagsText(formatLyricsTags(DEFAULT_LYRICS_TAGS));
  };

  const handleExportBackup = async () => {
    const backup = await exportBackup(includeTakeHistoryOnExport);
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `suno-create-assistant-${date}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => importFileInputRef.current?.click();

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const ui = getUiMessages();
    const text = await file.text();
    const parsed = parseBackup(text);
    if (!parsed) {
      setBackupNotice(ui.dialog.importInvalidFile);
      return;
    }
    // A native confirm() is the simplest way to gate a destructive
    // full-replace; there is no options page or background worker to host
    // a custom modal outside this dialog.
    if (!window.confirm(ui.dialog.importConfirm)) return;
    await replaceStorage(parsed);
    setBackupNotice(ui.dialog.importSuccess);
    setTimeout(() => setBackupNotice(undefined), 2000);
  };

  const restoreTake = (record: TakeRecord) => {
    void controller.reuseTake(record);
  };

  const saveTakeAsPreset = (record: TakeRecord) => {
    // Reuses the existing preset-creation form rather than saving directly,
    // so the user can name it (and drop/adjust fields) before it is
    // persisted - the same form startPreset()/saveCurrentPreset() already
    // drive for "設定を保存" and "編集".
    controller.openSettings('presets');
    setEditingPreset(undefined);
    setPresetForm({ name: record.title, fields: cloneFields(record.options) });
    setLocalError(undefined);
  };

  const handleClearTakeHistory = async () => {
    const ui = getUiMessages();
    if (!window.confirm(ui.dialog.clearAllHistoryConfirm)) return;
    await clearTakeHistory();
  };

  const ui = getUiMessages();

  return <dialog ref={dialogRef} className="suno-assistant__dialog" closedby="any" onClose={close} onCancel={close}>
    <div className="suno-assistant__dialog-body">
      <div className="suno-assistant__dialog-header">
        <h2>{ui.dialog.title}</h2>
        <button type="button" className="suno-assistant__button" onClick={close}>{ui.dialog.close}</button>
      </div>
      {(state.settingsFeedback || localError) && (
        <p className={`suno-assistant__status ${localError || state.settingsFeedback?.kind === 'error' ? 'suno-assistant__status--error' : ''}`} role={localError || state.settingsFeedback?.kind === 'error' ? 'alert' : 'status'}>
          {localError ?? state.settingsFeedback?.message}
        </p>
      )}

      <section ref={titleFormatSectionRef} aria-labelledby="suno-assistant-title-format-heading">
        <h3 id="suno-assistant-title-format-heading">{ui.dialog.titleFormatHeading}</h3>
        <p className="suno-assistant__hint">
          {ui.dialog.titleFormatHint}
        </p>
        <div className="suno-assistant__format-field">
          <input
            type="text"
            aria-label={ui.aria.titleFormatInput}
            value={titleFormat}
            onChange={(event) => setTitleFormat(event.target.value)}
          />
          <div className="suno-assistant__format-actions">
            <button type="button" onClick={handleResetTitleFormat}>{ui.dialog.resetDefault}</button>
            <button type="button" onClick={() => void handleSaveTitleFormat()}>{ui.dialog.saveFormat}</button>
            {formatSavedNotice && <span className="suno-assistant__format-saved">{ui.dialog.savedNotice}</span>}
          </div>
        </div>
      </section>

      <section ref={displaySectionRef} aria-labelledby="suno-assistant-display-heading">
        <h3 id="suno-assistant-display-heading">{ui.dialog.displayHeading}</h3>
        <label className="suno-assistant__dialog-toggle-label">
          <input
            type="checkbox"
            className="suno-assistant__check"
            checked={state.closeDisclosuresOnAdvanced}
            onChange={(event) => void controller.setCloseDisclosuresOnAdvanced(event.target.checked)}
          />
          {ui.dialog.closeDisclosuresLabel}
        </label>
        <p className="suno-assistant__hint">
          {ui.dialog.closeDisclosuresHint}
        </p>
      </section>

      <section ref={lyricsTagsSectionRef} aria-labelledby="suno-assistant-lyrics-tags-heading">
        <h3 id="suno-assistant-lyrics-tags-heading">{ui.dialog.lyricsTagsHeading}</h3>
        <p className="suno-assistant__hint">
          {ui.dialog.lyricsTagsHint}
        </p>
        <div className="suno-assistant__format-field">
          <textarea
            className="suno-assistant__tags-textarea"
            rows={6}
            value={lyricsTagsText}
            onChange={(event) => setLyricsTagsText(event.target.value)}
          />
          <div className="suno-assistant__format-actions">
            <button type="button" onClick={handleResetLyricsTags}>{ui.dialog.resetDefault}</button>
            <button type="button" onClick={() => void handleSaveLyricsTags()}>{ui.dialog.saveLyricsTags}</button>
            {lyricsTagsSavedNotice && <span className="suno-assistant__format-saved">{ui.dialog.lyricsTagsSavedNotice}</span>}
          </div>
        </div>
      </section>

      <section ref={backupSectionRef} aria-labelledby="suno-assistant-backup-heading">
        <h3 id="suno-assistant-backup-heading">{ui.dialog.backupHeading}</h3>
        <p className="suno-assistant__hint">{ui.dialog.backupHint}</p>
        <label className="suno-assistant__dialog-toggle-label">
          <input
            type="checkbox"
            className="suno-assistant__check"
            checked={includeTakeHistoryOnExport}
            onChange={(event) => setIncludeTakeHistoryOnExport(event.target.checked)}
          />
          {ui.dialog.includeTakeHistoryLabel}
        </label>
        <div className="suno-assistant__format-actions">
          <button type="button" onClick={() => void handleExportBackup()}>{ui.dialog.exportButton}</button>
          <button type="button" onClick={handleImportClick}>{ui.dialog.importButton}</button>
          <input
            ref={importFileInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => void handleImportFile(event)}
          />
          {backupNotice && <span className="suno-assistant__format-saved">{backupNotice}</span>}
        </div>
      </section>

      <section ref={masteringSectionRef} aria-labelledby="suno-assistant-mastering-heading">
        <h3 id="suno-assistant-mastering-heading">{ui.dialog.masteringHeading}</h3>
        <p className="suno-assistant__hint">{ui.dialog.masteringHint}</p>
        {!masteringForm && <>
          <ul className="suno-assistant__list">
            {masterings.map((item) => <li key={item.id}>
              <div><strong>{item.name}</strong><p>{item.prompt}</p></div>
              <div className="suno-assistant__list-actions">
                <button type="button" onClick={() => startMastering(item)}>{ui.dialog.edit}</button>
                <button type="button" onClick={() => void deleteMastering(item.id)}>{ui.dialog.delete}</button>
              </div>
            </li>)}
          </ul>
          {!masterings.length && <p className="suno-assistant__hint">{ui.dialog.notRegisteredYet}</p>}
          <button type="button" className="suno-assistant__button" onClick={() => startMastering()}>{ui.dialog.add}</button>
        </>}
        {masteringForm && <form onSubmit={(event) => { event.preventDefault(); void saveCurrentMastering(); }}>
          <label>{ui.dialog.masteringName}<input type="text" value={masteringForm.name} onChange={(event) => setMasteringForm((current) => ({ ...current!, name: event.target.value }))} /></label>
          <label>{ui.dialog.masteringPrompt}<textarea value={masteringForm.prompt} maxLength={1000} onChange={(event) => setMasteringForm((current) => ({ ...current!, prompt: event.target.value }))} /></label>
          <div className="suno-assistant__dialog-actions">
            <button type="button" onClick={cancelMastering}>{ui.dialog.cancel}</button>
            <button type="submit">{ui.dialog.save}</button>
          </div>
        </form>}
      </section>

      <section ref={presetSectionRef} aria-labelledby="suno-assistant-preset-heading">
        <h3 id="suno-assistant-preset-heading">{ui.dialog.presetHeading}</h3>
        <p className="suno-assistant__hint">{ui.dialog.presetHint}</p>
        {!presetForm && <>
          <ul className="suno-assistant__list">
            {presets.map((item) => <li key={item.id}>
              <div><strong>{item.name}</strong><p>{formatPreset(item.fields, ui)}</p></div>
              <div className="suno-assistant__list-actions">
                <button type="button" onClick={() => startPreset(item)}>{ui.dialog.edit}</button>
                <button type="button" onClick={() => void deletePreset(item.id)}>{ui.dialog.delete}</button>
              </div>
            </li>)}
          </ul>
          {!presets.length && <p className="suno-assistant__hint">{ui.dialog.notRegisteredYet}</p>}
        </>}
        {presetForm && <form onSubmit={(event) => { event.preventDefault(); void saveCurrentPreset(); }}>
          <label>{ui.dialog.presetName}<input type="text" value={presetForm.name} onChange={(event) => setPresetForm((current) => ({ ...current!, name: event.target.value }))} /></label>
          <fieldset className="suno-assistant__preset-fields">
            <legend>{ui.dialog.presetFieldsLegend}</legend>
            <label className="suno-assistant__preset-field-toggle"><input type="checkbox" checked={allSelected} onChange={(event) => setPresetForm((current) => current && { ...current, fields: event.target.checked ? emptyOtherOptions() : {} })} />{ui.dialog.allFields}</label>
            {optionKeys.map((key) => {
              const included = presetForm.fields[key] !== undefined;
              return <div className="suno-assistant__preset-field" key={key}>
                <label className="suno-assistant__preset-field-toggle"><input type="checkbox" checked={included} onChange={(event) => setPresetFieldIncluded(key, event.target.checked)} />{ui.optionLabels[key]}</label>
                {included && <div className="suno-assistant__preset-field-value">
                  {key === 'excludedStyles' && <label>{ui.dialog.excludeStylesLabel}<input name={`${presetFormId}-excluded-styles`} type="text" value={presetForm.fields.excludedStyles ?? ''} onChange={(event) => updatePresetField('excludedStyles', event.target.value)} /></label>}
                  {key === 'vocalGender' && <fieldset><legend>{ui.optionLabels.vocalGender}</legend>{(['none', 'male', 'female'] as VocalGender[]).map((value) => <label key={value}><input name={`${presetFormId}-vocal-gender`} type="radio" checked={presetForm.fields.vocalGender === value} onChange={() => updatePresetField('vocalGender', value)} />{value === 'none' ? ui.dialog.noneOption : value === 'male' ? ui.dialog.maleOption : ui.dialog.femaleOption}</label>)}</fieldset>}
                  {key === 'duration' && <fieldset><legend>{ui.optionLabels.duration}</legend><label><input name={`${presetFormId}-duration`} type="radio" checked={presetForm.fields.duration?.mode === 'auto'} onChange={() => updatePresetField('duration', { mode: 'auto' })} />Auto</label><label><input name={`${presetFormId}-duration`} type="radio" checked={presetForm.fields.duration?.mode === 'custom'} onChange={() => updatePresetField('duration', { mode: 'custom', seconds: presetForm.fields.duration?.seconds })} />{ui.custom}</label>{presetForm.fields.duration?.mode === 'custom' && <label className="suno-assistant__duration-seconds"><span>{ui.dialog.secondsLabel}</span><input name={`${presetFormId}-duration-seconds`} type="number" min="1" inputMode="numeric" value={presetForm.fields.duration.seconds ?? ''} onChange={(event) => updatePresetField('duration', { mode: 'custom', seconds: event.target.value ? Number(event.target.value) : undefined })} /></label>}</fieldset>}
                  {key === 'maxMode' && <label><input name={`${presetFormId}-max-mode`} type="checkbox" checked={presetForm.fields.maxMode ?? false} onChange={(event) => updatePresetField('maxMode', event.target.checked)} />{ui.dialog.maxModeToggle}</label>}
                  {(key === 'weirdness' || key === 'styleInfluence' || key === 'variation' || key === 'audioInfluence') && (() => { const value = presetForm.fields[key] ?? 0; return <label>{ui.optionLabels[key]}<span className="suno-assistant__range"><input name={`${presetFormId}-${key}`} type="range" min="0" max="100" value={value} onChange={(event) => updatePresetField(key, Number(event.target.value))} /><output>{key === 'variation' ? value : `${value}%`}</output></span></label>; })()}
                  {key === 'personalization' && <label><input name={`${presetFormId}-personalization`} type="checkbox" checked={presetForm.fields.personalization?.enabled ?? false} onChange={(event) => updatePresetField('personalization', { ...presetForm.fields.personalization, enabled: event.target.checked })} />{ui.dialog.personalizationToggle}</label>}
                </div>}
              </div>;
            })}
          </fieldset>
          <div className="suno-assistant__dialog-actions">
            <button type="button" onClick={cancelPreset}>{ui.dialog.cancel}</button>
            <button type="submit">{ui.dialog.save}</button>
          </div>
        </form>}
      </section>

      <section ref={takeHistorySectionRef} aria-labelledby="suno-assistant-take-history-heading">
        <h3 id="suno-assistant-take-history-heading">{ui.dialog.takeHistoryHeading}</h3>
        <p className="suno-assistant__hint">{ui.dialog.takeHistoryHint}</p>
        <ul className="suno-assistant__list suno-assistant__list--stacked">
          {takeHistory.map((record) => <li key={record.id}>
            <div>
              <strong>{record.title}</strong>
              <p>{new Date(record.createdAt).toLocaleString()}</p>
              <p>{formatPreset(record.options, ui)}</p>
              {record.clipIds[0] && <a href={`/song/${record.clipIds[0]}`}>{ui.dialog.linkedToSong}</a>}
            </div>
            <div className="suno-assistant__list-actions">
              <button type="button" onClick={() => restoreTake(record)}>{ui.dialog.restoreParams}</button>
              <button type="button" onClick={() => saveTakeAsPreset(record)}>{ui.dialog.saveAsPreset}</button>
              <button type="button" onClick={() => void deleteTakeRecord(record.id)}>{ui.dialog.delete}</button>
            </div>
          </li>)}
        </ul>
        {!takeHistory.length && <p className="suno-assistant__hint">{ui.dialog.takeHistoryEmpty}</p>}
        {!!takeHistory.length && <button type="button" className="suno-assistant__button" onClick={() => void handleClearTakeHistory()}>{ui.dialog.clearAllHistory}</button>}
      </section>
    </div>
  </dialog>;
}
