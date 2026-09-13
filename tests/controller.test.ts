// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyOtherOptions, type OtherOptionsPreset, type TakeRecord } from '../src/domain/models';
import { type ControllerState, SunoController } from '../src/suno/controller';
import { readStorage } from '../src/storage/repository';

const storageMock: Record<string, unknown> = {};
globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: storageMock[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(storageMock, items); }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
} as unknown as typeof chrome;

beforeEach(() => {
  for (const key of Object.keys(storageMock)) delete storageMock[key];
});

const preset: OtherOptionsPreset = {
  id: 'preset-1', name: '標準', fields: {}, createdAt: '', updatedAt: '',
};

function watch(controller: SunoController) {
  let current: ControllerState;
  controller.subscribe((state) => { current = state; });
  return () => current;
}

describe('SunoController feedback scopes', () => {
  it('keeps preset feedback clear on success and out of other scopes', async () => {
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'applyOtherOptions').mockResolvedValue({ applied: [], skipped: [] });
    const current = watch(controller);

    await controller.applyPreset(preset);

    const state = current();
    expect(state.presetFeedback).toBeUndefined();
    expect(state.styleFeedback).toBeUndefined();
    expect(state.settingsFeedback).toBeUndefined();
  });

  it('reports skipped preset items when applyOtherOptions reports unapplied fields', async () => {
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'applyOtherOptions').mockResolvedValue({ applied: [], skipped: ['vocalGender'] });
    const current = watch(controller);

    await controller.applyPreset(preset);

    const state = current();
    expect(state.presetFeedback).toEqual({
      kind: 'notice',
      message: '適用できなかった項目: ボーカル性別',
    });
  });

  it('keeps feedback from style loading and settings capture in their own scopes', async () => {
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'extractSavedStyles').mockRejectedValue(new Error('スタイルを取得できませんでした。'));
    vi.spyOn(controller.adapter, 'readOtherOptions').mockResolvedValue(undefined);
    const current = watch(controller);

    await controller.refreshStyles();
    let state = current();
    expect(state.styleFeedback).toEqual({ kind: 'error', message: 'スタイルを取得できませんでした。' });
    expect(state.presetFeedback).toBeUndefined();
    expect(state.settingsFeedback).toBeUndefined();

    await controller.captureOptions();
    state = controller['state'];
    expect(state.settingsFeedback?.kind).toBe('error');
    expect(state.styleFeedback?.message).toBe('スタイルを取得できませんでした。');
    expect(state.presetFeedback).toBeUndefined();
  });

  it('reports a preset-application failure only in the preset scope', async () => {
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'applyOtherOptions').mockRejectedValue(new Error('適用に失敗しました。'));
    const current = watch(controller);

    await controller.applyPreset(preset);

    const state = current();
    expect(state.presetFeedback).toEqual({ kind: 'error', message: '適用に失敗しました。' });
    expect(state.styleFeedback).toBeUndefined();
    expect(state.settingsFeedback).toBeUndefined();
  });

  it('sets section to presets and action to create-preset when openPresetCreation is called', () => {
    const controller = new SunoController();
    const current = watch(controller);

    controller.openPresetCreation();

    expect(current().settings).toEqual({ section: 'presets', action: 'create-preset' });
  });

  it('defaults to titleFormat section when openSettings is called without arguments', () => {
    const controller = new SunoController();
    const current = watch(controller);

    controller.openSettings();

    expect(current().settings).toEqual({ section: 'titleFormat', action: undefined });
  });
});

describe('SunoController executeCreateWithTake and title format', () => {
  it('increments take number, sets substituted title, submits, and reverts to template', async () => {
    const controller = new SunoController();
    const titlesSet: string[] = [];
    vi.spyOn(controller.adapter, 'getCreateButton').mockReturnValue(document.createElement('button'));
    vi.spyOn(controller.adapter, 'getTitle').mockReturnValue('Workspace (ARIA) {{TAKE}}');
    vi.spyOn(controller.adapter, 'setTitle').mockImplementation((value) => {
      titlesSet.push(value);
      return true;
    });
    vi.spyOn(controller.adapter, 'triggerCreate').mockReturnValue(true);

    const result = await controller.executeCreateWithTake();
    expect(result).toBe(true);
    expect(titlesSet).toEqual([
      'Workspace (ARIA) 1',
      'Workspace (ARIA) {{TAKE}}',
    ]);
  });

  it('submits directly without changing title if no take placeholder exists', async () => {
    const controller = new SunoController();
    const titlesSet: string[] = [];
    vi.spyOn(controller.adapter, 'getCreateButton').mockReturnValue(document.createElement('button'));
    vi.spyOn(controller.adapter, 'getTitle').mockReturnValue('Custom Song Title');
    vi.spyOn(controller.adapter, 'setTitle').mockImplementation((value) => {
      titlesSet.push(value);
      return true;
    });
    const triggerSpy = vi.spyOn(controller.adapter, 'triggerCreate').mockReturnValue(true);

    const result = await controller.executeCreateWithTake();
    expect(result).toBe(true);
    expect(triggerSpy).toHaveBeenCalled();
    expect(titlesSet).toHaveLength(0);
  });

  it('returns false if no active create button is found', async () => {
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'getCreateButton').mockReturnValue(undefined);

    const result = await controller.executeCreateWithTake();
    expect(result).toBe(false);
  });

  it('saves and updates title format', async () => {
    const controller = new SunoController();
    const current = watch(controller);
    await controller.saveTitleFormat('{{WORKSPACE}} - {{STYLE}} #{{TAKE}}');
    expect(current().titleFormat).toBe('{{WORKSPACE}} - {{STYLE}} #{{TAKE}}');
  });

  it('updates title with {{AUDIO}} placeholder when audio is present', async () => {
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'getDestinationName').mockReturnValue('My Workspace');
    vi.spyOn(controller.adapter, 'getAudioTitle').mockReturnValue('ドラゴンクエストII');
    const setTitleSpy = vi.spyOn(controller.adapter, 'setTitle');

    await controller.setAutoTitle(true);
    await controller.selectStyle({ id: 's1', name: 'Orchestral', prompt: 'epic orchestral' });

    // With default format, workspace is used
    expect(setTitleSpy).toHaveBeenLastCalledWith('My Workspace (Orchestral) {{TAKE}}');

    // With {{AUDIO}} format, audio title is used
    await controller.saveTitleFormat('{{AUDIO}} ({{STYLE}}) {{TAKE}}');
    expect(setTitleSpy).toHaveBeenLastCalledWith('ドラゴンクエストII (Orchestral) {{TAKE}}');
  });
});

describe('SunoController take history recording', () => {
  function mockAdapterForCreate(controller: SunoController, title: string) {
    vi.spyOn(controller.adapter, 'getCreateButton').mockReturnValue(document.createElement('button'));
    vi.spyOn(controller.adapter, 'getTitle').mockReturnValue(title);
    vi.spyOn(controller.adapter, 'setTitle').mockReturnValue(true);
    vi.spyOn(controller.adapter, 'triggerCreate').mockReturnValue(true);
    vi.spyOn(controller.adapter, 'readOtherOptions').mockResolvedValue({
      snapshot: { ...emptyOtherOptions(), weirdness: 70, styleInfluence: 80 },
      unreadable: ['audioInfluence'],
    });
    vi.spyOn(controller.adapter, 'getStylePrompt').mockReturnValue('lofi chill synths');
    vi.spyOn(controller.adapter, 'getModelName').mockReturnValue('v6');
  }

  it('records the submitted parameters when the {{TAKE}} placeholder is used', async () => {
    const controller = new SunoController();
    mockAdapterForCreate(controller, 'Workspace (ARIA) {{TAKE}}');

    const created = await controller.executeCreateWithTake();
    expect(created).toBe(true);

    const stored = await readStorage();
    expect(stored.takeHistory).toHaveLength(1);
    const record = stored.takeHistory[0]!;
    expect(record.title).toBe('Workspace (ARIA) 1');
    expect(record.takeKey).toBe('Workspace (ARIA)');
    expect(record.takeNumber).toBe(1);
    expect(record.stylePrompt).toBe('lofi chill synths');
    expect(record.model).toBe('v6');
    expect(record.options).toEqual({
      excludedStyles: '', vocalGender: 'none', duration: { mode: 'auto' }, maxMode: false,
      weirdness: 70, styleInfluence: 80, variation: 0, personalization: { enabled: false },
    });
    expect(record.unreadable).toEqual(['audioInfluence']);
    expect(record.clipIds).toEqual([]);
  });

  it('also records a history entry when there is no {{TAKE}} placeholder', async () => {
    const controller = new SunoController();
    mockAdapterForCreate(controller, 'Custom Song Title');

    await controller.executeCreateWithTake();

    const stored = await readStorage();
    expect(stored.takeHistory).toHaveLength(1);
    expect(stored.takeHistory[0]!.title).toBe('Custom Song Title');
    expect(stored.takeHistory[0]!.takeNumber).toBeUndefined();
  });

  it('does not record anything when triggerCreate reports failure', async () => {
    const controller = new SunoController();
    mockAdapterForCreate(controller, 'Custom Song Title');
    vi.spyOn(controller.adapter, 'triggerCreate').mockReturnValue(false);

    await controller.executeCreateWithTake();

    const stored = await readStorage();
    expect(stored.takeHistory).toEqual([]);
  });

  it('does not record anything when no create button can be found', async () => {
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'getCreateButton').mockReturnValue(undefined);

    await controller.executeCreateWithTake();

    const stored = await readStorage();
    expect(stored.takeHistory).toEqual([]);
  });
});

describe('SunoController.reuseTake', () => {
  it('applies only the recorded More Options, leaving the Style field untouched', async () => {
    const controller = new SunoController();
    const applySpy = vi.spyOn(controller.adapter, 'applyOtherOptions').mockResolvedValue({ applied: ['weirdness'], skipped: [] });
    const setStyleSpy = vi.spyOn(controller.adapter, 'setStylePrompt');

    const record: TakeRecord = {
      id: 't1', createdAt: '2024-01-01T00:00:00.000Z', title: 'x',
      stylePrompt: 'should not be written back to Suno',
      options: { weirdness: 70 }, unreadable: [], clipIds: [],
    };

    const result = await controller.reuseTake(record);

    expect(applySpy).toHaveBeenCalledWith({ weirdness: 70 });
    expect(setStyleSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ applied: ['weirdness'], skipped: [] });
  });

  it('returns undefined instead of throwing when applyOtherOptions rejects', async () => {
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'applyOtherOptions').mockRejectedValue(new Error('boom'));

    const record: TakeRecord = {
      id: 't1', createdAt: '', title: 'x', stylePrompt: '', options: {}, unreadable: [], clipIds: [],
    };
    const result = await controller.reuseTake(record);
    expect(result).toBeUndefined();
  });
});

describe('SunoController closeDisclosuresOnAdvanced', () => {
  it('updates state and storage when setCloseDisclosuresOnAdvanced is called', async () => {
    const controller = new SunoController();
    const current = watch(controller);

    await controller.setCloseDisclosuresOnAdvanced(false);
    expect(current().closeDisclosuresOnAdvanced).toBe(false);

    await controller.setCloseDisclosuresOnAdvanced(true);
    expect(current().closeDisclosuresOnAdvanced).toBe(true);
  });

  it('triggers closeDisclosures when enabled and advanced tab is active', async () => {
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'isAdvancedTab').mockReturnValue(true);
    const closeSpy = vi.spyOn(controller.adapter, 'closeDisclosures').mockReturnValue({
      closedLyrics: true, closedStyle: true, closedOptions: true,
    });

    await controller.setCloseDisclosuresOnAdvanced(true);
    expect(closeSpy).toHaveBeenCalled();
  });
});

describe('SunoController handleDocumentClick localization', () => {
  it('marks styles dirty when an English "Delete" saved-style action is clicked, not only the Japanese label', async () => {
    const controller = new SunoController();
    await controller.initialize();
    const current = watch(controller);
    expect(current().stylesDirty).toBe(true);
    // Simulate a fresh, already-refreshed list so the dirty flag change is observable.
    controller['state'].stylesDirty = false;

    const button = document.createElement('button');
    button.setAttribute('aria-label', 'Delete: My Style');
    document.body.appendChild(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(current().stylesDirty).toBe(true);
    document.body.removeChild(button);
    controller.dispose();
  });

  it('resets extension selections when the English "Clear all form inputs" button is clicked', async () => {
    const controller = new SunoController();
    await controller.initialize();
    const resetSpy = vi.spyOn(controller, 'resetExtensionSelections');

    const button = document.createElement('button');
    button.setAttribute('aria-label', 'Clear all form inputs');
    document.body.appendChild(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resetSpy).toHaveBeenCalled();

    document.body.removeChild(button);
    controller.dispose();
  });
});

describe('SunoController lyricsTags', () => {
  it('initializes with default tags and saves new tags', async () => {
    const controller = new SunoController();
    const current = watch(controller);
    await controller.initialize();

    expect(current().lyricsTags.length).toBeGreaterThan(0);
    expect(current().lyricsTags).toContain('[Verse 1]');

    const newTags = ['[Intro]', '[Outro]'];
    await controller.saveLyricsTags(newTags);
    expect(current().lyricsTags).toEqual(newTags);
  });

  it('delegates insertLyricsTag to adapter', async () => {
    const controller = new SunoController();
    const insertSpy = vi.spyOn(controller.adapter, 'insertLyricsTag').mockResolvedValue(true);

    const res = await controller.insertLyricsTag('[Chorus]');
    expect(res).toBe(true);
    expect(insertSpy).toHaveBeenCalledWith('[Chorus]');
  });
});

