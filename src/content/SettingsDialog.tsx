import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { autoTitle, DEFAULT_TITLE_FORMAT, formatLyricsTags, formatPreset, parseLyricsTags, readableOptionFields, replaceTakePlaceholder, validateUniqueName } from '../domain/logic';
import { DEFAULT_LYRICS_TAGS, DEFAULT_TAKE_HISTORY_LIMIT, emptyOtherOptions, optionKeys, type MasteringPrompt, type OtherOptionsKey, type OtherOptionsPreset, type OtherOptionsSnapshot, type TakeRecord, type VocalGender } from '../domain/models';
import { clearTakeHistory, deleteMastering, deletePreset, deleteTakeRecord, exportBackup, parseBackup, replaceStorage, saveMastering, savePreset, setTakeHistoryLimit } from '../storage/repository';
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

// Order and identity of the sidebar's section tabs. Labels are resolved
// from `ui.dialog.*Heading` at render time (see sectionLabel below) so this
// stays language-agnostic.
const SECTION_ORDER: SettingsSection[] = ['display', 'lyricsTags', 'masterings', 'presets', 'titleFormat', 'takeHistory', 'backup', 'about'];

// Generic (non-brand) glyphs, one per tab, purely as a visual anchor next
// to each label - matching the icon-before-label pattern of the reference
// sidebar the user asked to follow.
const SECTION_ICON_PATHS: Record<SettingsSection, string> = {
  titleFormat: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z',
  display: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5m0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5m0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  lyricsTags: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3z',
  backup: 'M19 12v7H5v-7H3v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7zM13 12.67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z',
  masterings: 'M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2',
  presets: 'M3 17v2h6v-2zM3 5v2h10V5zm10 16v-2h8v-2h-8v-2h-2v6zM7 9v2H3v2h4v2h2V9zm14 4v-2H11v2zm-6-4h2V7h4V5h-4V3h-2v6z',
  takeHistory: 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18m-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8z',
  about: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m1 15h-2v-6h2zm0-8h-2V7h2z',
};

const PLACEHOLDER_ITEMS: Array<{ tag: string; getDesc: (ui: UiMessages) => string }> = [
  { tag: '{{WORKSPACE}}', getDesc: (ui) => ui.dialog.phWorkspace },
  { tag: '{{STYLE}}', getDesc: (ui) => ui.dialog.phStyle },
  { tag: '{{AUDIO}}', getDesc: (ui) => ui.dialog.phAudio },
  { tag: '{{MODEL}}', getDesc: (ui) => ui.dialog.phModel },
  { tag: '{{MASTERING}}', getDesc: (ui) => ui.dialog.phMastering },
  { tag: '{{PRESET}}', getDesc: (ui) => ui.dialog.phPreset },
  { tag: '{{DATE}}', getDesc: (ui) => ui.dialog.phDate },
  { tag: '{{TIME}}', getDesc: (ui) => ui.dialog.phTime },
  { tag: '{{TAKE}}', getDesc: (ui) => ui.dialog.phTake },
  { tag: '{{TAKE:3}}', getDesc: (ui) => ui.dialog.phTakePadded },
];

function SectionIcon({ section }: { section: SettingsSection }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={SECTION_ICON_PATHS[section]} />
    </svg>
  );
}

function sectionLabel(section: SettingsSection, ui: UiMessages): string {
  switch (section) {
    case 'titleFormat': return ui.dialog.titleFormatHeading;
    case 'display': return ui.dialog.displayHeading;
    case 'lyricsTags': return ui.dialog.lyricsTagsHeading;
    case 'backup': return ui.dialog.backupHeading;
    case 'masterings': return ui.dialog.masteringHeading;
    case 'presets': return ui.dialog.presetHeading;
    case 'takeHistory': return ui.dialog.takeHistoryHeading;
    case 'about': return ui.dialog.aboutHeading;
    default: return section;
  }
}

export function SettingsDialog({ controller }: { controller: SunoController }) {
  const state = useController(controller);
  const { masterings, presets, takeHistory, takeHistoryLimit } = useStoredLists();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeSection: SettingsSection = state.settings?.section ?? 'display';
  const [titleFormat, setTitleFormat] = useState(state.titleFormat);
  const [formatSavedNotice, setFormatSavedNotice] = useState(false);
  const [lyricsTagsText, setLyricsTagsText] = useState(formatLyricsTags(state.lyricsTags));
  const [lyricsTagsSavedNotice, setLyricsTagsSavedNotice] = useState(false);
  const [historyLimitText, setHistoryLimitText] = useState(String(takeHistoryLimit));
  const [historyLimitSavedNotice, setHistoryLimitSavedNotice] = useState(false);
  const [editingMastering, setEditingMastering] = useState<MasteringPrompt>();
  const [masteringForm, setMasteringForm] = useState<{ name: string; prompt: string }>();
  const [editingPreset, setEditingPreset] = useState<OtherOptionsPreset>();
  const [presetForm, setPresetForm] = useState<PresetForm>();
  const [localError, setLocalError] = useState<string>();
  const [includeTakeHistoryOnExport, setIncludeTakeHistoryOnExport] = useState(true);
  const [backupNotice, setBackupNotice] = useState<string>();
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const titleFormatInputRef = useRef<HTMLInputElement>(null);
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
    setHistoryLimitText(String(takeHistoryLimit));
  }, [takeHistoryLimit]);

  useEffect(() => {
    if (!open) {
      setHistoryLimitSavedNotice(false);
    }
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
    if (state.settings?.action === 'create-preset') {
      void (async () => {
        const result = await controller.captureOptions();
        if (!result) return;
        setEditingPreset(undefined);
        setPresetForm({ name: '', fields: readableOptionFields(result.snapshot, result.unreadable) });
        setLocalError(undefined);
      })();
    } else if (state.settings?.action !== 'reuse-as-preset') {
      // 'reuse-as-preset' (see saveTakeAsPreset below) already set presetForm
      // itself in the same click; clearing it here would immediately wipe
      // that out on the very next render. Every other way of arriving at
      // the presets section (the gear icon beside the preset dropdown, or
      // simply clicking its sidebar tab) should show the list, not a
      // leftover form from a previous edit.
      setPresetForm(undefined);
    }
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
  const insertPlaceholder = (tag: string) => {
    const input = titleFormatInputRef.current;
    if (!input) {
      setTitleFormat((current) => (current ? `${current} ${tag}` : tag));
      return;
    }
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const nextValue = `${before}${tag}${after}`;
    setTitleFormat(nextValue);
    const nextCursor = start + tag.length;
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const previewTitle = useMemo(() => {
    const ui = getUiMessages();
    const sampleWs = controller.adapter.getDestinationName() || 'Workspace';
    const sampleStyle = state.isCustomStyle
      ? ui.custom
      : (state.style?.name || 'City Pop');
    const sampleAudio = controller.adapter.getAudioTitle() || 'Sample Track';
    const sampleModel = controller.adapter.getModelName() || 'v6';
    const sampleMastering = state.mastering?.name || 'Warm Analog';
    const samplePreset = state.preset?.name || 'Acoustic';

    const resolved = autoTitle(sampleWs, sampleStyle, titleFormat, {
      audioTitle: sampleAudio,
      model: sampleModel,
      mastering: sampleMastering,
      preset: samplePreset,
      now: new Date(),
    });
    return replaceTakePlaceholder(resolved, 1);
  }, [titleFormat, state.isCustomStyle, state.style?.name, state.mastering?.name, state.preset?.name, controller.adapter]);

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
    // drive for "設定を保存" and "編集". The 'reuse-as-preset' action tells
    // the effect above not to clear presetForm right back out again.
    controller.openSettings('presets', 'reuse-as-preset');
    setEditingPreset(undefined);
    setPresetForm({ name: record.title, fields: cloneFields(record.options) });
    setLocalError(undefined);
  };

  const handleSaveHistoryLimit = async () => {
    const val = parseInt(historyLimitText, 10);
    if (isNaN(val) || val < 1) return;
    await setTakeHistoryLimit(val);
    setHistoryLimitSavedNotice(true);
    setTimeout(() => setHistoryLimitSavedNotice(false), 2000);
  };
  const handleResetHistoryLimit = () => {
    setHistoryLimitText(String(DEFAULT_TAKE_HISTORY_LIMIT));
  };

  const handleClearTakeHistory = async () => {
    const ui = getUiMessages();
    if (!window.confirm(ui.dialog.clearAllHistoryConfirm)) return;
    await clearTakeHistory();
  };

  const ui = getUiMessages();
  let appVersion = 'unknown';
  let appIconUrl: string | undefined;
  // An already-open dialog may render once more while Chrome is invalidating
  // this content script after an extension update. Runtime access itself can
  // throw then, so leave the informational metadata empty and let WXT's
  // invalidation handler dispose the old UI.
  try {
    if (typeof chrome !== 'undefined') {
      appVersion = chrome.runtime?.getManifest?.().version ?? 'unknown';
      appIconUrl = chrome.runtime?.getURL?.('icon-128.png');
    }
  } catch {
    // The old extension context is no longer usable.
  }

  return <dialog ref={dialogRef} className="suno-assistant__dialog" closedby="any" onClose={close} onCancel={close}>
    <div className="suno-assistant__dialog-body">
      <div className="suno-assistant__dialog-header">
        <h2>{ui.dialog.title}</h2>
        <button type="button" className="suno-assistant__button" onClick={close}>{ui.dialog.close}</button>
      </div>
      {(state.settingsFeedback || localError) && (
        <p className={`suno-assistant__status suno-assistant__dialog-feedback ${localError || state.settingsFeedback?.kind === 'error' ? 'suno-assistant__status--error' : ''}`} role={localError || state.settingsFeedback?.kind === 'error' ? 'alert' : 'status'}>
          {localError ?? state.settingsFeedback?.message}
        </p>
      )}

      <div className="suno-assistant__dialog-layout">
        <nav className="suno-assistant__dialog-nav" aria-label={ui.aria.settingsSections}>
          {SECTION_ORDER.map((section) => (
            <button
              key={section}
              type="button"
              className="suno-assistant__dialog-nav-item"
              aria-current={activeSection === section ? 'page' : undefined}
              onClick={() => controller.openSettings(section)}
            >
              <SectionIcon section={section} />
              {sectionLabel(section, ui)}
            </button>
          ))}
        </nav>
        <div className="suno-assistant__dialog-content">
      {activeSection === 'display' && <section aria-labelledby="suno-assistant-display-heading">
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
      </section>}

      {activeSection === 'lyricsTags' && <section aria-labelledby="suno-assistant-lyrics-tags-heading">
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
      </section>}

      {activeSection === 'masterings' && <section aria-labelledby="suno-assistant-mastering-heading">
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
      </section>}

      {activeSection === 'presets' && <section aria-labelledby="suno-assistant-preset-heading">
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
      </section>}

      {activeSection === 'titleFormat' && <section aria-labelledby="suno-assistant-title-format-heading">
        <h3 id="suno-assistant-title-format-heading">{ui.dialog.titleFormatHeading}</h3>
        <div className="suno-assistant__format-field">
          <input
            ref={titleFormatInputRef}
            type="text"
            aria-label={ui.aria.titleFormatInput}
            value={titleFormat}
            onChange={(event) => setTitleFormat(event.target.value)}
          />
          <div className="suno-assistant__format-preview">
            <span className="suno-assistant__format-preview-label">{ui.dialog.titleFormatPreviewLabel}:</span>
            <span className="suno-assistant__format-preview-value">{previewTitle}</span>
          </div>
          <div className="suno-assistant__format-actions">
            <button type="button" onClick={handleResetTitleFormat}>{ui.dialog.resetDefault}</button>
            <button type="button" onClick={() => void handleSaveTitleFormat()}>{ui.dialog.saveFormat}</button>
            {formatSavedNotice && <span className="suno-assistant__format-saved">{ui.dialog.savedNotice}</span>}
          </div>
          <div className="suno-assistant__format-explanation">
            <p className="suno-assistant__hint">
              {ui.dialog.titleFormatHintLead}
            </p>
            <table className="suno-assistant__format-table">
              <tbody>
                {PLACEHOLDER_ITEMS.map(({ tag, getDesc }) => (
                  <tr key={tag}>
                    <td>
                      <button
                        type="button"
                        className="suno-assistant__tag-button"
                        onClick={() => insertPlaceholder(tag)}
                      >
                        {tag}
                      </button>
                    </td>
                    <td>{getDesc(ui)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>}

      {activeSection === 'takeHistory' && <section aria-labelledby="suno-assistant-take-history-heading">
        <h3 id="suno-assistant-take-history-heading">{ui.dialog.takeHistoryHeading}</h3>
        <p className="suno-assistant__hint">{ui.dialog.takeHistoryHint}</p>
        <div className="suno-assistant__take-history-limit">
          <label>
            <span>{ui.dialog.takeHistoryLimitLabel}:</span>
            <input
              type="number"
              min={1}
              value={historyLimitText}
              onChange={(event) => setHistoryLimitText(event.target.value)}
            />
            <span>{ui.dialog.takeHistoryLimitUnit}</span>
          </label>
          <div className="suno-assistant__format-actions">
            <button type="button" onClick={handleResetHistoryLimit}>{ui.dialog.resetDefault}</button>
            <button type="button" onClick={() => void handleSaveHistoryLimit()}>{ui.dialog.saveTakeHistoryLimit}</button>
            {historyLimitSavedNotice && <span className="suno-assistant__format-saved">{ui.dialog.takeHistoryLimitSavedNotice}</span>}
          </div>
        </div>
        <ul className="suno-assistant__list suno-assistant__list--stacked">
          {takeHistory.map((record) => <li key={record.id}>
            <div>
              <strong>{record.title}</strong>
              <p>{new Date(record.createdAt).toLocaleString()}</p>
              <p>{formatPreset(record.options, ui)}</p>
              {record.clipIds.length > 0 && <div className="suno-assistant__take-links">
                {record.clipIds.map((clipId, i) => <a key={clipId} href={`/song/${clipId}`}>
                  {record.clipIds.length > 1 ? ui.dialog.linkedToSongNumbered(i + 1) : ui.dialog.linkedToSong}
                </a>)}
              </div>}
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
      </section>}

      {activeSection === 'backup' && <section aria-labelledby="suno-assistant-backup-heading">
        <h3 id="suno-assistant-backup-heading">{ui.dialog.backupHeading}</h3>
        <p className="suno-assistant__hint">{ui.dialog.backupHint}</p>
        <div className="suno-assistant__backup-row">
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
        </div>
      </section>}

      {activeSection === 'about' && <section aria-labelledby="suno-assistant-about-heading">
        <h3 id="suno-assistant-about-heading">{ui.dialog.aboutHeading}</h3>
        <div className="suno-assistant__about">
          <div className="suno-assistant__about-icon" aria-hidden="true">
            {appIconUrl && <img src={appIconUrl} alt="Suno Create Assistant" width={96} height={96} />}
          </div>
          <div className="suno-assistant__about-name">Suno Create Assistant</div>
          <div className="suno-assistant__about-version"><span>{ui.dialog.aboutVersionLabel}</span> {appVersion}</div>
          <div className="suno-assistant__about-copyright">{ui.dialog.aboutCopyright}</div>
          <div className="suno-assistant__about-link-row">
            <span>{ui.dialog.aboutWebsiteLabel}</span>
            <a href={ui.dialog.aboutWebsiteUrl} target="_blank" rel="noreferrer">{ui.dialog.aboutWebsiteUrl}</a>
          </div>
        </div>
      </section>}
        </div>
      </div>
    </div>
  </dialog>;
}
