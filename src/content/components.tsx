import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_TITLE_FORMAT, displayTagName } from '../domain/logic';
import type { MasteringPrompt, OtherOptionsPreset, SavedStyle } from '../domain/models';
import { readStorage, subscribeStorage } from '../storage/repository';
import type { ControllerState, SunoController } from '../suno/controller';
import { getUiMessages } from '../locales';

export function useController(controller: SunoController): ControllerState {
  const [state, setState] = useState<ControllerState>({
    styles: [], stylesLoading: false, stylesDirty: true, isCustomStyle: false, autoTitleEnabled: false, titleFormat: DEFAULT_TITLE_FORMAT, closeDisclosuresOnAdvanced: true, lyricsTags: [],
  });
  useEffect(() => controller.subscribe(setState), [controller]);
  return state;
}

export function useStoredLists(): { masterings: MasteringPrompt[]; presets: OtherOptionsPreset[] } {
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
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!event.composedPath().includes(container.current!)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useLayoutEffect(() => {
    const menuElement = menu.current;
    const triggerElement = trigger.current;
    if (!open || !menuElement || !triggerElement) return;
    const positionMenu = () => {
      const rect = triggerElement.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - Math.min(380, window.innerWidth - 16));
      menuElement.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 8)}px`;
      menuElement.style.left = `${Math.max(8, Math.min(rect.left, maxLeft))}px`;
    };
    positionMenu();
    menuElement.showPopover();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
      if (menuElement.matches(':popover-open')) menuElement.hidePopover();
    };
  }, [open]);
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
    <button ref={trigger} type="button" className="suno-assistant__select" aria-label={`${label}: ${valueLabel}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} disabled={disabled} onClick={() => void toggle()} onKeyDown={onKeyDown}>
      {valueLabel} <span aria-hidden="true">▼</span>
    </button>
    {open && <div ref={menu} id={listId} className="suno-assistant__menu" popover="auto" role="listbox" aria-label={label} onToggle={() => {
      if (!menu.current?.matches(':popover-open')) setOpen(false);
    }}>
      {items.map((item, index) => <button key={item.id} type="button" role="option" aria-selected={valueLabel === item.label} className={item.manage ? 'suno-assistant__manage' : undefined} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}>{item.label}</button>)}
    </div>}
  </div>;
}

export function StyleControls({ controller }: { controller: SunoController }) {
  const state = useController(controller);
  const { masterings } = useStoredLists();
  const ui = getUiMessages();
  const styles: MenuItem<SavedStyle>[] = [
    { id: 'none', label: ui.unselected },
    ...state.styles.map((style) => ({ id: style.id, label: style.name, value: style })),
  ];
  const masteringItems: MenuItem<MasteringPrompt>[] = [
    { id: 'none', label: ui.unselected },
    ...masterings.map((item) => ({ id: item.id, label: item.name, value: item })),
    { id: 'manage', label: ui.manage, manage: true },
  ];
  const styleLabel = state.isCustomStyle ? ui.custom : state.style?.name ?? ui.unselected;
  return <div className="suno-assistant" aria-label={ui.aria.styleSettings}>
    <Dropdown label={ui.style} valueLabel={state.stylesLoading ? ui.loading : styleLabel} items={styles} disabled={state.stylesLoading} onOpen={() => controller.refreshStyles()} onSelect={(style) => void controller.selectStyle(style)} />
    <Dropdown label={ui.mastering} valueLabel={state.mastering?.name ?? ui.unselected} items={masteringItems} onSelect={(mastering, manage) => manage ? controller.openSettings('masterings') : void controller.selectMastering(mastering)} />
    <button type="button" className="suno-assistant__button suno-assistant__button--clear" onClick={() => controller.clearStyleAndMastering()}>{ui.clear}</button>
    {state.styleFeedback && <output className={`suno-assistant__status ${state.styleFeedback.kind === 'error' ? 'suno-assistant__status--error' : ''}`}>{state.styleFeedback.message}</output>}
  </div>;
}

export function PresetControls({ controller }: { controller: SunoController }) {
  const state = useController(controller);
  const { presets } = useStoredLists();
  const ui = getUiMessages();
  const items: MenuItem<OtherOptionsPreset>[] = [
    { id: 'none', label: ui.unselected },
    ...presets.map((preset) => ({ id: preset.id, label: preset.name, value: preset })),
    { id: 'manage', label: ui.managePresets, manage: true },
  ];
  return <div className="suno-assistant" aria-label={ui.aria.presetSettings}>
    <Dropdown label={ui.preset} valueLabel={state.preset?.name ?? ui.unselected} items={items} onSelect={(preset, manage) => manage ? controller.openSettings('presets') : void controller.applyPreset(preset)} />
    <button type="button" className="suno-assistant__button" onClick={() => controller.openPresetCreation()}>{ui.savePreset}</button>
    {state.presetFeedback && <output className={`suno-assistant__status ${state.presetFeedback.kind === 'error' ? 'suno-assistant__status--error' : ''}`}>{state.presetFeedback.message}</output>}
  </div>;
}

export function AutoTitleControl({ controller }: { controller: SunoController }) {
  const state = useController(controller);
  const id = useId();
  const ui = getUiMessages();
  return <div className="suno-assistant suno-assistant--title">
    <label className="suno-assistant__check-label" htmlFor={id}>
      <input id={id} className="suno-assistant__check" type="checkbox" checked={state.autoTitleEnabled} onChange={(event) => void controller.setAutoTitle(event.target.checked)} />
      {ui.autoTitle}
    </label>
  </div>;
}

export function SidebarSettingsButton({ controller }: { controller: SunoController }) {
  const state = useController(controller);
  const isOpen = !!state.settings;
  const ui = getUiMessages();

  return (
    <button
      type="button"
      data-suno-assistant="sidebar-settings-button"
      {...(isOpen ? { 'data-active': '' } : { 'data-inactive': '' })}
      className="hxc-btn-base hxc-btn-variant-tertiary-legacy hxc-btn-size-mini hxc-btn-shape-pill hxc-btn-background [--hxc-btn-px:1rem] [--hxc-btn-py:0.5rem] [--hxc-btn-font-size:0.875rem] [--hxc-btn-line-height:2rem] [--hxc-btn-icon-size:1.125rem] [--hxc-btn-icon-margin-y:0.4375rem] [--hxc-btn-icon-margin-x:0rem] [--hxc-btn-content-gap:0.75rem] text-foreground-tertiary data-[active]:text-foreground-primary data-[active]:[--hxc-btn-overlay-opacity:0.5] data-[active]:hover:[--hxc-btn-overlay-opacity:0.8] data-[active]:[--hxc-btn-overlay:var(--color-background-glass-dense)] hover:text-foreground-primary focus-visible:text-foreground-primary data-[popup-open]:text-foreground-primary w-full overflow-hidden text-left justify-start cursor-pointer border-0"
      onClick={() => controller.openSettings('titleFormat')}
    >
      <span aria-hidden="true" className="hxc-btn-overlay-slot hxc-btn-border" />
      <span className="hxc-btn-content">
        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" className="hxc-btn-icon">
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
        </svg>
        <span className="overflow-hidden whitespace-nowrap transition-opacity duration-200 group-data-[show-content=false]/sidebar:opacity-0">{ui.extensionSettings}</span>
      </span>
    </button>
  );
}

export function LyricsTagPalette({ controller }: { controller: SunoController }) {
  const state = useController(controller);
  const ui = getUiMessages();

  return (
    <div className="suno-assistant suno-assistant--lyrics" aria-label={ui.aria.lyricsTagPalette}>
      <div className="suno-assistant__tag-palette">
        {state.lyricsTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="suno-assistant__tag-button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void controller.insertLyricsTag(tag)}
            title={tag}
          >
            {displayTagName(tag)}
          </button>
        ))}
        <button
          type="button"
          className="suno-assistant__tag-button suno-assistant__tag-button--settings"
          aria-label={ui.aria.editLyricsTags}
          title={ui.aria.editLyricsTags}
          onClick={() => controller.openSettings('lyricsTags')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>
      </div>
    </div>
  );
}


