import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_TITLE_FORMAT, displayTagName, optionFieldSummaryLines } from '../domain/logic';
import { DEFAULT_TAKE_HISTORY_LIMIT, type MasteringPrompt, type OtherOptionsPreset, type SavedStyle, type TakeRecord } from '../domain/models';
import { readStorage, subscribeStorage } from '../storage/repository';
import type { ControllerState, SunoController } from '../suno/controller';
import { getUiMessages } from '../locales';

export function useController(controller: SunoController): ControllerState {
  const [state, setState] = useState<ControllerState>({
    styles: [], stylesLoading: false, stylesDirty: true, isCustomStyle: false, isCustomPreset: false, autoTitleEnabled: false, titleFormat: DEFAULT_TITLE_FORMAT, closeDisclosuresOnAdvanced: true, lyricsTags: [],
  });
  useEffect(() => controller.subscribe(setState), [controller]);
  return state;
}

export function useStoredLists(): {
  masterings: MasteringPrompt[];
  presets: OtherOptionsPreset[];
  takeHistory: TakeRecord[];
  takeHistoryLimit: number;
} {
  const [lists, setLists] = useState<{
    masterings: MasteringPrompt[];
    presets: OtherOptionsPreset[];
    takeHistory: TakeRecord[];
    takeHistoryLimit: number;
  }>({
    masterings: [],
    presets: [],
    takeHistory: [],
    takeHistoryLimit: DEFAULT_TAKE_HISTORY_LIMIT,
  });
  useEffect(() => {
    const update = async () => {
      const stored = await readStorage();
      setLists({
        masterings: stored.masteringPrompts,
        presets: stored.optionPresets,
        takeHistory: stored.takeHistory,
        takeHistoryLimit: stored.takeHistoryLimit ?? DEFAULT_TAKE_HISTORY_LIMIT,
      });
    };
    void update();
    return subscribeStorage(() => { void update(); });
  }, []);
  return lists;
}

function GearIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  );
}

// Suno's own trash-can glyph, confirmed identical (same `<path>` data) on
// suno.com/create between the saved-styles dialog's "削除: <name>" button and
// a workspace clip row's "ゴミ箱へ移動" context-menu item - not a guessed
// icon-set shape.
function TrashIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M7.308 20.5a1.74 1.74 0 0 1-1.277-.531 1.74 1.74 0 0 1-.531-1.277V6h-.25a.73.73 0 0 1-.534-.216.73.73 0 0 1-.216-.534q0-.32.216-.535A.73.73 0 0 1 5.25 4.5H9q0-.368.259-.626a.85.85 0 0 1 .625-.259h4.232q.367 0 .625.259A.85.85 0 0 1 15 4.5h3.75q.318 0 .534.216a.73.73 0 0 1 .216.534q0 .32-.216.534A.73.73 0 0 1 18.75 6h-.25v12.692q0 .746-.531 1.277a1.74 1.74 0 0 1-1.277.531zm2.846-3.5q.319 0 .534-.215a.73.73 0 0 0 .216-.535v-7.5a.73.73 0 0 0-.216-.535.73.73 0 0 0-.535-.215.73.73 0 0 0-.534.215.73.73 0 0 0-.215.535v7.5q0 .318.216.535a.73.73 0 0 0 .534.215m3.693 0q.318 0 .534-.215a.73.73 0 0 0 .215-.535v-7.5a.73.73 0 0 0-.216-.535.73.73 0 0 0-.534-.215.73.73 0 0 0-.534.215.73.73 0 0 0-.216.535v7.5q0 .318.216.535a.73.73 0 0 0 .535.215" />
    </svg>
  );
}

// Suno has no native "bookmark" feature to measure, so this stays in the
// same icon family GearIcon already uses (Material Icons Filled) rather
// than guessing a shape from an unrelated icon set.
function BookmarkIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

// Suno's own dropdown-trigger chevron, measured from its role="combobox"
// buttons (the workspace sort/list-view controls, aria-label="新着"/"リスト"
// in docs/showmore.txt) rather than the model selector's menu-trigger icon
// (a different, more angular shape) - those combobox buttons share our
// Dropdown's exact semantics (label text followed by a chevron), so their
// icon is the correct reference, not a guessed shape.
function ChevronDownIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="m11.995 14.65 6.337-6.337q.323-.324.765-.313t.766.334q.323.324.323.766t-.323.765l-6.64 6.618a1.7 1.7 0 0 1-.582.388 1.7 1.7 0 0 1-.646.129 1.7 1.7 0 0 1-.647-.13 1.7 1.7 0 0 1-.582-.387l-6.64-6.64a1 1 0 0 1-.312-.754q.011-.43.334-.755.324-.323.766-.323t.765.323z" />
    </svg>
  );
}

interface MenuItem<T> { id: string; label: string; value?: T }

function Dropdown<T>({ label, valueLabel, items, disabled, onOpen, onSelect }: {
  label: string;
  valueLabel: string;
  items: MenuItem<T>[];
  disabled?: boolean;
  onOpen?: () => Promise<void> | void;
  onSelect: (value: T | undefined) => void;
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
    onSelect(item.value);
    setOpen(false);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (current + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % Math.max(items.length, 1));
    }
    if (event.key === 'Home' && items.length) {
      event.preventDefault();
      setOpen(true);
      setActive(0);
    }
    if (event.key === 'End' && items.length) {
      event.preventDefault();
      setOpen(true);
      setActive(items.length - 1);
    }
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'Enter' && open && items[active]) choose(items[active]);
  };
  return <div className="suno-assistant__dropdown" ref={container}>
    <button ref={trigger} type="button" className="suno-assistant__select" aria-label={`${label}: ${valueLabel}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} disabled={disabled} onClick={() => void toggle()} onKeyDown={onKeyDown}>
      {valueLabel} <span aria-hidden="true" className="suno-assistant__chevron"><ChevronDownIcon /></span>
    </button>
    {open && <div ref={menu} id={listId} className="suno-assistant__menu" popover="auto" role="listbox" aria-label={label} onToggle={() => {
      if (!menu.current?.matches(':popover-open')) setOpen(false);
    }}>
      {items.map((item, index) => <button key={item.id} type="button" role="option" aria-selected={valueLabel === item.label} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}>{item.label}</button>)}
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
  ];
  const styleLabel = state.isCustomStyle ? ui.custom : state.style?.name ?? ui.unselected;
  return <div className="suno-assistant suno-assistant--styles" aria-label={ui.aria.styleSettings}>
    <Dropdown label={ui.style} valueLabel={state.stylesLoading ? ui.loading : styleLabel} items={styles} disabled={state.stylesLoading} onOpen={() => controller.refreshStyles()} onSelect={(style) => void controller.selectStyle(style)} />
    <Dropdown label={ui.mastering} valueLabel={state.mastering?.name ?? ui.unselected} items={masteringItems} onSelect={(mastering) => void controller.selectMastering(mastering)} />
    <div className="suno-assistant__icon-group">
      <button type="button" className="suno-assistant__tag-button suno-assistant__tag-button--settings" aria-label={ui.clear} title={ui.clear} onClick={() => controller.clearStyleAndMastering()}>
        <TrashIcon />
      </button>
      <button type="button" className="suno-assistant__tag-button suno-assistant__tag-button--settings" aria-label={ui.aria.editMasterings} title={ui.aria.editMasterings} onClick={() => controller.openSettings('masterings')}>
        <GearIcon />
      </button>
    </div>
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
  ];
  return <div className="suno-assistant suno-assistant--presets" aria-label={ui.aria.presetSettings}>
    <Dropdown label={ui.preset} valueLabel={state.isCustomPreset ? ui.custom : state.preset?.name ?? ui.unselected} items={items} onSelect={(preset) => void controller.applyPreset(preset)} />
    <div className="suno-assistant__icon-group">
      <button type="button" className="suno-assistant__tag-button suno-assistant__tag-button--settings" aria-label={ui.savePreset} title={ui.savePreset} onClick={() => controller.openPresetCreation()}>
        <BookmarkIcon />
      </button>
      <button type="button" className="suno-assistant__tag-button suno-assistant__tag-button--settings" aria-label={ui.aria.editPresets} title={ui.aria.editPresets} onClick={() => controller.openSettings('presets')}>
        <GearIcon />
      </button>
    </div>
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
    <button type="button" className="suno-assistant__tag-button suno-assistant__tag-button--settings suno-assistant__settings-button" aria-label={ui.aria.editTitleFormat} title={ui.aria.editTitleFormat} onClick={() => controller.openSettings('titleFormat')}>
      <GearIcon />
    </button>
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
      onClick={() => controller.openSettings('display')}
    >
      <span aria-hidden="true" className="hxc-btn-overlay-slot hxc-btn-border" />
      <span className="hxc-btn-content">
        <GearIcon className="hxc-btn-icon" style={{ color: '#ea7a3b' }} />
        <span className="overflow-hidden whitespace-nowrap transition-opacity duration-200 group-data-[show-content=false]/sidebar:opacity-0">{ui.extensionSettings}</span>
      </span>
    </button>
  );
}

export function ReuseParamsButton({ controller, record }: { controller: SunoController; record: TakeRecord }) {
  const ui = getUiMessages();
  const [busy, setBusy] = useState(false);
  const [hovered, setHovered] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const summaryLines = optionFieldSummaryLines(record.options, ui);

  // A plain position:absolute popup gets clipped by the clip row's own
  // rounded-card `overflow: hidden` the moment it's near the top of a
  // scrolled workspace list. The Popover API (already used by Dropdown's
  // menu above) renders in the top layer instead, escaping every ancestor's
  // overflow/stacking context - anchored here to the button's viewport rect
  // via `bottom`/`right` (not `top`/`left`) so it grows upward-left from the
  // button without needing the popup's own (pre-show, unmeasurable) size.
  useLayoutEffect(() => {
    const popup = popupRef.current;
    const button = buttonRef.current;
    if (!popup || !button) return;
    if (!hovered) {
      if (popup.matches(':popover-open')) popup.hidePopover();
      return;
    }
    const positionPopup = () => {
      const rect = button.getBoundingClientRect();
      popup.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 8)}px`;
      popup.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    };
    positionPopup();
    if (!popup.matches(':popover-open')) popup.showPopover();
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);
    return () => {
      window.removeEventListener('resize', positionPopup);
      window.removeEventListener('scroll', positionPopup, true);
      if (popup.matches(':popover-open')) popup.hidePopover();
    };
  }, [hovered]);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await controller.reuseTake(record);
    } finally {
      setBusy(false);
    }
  };

  return (
    // Mounted shadow:false (Light DOM) alongside Suno's own clip-row action
    // buttons, so this popup can't rely on suno-ui.css - every style below
    // is inline.
    <>
      <button
        ref={buttonRef}
        type="button"
        data-suno-assistant="reuse-params-button"
        aria-label={ui.aria.reuseParameters}
        disabled={busy}
        className="hxc-btn-base hxc-btn-variant-tertiary-legacy hxc-btn-size-small hxc-btn-shape-pill hxc-btn-background hxc-btn-icon-only hxc-btn-square"
        style={{
          color: hovered ? '#f59e0b' : '#ea7a3b',
          backgroundColor: hovered ? 'rgb(234 122 59 / 22%)' : 'rgb(234 122 59 / 12%)',
          borderColor: hovered ? 'rgb(234 122 59 / 60%)' : 'rgb(234 122 59 / 35%)',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => void handleClick()}
      >
        <span aria-hidden="true" className="hxc-btn-overlay-slot hxc-btn-border" />
        <span className="hxc-btn-content">
          <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
          </svg>
        </span>
      </button>
      <div
        ref={popupRef}
        popover="manual"
        role="tooltip"
        style={{
          position: 'fixed',
          inset: 'auto',
          margin: 0,
          minWidth: 200,
          maxWidth: 320,
          padding: '10px 12px',
          borderRadius: 10,
          background: 'rgba(22, 20, 18, 0.97)',
          border: '1px solid rgba(234, 122, 59, 0.45)',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.35)',
          color: '#f5f5f6',
          fontSize: 12,
          lineHeight: 1.5,
          pointerEvents: 'none',
          whiteSpace: 'normal',
        }}
      >
        <div style={{ fontWeight: 600, color: '#ea7a3b', marginBottom: 4 }}>{ui.aria.reuseParameters}</div>
        {summaryLines.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {summaryLines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : (
          <div>{ui.dialog.noneOption}</div>
        )}
      </div>
    </>
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
          className="suno-assistant__tag-button suno-assistant__tag-button--settings suno-assistant__settings-button"
          aria-label={ui.aria.editLyricsTags}
          title={ui.aria.editLyricsTags}
          onClick={() => controller.openSettings('lyricsTags')}
        >
          <GearIcon />
        </button>
      </div>
    </div>
  );
}


