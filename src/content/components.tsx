import { useEffect, useId, useRef, useState } from 'react';
import type { MasteringPrompt, OtherOptionsPreset, SavedStyle } from '../domain/models';
import { readStorage, subscribeStorage } from '../storage/repository';
import type { ControllerState, SunoController } from '../suno/controller';

export function useController(controller: SunoController): ControllerState {
  const [state, setState] = useState<ControllerState>({
    styles: [], stylesLoading: false, stylesDirty: true, isCustomStyle: false, autoTitleEnabled: false,
  });
  useEffect(() => controller.subscribe(setState), [controller]);
  return state;
}

function useStoredLists(): { masterings: MasteringPrompt[]; presets: OtherOptionsPreset[] } {
  const [lists, setLists] = useState<{ masterings: MasteringPrompt[]; presets: OtherOptionsPreset[] }>({ masterings: [], presets: [] });
  useEffect(() => {
    const update = async () => {
      const stored = await readStorage();
      setLists({ masterings: stored.masteringPrompts, presets: stored.optionPresets });
    };
    void update();
    return subscribeStorage(() => { void update(); });
  }, []);
  return lists;
}

interface MenuItem<T> { id: string; label: string; value?: T; manage?: boolean }

function Dropdown<T>({ label, valueLabel, items, disabled, onOpen, onSelect }: {
  label: string;
  valueLabel: string;
  items: MenuItem<T>[];
  disabled?: boolean;
  onOpen?: () => Promise<void> | void;
  onSelect: (value: T | undefined, manage?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const toggle = async () => {
    if (disabled) return;
    if (!open) await onOpen?.();
    setOpen((previous) => !previous);
  };
  const choose = (item: MenuItem<T>) => {
    onSelect(item.value, item.manage);
    setOpen(false);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (current + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % Math.max(items.length, 1));
    }
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'Enter' && open && items[active]) choose(items[active]);
  };
  return <div className="suno-assistant__dropdown" ref={container}>
    <button type="button" className="suno-assistant__select" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} disabled={disabled} onClick={() => void toggle()} onKeyDown={onKeyDown}>
      {label}: {valueLabel} ▼
    </button>
    {open && <div id={listId} className="suno-assistant__menu" role="listbox" aria-label={label}>
      {items.map((item, index) => <button key={item.id} type="button" role="option" aria-selected={valueLabel === item.label} className={item.manage ? 'suno-assistant__manage' : undefined} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}>{item.label}</button>)}
    </div>}
  </div>;
}

export function StyleControls({ controller }: { controller: SunoController }) {
  const state = useController(controller);
  const { masterings } = useStoredLists();
  const styles: MenuItem<SavedStyle>[] = [
    { id: 'none', label: '未選択' },
    ...state.styles.map((style) => ({ id: style.id, label: style.name, value: style })),
  ];
  const masteringItems: MenuItem<MasteringPrompt>[] = [
    { id: 'none', label: '未選択' },
    ...masterings.map((item) => ({ id: item.id, label: item.name, value: item })),
    { id: 'manage', label: '管理…', manage: true },
  ];
  const styleLabel = state.isCustomStyle ? 'カスタム' : state.style?.name ?? '未選択';
  return <div className="suno-assistant" aria-label="Suno Create Assistant: スタイル設定">
    <Dropdown label="スタイル" valueLabel={state.stylesLoading ? '読み込み中…' : styleLabel} items={styles} disabled={state.stylesLoading} onOpen={() => controller.refreshStyles()} onSelect={(style) => void controller.selectStyle(style)} />
    <Dropdown label="マスタリング" valueLabel={state.mastering?.name ?? '未選択'} items={masteringItems} onSelect={(mastering, manage) => manage ? void chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }) : void controller.selectMastering(mastering)} />
    <button type="button" className="suno-assistant__button suno-assistant__button--clear" onClick={() => controller.clearStyleAndMastering()}>解除</button>
    {(state.error || state.notice) && <output className={`suno-assistant__status ${state.error ? 'suno-assistant__status--error' : ''}`}>{state.error ?? state.notice}</output>}
  </div>;
}

export function PresetControls({ controller }: { controller: SunoController }) {
  const state = useController(controller);
  const { presets } = useStoredLists();
  const items: MenuItem<OtherOptionsPreset>[] = [
    { id: 'none', label: '未選択' },
    ...presets.map((preset) => ({ id: preset.id, label: preset.name, value: preset })),
    { id: 'manage', label: 'プリセットを管理…', manage: true },
  ];
  return <div className="suno-assistant" aria-label="Suno Create Assistant: その他のオプションプリセット">
    <Dropdown label="プリセット" valueLabel={state.preset?.name ?? '未選択'} items={items} onSelect={(preset, manage) => manage ? void chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }) : controller.applyPreset(preset)} />
    {(state.error || state.notice) && <output className={`suno-assistant__status ${state.error ? 'suno-assistant__status--error' : ''}`}>{state.error ?? state.notice}</output>}
  </div>;
}

export function AutoTitleControl({ controller }: { controller: SunoController }) {
  const state = useController(controller);
  const id = useId();
  return <div className="suno-assistant suno-assistant--title">
    <label className="suno-assistant__check-label" htmlFor={id}>
      <input id={id} className="suno-assistant__check" type="checkbox" checked={state.autoTitleEnabled} onChange={(event) => void controller.setAutoTitle(event.target.checked)} />
      自動設定
    </label>
  </div>;
}
