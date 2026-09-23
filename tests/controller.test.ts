// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyOtherOptions, type OtherOptionsKey, type OtherOptionsPreset, type TakeRecord } from '../src/domain/models';
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

  it('applies a custom style\'s saved Exclude but leaves an unsaved one alone', async () => {
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'setStylePrompt').mockReturnValue(true);
    const apply = vi.spyOn(controller.adapter, 'applyOtherOptions').mockResolvedValue({ applied: ['excludedStyles'], skipped: [] });

    await controller.selectStyle({ id: 'saved', name: 'Saved', prompt: 'quiet piano', excludedStyles: 'vocals' });
    expect(apply).toHaveBeenCalledWith({ excludedStyles: 'vocals' });

    apply.mockClear();
    await controller.selectStyle({ id: 'legacy', name: 'Legacy', prompt: 'soft strings' });
    expect(apply).not.toHaveBeenCalled();
  });

  it('defaults to display section when openSettings is called without arguments', () => {
    const controller = new SunoController();
    const current = watch(controller);

    controller.openSettings();

    expect(current().settings).toEqual({ section: 'display', action: undefined });
  });

  it('sets section to styles when openSettings("styles") is called', () => {
    const controller = new SunoController();
    const current = watch(controller);

    controller.openSettings('styles');

    expect(current().settings).toEqual({ section: 'styles', action: undefined });
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

  it('updates title with {{MODEL}}, {{MASTERING}}, and {{PRESET}} placeholders', async () => {
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'getDestinationName').mockReturnValue('My Workspace');
    vi.spyOn(controller.adapter, 'getModelName').mockReturnValue('v6');
    const setTitleSpy = vi.spyOn(controller.adapter, 'setTitle');

    await controller.setAutoTitle(true);
    await controller.selectStyle({ id: 's1', name: 'City Pop', prompt: '80s city pop' });
    await controller.selectMastering({ id: 'm1', name: 'Warm Analog', prompt: 'warm analog master', createdAt: '', updatedAt: '' });
    await controller.applyPreset({ id: 'p1', name: 'Female Vocal', fields: {}, createdAt: '', updatedAt: '' });

    await controller.saveTitleFormat('{{WORKSPACE}} - {{STYLE}} [{{MASTERING}}] ({{PRESET}}) {{MODEL}} {{TAKE:3}}');
    expect(setTitleSpy).toHaveBeenLastCalledWith('My Workspace - City Pop [Warm Analog] (Female Vocal) v6 {{TAKE:3}}');
  });
});

describe('SunoController style/mastering selection follows the Style text', () => {
  const cityPop = { id: 's1', name: 'City Pop', prompt: '80s city pop' };
  const jazz = { id: 's2', name: 'Jazz', prompt: 'smooth jazz' };
  const mastering = { id: 'm1', name: 'Warm', prompt: 'warm master', createdAt: '', updatedAt: '' };

  async function setup() {
    document.body.innerHTML = '<textarea id="style"></textarea>';
    const textarea = document.querySelector<HTMLTextAreaElement>('#style')!;
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'styleTextarea').mockReturnValue(textarea);
    vi.spyOn(controller.adapter, 'setStylePrompt').mockImplementation((value) => { textarea.value = value; return true; });
    vi.spyOn(controller.adapter, 'getStylePrompt').mockImplementation(() => textarea.value);
    const current = watch(controller);
    await controller.initialize();
    // initialize() recomputes state.styles from storage (customStyles) and
    // whatever Suno list has been fetched so far (empty here) - seed the
    // saved-style list for prompt matching only after that settles.
    (controller as unknown as { state: ControllerState }).state.styles = [cityPop, jazz];
    await controller.selectStyle(cityPop);
    await controller.selectMastering(mastering);
    return { controller, textarea, current };
  }

  // The controller defers its reaction to a keystroke by one tick (see
  // handleStyleInput), so wait for that before asserting.
  const type = async (textarea: HTMLTextAreaElement, value: string) => {
    textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('drops the mastering and goes custom when the user edits the text away from both', async () => {
    const { textarea, current } = await setup();
    await type(textarea, 'my own style');
    expect(current().style).toBeUndefined();
    expect(current().isCustomStyle).toBe(true);
    expect(current().mastering).toBeUndefined();
  });

  it('does not write the auto title synchronously inside the input event (it would revert the keystroke in Suno)', async () => {
    const { controller, textarea } = await setup();
    await controller.setAutoTitle(true);
    const setTitle = vi.spyOn(controller.adapter, 'setTitle');
    setTitle.mockClear();
    textarea.value = 'my own style\nwarm master';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(setTitle).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setTitle).toHaveBeenCalled();
  });

  it('keeps the mastering while only the style part is edited', async () => {
    const { textarea, current } = await setup();
    await type(textarea, 'my own style\nwarm master');
    expect(current().isCustomStyle).toBe(true);
    expect(current().mastering?.id).toBe('m1');
  });

  it('inserts musical settings before the mastering suffix', async () => {
    const { controller, textarea, current } = await setup();
    controller.applyMusicalSettings({ key: 'C Major', tempo: 160, timeSignature: '4/4' });
    expect(textarea.value).toBe('80s city pop\nMusical settings: Key: C Major; Tempo: 160 BPM; Time signature: 4/4.\nwarm master');
    expect(current().mastering?.id).toBe('m1');
    expect(current().isCustomStyle).toBe(false);
  });

  it('carries detected musical settings into a newly selected saved style', async () => {
    const { controller, textarea, current } = await setup();
    await type(textarea, 'The piece is in the key of C Major with a tempo of 160 BPM in 4/4 time.\nwarm master');
    await controller.selectStyle(jazz);
    expect(textarea.value).toBe('smooth jazz\nMusical settings: Key: C Major; Tempo: 160 BPM; Time signature: 4/4.\nwarm master');
    expect(current().style?.id).toBe('s2');
    expect(current().isCustomStyle).toBe(false);
    expect(current().musicalSettings).toMatchObject({ key: 'C Major', tempo: 160, timeSignature: '4/4', conflicts: [] });
  });

  it('adopts explicit musical settings from the newly selected saved style', async () => {
    const { controller, textarea, current } = await setup();
    await type(textarea, 'The piece is in the key of C Major with a tempo of 160 BPM in 4/4 time.\nwarm master');
    const sourceStyle = { id: 's3', name: 'Source style', prompt: 'orchestral rock, key of D Minor, tempo of 92 BPM in 3/4 time' };
    (controller as unknown as { state: ControllerState }).state.styles.push(sourceStyle);
    await controller.selectStyle(sourceStyle);
    // The style already states all three, so it is written as-is: no managed line.
    expect(textarea.value).toBe('orchestral rock, key of D Minor, tempo of 92 BPM in 3/4 time\nwarm master');
    expect(current().musicalSettings).toMatchObject({ key: 'D Minor', tempo: 92, timeSignature: '3/4', conflicts: [] });
  });

  it('adds to a newly selected saved style only the fields it does not state', async () => {
    const { controller, textarea } = await setup();
    await type(textarea, 'The piece is in the key of C Major at 160 BPM.\nwarm master');
    const tempoOnly = { id: 's3', name: 'Tempo only', prompt: 'dance pop, tempo of 120 BPM' };
    (controller as unknown as { state: ControllerState }).state.styles.push(tempoOnly);
    await controller.selectStyle(tempoOnly);
    expect(textarea.value).toBe('dance pop, tempo of 120 BPM\nMusical settings: Key: C Major.\nwarm master');
  });

  it('leaves a field the newly selected saved style states ambiguously untouched', async () => {
    const { controller, textarea, current } = await setup();
    await type(textarea, 'The piece is in the key of C Major.\nwarm master');
    const ambiguous = { id: 's3', name: 'Ambiguous', prompt: 'lofi, key of A Minor, key of B Minor' };
    (controller as unknown as { state: ControllerState }).state.styles.push(ambiguous);
    await controller.selectStyle(ambiguous);
    expect(textarea.value).toBe('lofi, key of A Minor, key of B Minor\nwarm master');
    expect(current().musicalSettings.conflicts).toEqual(['key']);
  });

  describe('musical settings dropdown changes', () => {
    const keyed = { id: 's3', name: 'Keyed', prompt: 'orchestral rock, key of D Minor, tempo of 92 BPM' };

    async function setupKeyed() {
      const context = await setup();
      (context.controller as unknown as { state: ControllerState }).state.styles.push(keyed);
      await context.controller.selectStyle(keyed);
      return context;
    }

    it('rewrites the phrases the Style states, keeping the style, the mastering, and the final line', async () => {
      const { controller, textarea, current } = await setupKeyed();
      controller.applyMusicalSettings({ key: 'F Minor', tempo: 92 });
      expect(textarea.value).toBe('orchestral rock, key of F Minor, tempo of 92 BPM\nwarm master');
      expect(current().style?.id).toBe('s3');
      expect(current().isCustomStyle).toBe(false);
      expect(current().mastering?.id).toBe('m1');
      expect(current().musicalSettings).toMatchObject({ key: 'F Minor', tempo: 92, conflicts: [] });
    });

    it('adds a field the Style never stated to the managed line, leaving the stated phrases in place', async () => {
      const { controller, textarea, current } = await setupKeyed();
      controller.applyMusicalSettings({ key: 'F Minor', tempo: 92, timeSignature: '4/4' });
      expect(textarea.value).toBe('orchestral rock, key of F Minor, tempo of 92 BPM\nMusical settings: Time signature: 4/4.\nwarm master');
      expect(current().style?.id).toBe('s3');
      expect(current().musicalSettings).toMatchObject({ key: 'F Minor', tempo: 92, timeSignature: '4/4', conflicts: [] });
    });

    it('builds the managed line one dropdown at a time when the Style states nothing', async () => {
      const { controller, textarea, current } = await setup();
      controller.applyMusicalSettings({ key: 'C Major' });
      expect(textarea.value).toBe('80s city pop\nMusical settings: Key: C Major.\nwarm master');
      controller.applyMusicalSettings({ key: 'C Major', tempo: 160 });
      expect(textarea.value).toBe('80s city pop\nMusical settings: Key: C Major; Tempo: 160 BPM.\nwarm master');
      expect(current().style?.id).toBe('s1');
      expect(current().isCustomStyle).toBe(false);
    });

    it('keeps the mastering as the only, final line when the Style is unselected', async () => {
      const { controller, textarea, current } = await setup();
      await controller.selectStyle(undefined);
      expect(textarea.value).toBe('warm master');
      controller.applyMusicalSettings({ key: 'C Major' });
      expect(textarea.value).toBe('Musical settings: Key: C Major.\nwarm master');
      expect(current().mastering?.id).toBe('m1');
    });

    it('keeps the Style\'s leading and internal whitespace when the managed line is first added', async () => {
      const { controller, textarea, current } = await setup();
      await type(textarea, '  my style\n\n\nsecond line\nwarm master');
      controller.applyMusicalSettings({ key: 'C Major' });
      expect(textarea.value).toBe('  my style\n\n\nsecond line\nMusical settings: Key: C Major.\nwarm master');
      expect(current().mastering?.id).toBe('m1');
    });

    it('does not write while a Create submission is running', async () => {
      const { controller, textarea } = await setup();
      (controller as unknown as { isExecutingCreate: boolean }).isExecutingCreate = true;
      controller.applyMusicalSettings({ key: 'C Major' });
      expect(textarea.value).toBe('80s city pop\nwarm master');
    });

    it('never deletes prose when a dropdown is cleared', async () => {
      const { controller, textarea } = await setupKeyed();
      controller.applyMusicalSettings({});
      expect(textarea.value).toBe('orchestral rock, key of D Minor, tempo of 92 BPM\nwarm master');
    });

    it('edits the managed line: a changed field is rewritten, a cleared one is dropped', async () => {
      const { controller, textarea } = await setup();
      await type(textarea, 'moody\nMusical settings: Key: C Major; Tempo: 100 BPM.\nwarm master');
      controller.applyMusicalSettings({ key: 'A Minor' });
      expect(textarea.value).toBe('moody\nMusical settings: Key: A Minor.\nwarm master');
      controller.applyMusicalSettings({});
      expect(textarea.value).toBe('moody\nwarm master');
    });

    it('does not touch a Style whose textarea is not mounted (that would open the disclosure)', async () => {
      const { controller, textarea } = await setupKeyed();
      vi.mocked(controller.adapter.styleTextarea).mockReturnValue(undefined);
      const setStylePrompt = vi.spyOn(controller.adapter, 'setStylePrompt');
      setStylePrompt.mockClear();
      controller.applyMusicalSettings({ key: 'F Minor', tempo: 92 });
      expect(setStylePrompt).not.toHaveBeenCalled();
      expect(textarea.value).toBe('orchestral rock, key of D Minor, tempo of 92 BPM\nwarm master');
    });
  });

  it('walks through style edit -> undo and mastering edit -> undo', async () => {
    const { textarea, current } = await setup();
    const original = textarea.value; // "80s city pop\nwarm master"

    await type(textarea, '80s city pop X\nwarm master');
    expect(current().isCustomStyle).toBe(true);
    expect(current().mastering?.id).toBe('m1');
    await type(textarea, original);
    expect(current().style?.id).toBe('s1');
    expect(current().isCustomStyle).toBe(false);

    await type(textarea, '80s city pop\nwarm masterX');
    expect(current().style?.id).toBe('s1');
    expect(current().isCustomStyle).toBe(false);
    expect(current().mastering).toBeUndefined();
    await type(textarea, original);
    expect(current().style?.id).toBe('s1');
    expect(current().mastering?.id).toBe('m1');
  });

  it('returns to unselected, not custom, when the field is emptied', async () => {
    const { textarea, current } = await setup();
    await type(textarea, '');
    expect(current().isCustomStyle).toBe(false);
    expect(current().style).toBeUndefined();
    expect(current().mastering).toBeUndefined();
  });

  it('notices a text change that fires no input event (reuse prompt) on reconcile and adopts the matching style', async () => {
    const { controller, textarea, current } = await setup();
    controller.reconcile(); // baseline
    textarea.value = 'smooth jazz';
    controller.reconcile();
    expect(current().style?.id).toBe('s2');
    expect(current().isCustomStyle).toBe(false);
    expect(current().mastering).toBeUndefined();
  });

  it('does not touch the selection on reconcile when the text is unchanged or has no textarea', async () => {
    const { controller, current } = await setup();
    controller.reconcile();
    controller.reconcile();
    expect(current().style?.id).toBe('s1');
    expect(current().mastering?.id).toBe('m1');
    vi.spyOn(controller.adapter, 'styleTextarea').mockReturnValue(undefined);
    controller.reconcile();
    expect(current().style?.id).toBe('s1');
  });
});

describe('SunoController custom style list and styleSource', () => {
  beforeEach(() => {
    for (const key of Object.keys(storageMock)) delete storageMock[key];
  });

  it('never opens Suno\'s native saved-styles dialog while styleSource is custom', async () => {
    storageMock.sunoCreateAssistant = {
      schemaVersion: 2, masteringPrompts: [], optionPresets: [], autoTitleEnabled: false,
      takeHistory: [], customStyles: [{ id: 'c1', name: 'Lo-fi', prompt: 'lofi chill', createdAt: '', updatedAt: '' }],
      styleSource: 'custom',
    };
    const controller = new SunoController();
    const extractSpy = vi.spyOn(controller.adapter, 'extractSavedStyles');
    const current = watch(controller);

    await controller.initialize();
    await controller.refreshStyles();

    expect(extractSpy).not.toHaveBeenCalled();
    expect(current().styles).toEqual([{ id: 'c1', name: 'Lo-fi', prompt: 'lofi chill' }]);
  });

  it('merges custom styles ahead of Suno styles when styleSource is merged (the default)', async () => {
    storageMock.sunoCreateAssistant = {
      schemaVersion: 2, masteringPrompts: [], optionPresets: [], autoTitleEnabled: false,
      takeHistory: [], customStyles: [{ id: 'c1', name: 'Lo-fi', prompt: 'lofi chill', createdAt: '', updatedAt: '' }],
    };
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'extractSavedStyles').mockResolvedValue([{ id: 's1', name: 'City Pop', prompt: '80s city pop' }]);
    const current = watch(controller);

    await controller.initialize();
    await controller.refreshStyles();

    expect(current().styles.map((s) => s.name)).toEqual(['Lo-fi', 'City Pop']);
  });

  it('deselects a custom style that is removed from storage, without touching the Style text', async () => {
    storageMock.sunoCreateAssistant = {
      schemaVersion: 2, masteringPrompts: [], optionPresets: [], autoTitleEnabled: false,
      takeHistory: [], customStyles: [{ id: 'c1', name: 'Lo-fi', prompt: 'lofi chill', createdAt: '', updatedAt: '' }],
      styleSource: 'custom',
    };
    const controller = new SunoController();
    const current = watch(controller);
    await controller.initialize();
    await controller.refreshStyles();
    await controller.selectStyle(current().styles[0]);
    expect(current().style?.id).toBe('c1');

    // Simulate the settings dialog deleting the style: storage changes out
    // from under the controller and its onChanged listener fires. The
    // registered handler is subscribeStorage()'s (changes, area) wrapper,
    // not the controller's raw callback - it only re-reads on a 'local'
    // change to our own key (see repository.ts's subscribeStorage()).
    storageMock.sunoCreateAssistant = { ...(storageMock.sunoCreateAssistant as object), customStyles: [] };
    const [handler] = (globalThis.chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mock.calls.at(-1) ?? [];
    // The registered handler is subscribeStorage()'s synchronous (changes,
    // area) wrapper; it fires the controller's async listener without
    // awaiting it, so give that listener's readStorage()/emit() a tick to
    // finish before asserting.
    handler?.({ sunoCreateAssistant: {} }, 'local');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(current().style).toBeUndefined();
    expect(current().isCustomStyle).toBe(true);
  });
});

describe('SunoController preset selection follows the live option values', () => {
  const female: OtherOptionsPreset = { id: 'p1', name: 'Female', fields: { vocalGender: 'female', weirdness: 70 }, createdAt: '', updatedAt: '' };
  const capture = (overrides: Partial<ReturnType<typeof emptyOtherOptions>> = {}, unreadable: OtherOptionsKey[] = []) => ({
    snapshot: { ...emptyOtherOptions(), vocalGender: 'female' as const, weirdness: 70, ...overrides },
    unreadable,
  });

  async function setup(skipped: OtherOptionsKey[] = []) {
    const controller = new SunoController();
    vi.spyOn(controller.adapter, 'applyOtherOptions').mockResolvedValue({ applied: [], skipped });
    const peek = vi.spyOn(controller.adapter, 'peekOtherOptions').mockReturnValue(capture());
    const current = watch(controller);
    await controller.applyPreset(female);
    return { controller, peek, current };
  }

  it('keeps the preset while the values still match', async () => {
    const { controller, current } = await setup();
    controller.reconcile();
    expect(current().preset?.id).toBe('p1');
    expect(current().isCustomPreset).toBe(false);
  });

  it('turns into カスタム when a value is changed by hand, and comes back when restored', async () => {
    const { controller, peek, current } = await setup();
    peek.mockReturnValue(capture({ weirdness: 55 }));
    controller.reconcile();
    expect(current().preset).toBeUndefined();
    expect(current().isCustomPreset).toBe(true);

    peek.mockReturnValue(capture());
    controller.reconcile();
    expect(current().preset?.id).toBe('p1');
    expect(current().isCustomPreset).toBe(false);
  });

  it('ignores fields the preset could not apply, and does nothing while the controls are hidden', async () => {
    const { controller, peek, current } = await setup(['weirdness']);
    peek.mockReturnValue(capture({ weirdness: 12 }));
    controller.reconcile();
    expect(current().preset?.id).toBe('p1');

    peek.mockReturnValue(undefined);
    controller.reconcile();
    expect(current().preset?.id).toBe('p1');
  });

  it('does not react while options are being applied, and leaves a never-selected preset alone', async () => {
    const controller = new SunoController();
    let release!: () => void;
    vi.spyOn(controller.adapter, 'applyOtherOptions').mockReturnValue(new Promise((resolve) => {
      release = () => resolve({ applied: [], skipped: [] });
    }));
    const peek = vi.spyOn(controller.adapter, 'peekOtherOptions').mockReturnValue(capture({ weirdness: 1 }));
    const current = watch(controller);

    controller.reconcile();
    expect(current().isCustomPreset).toBe(false); // nothing selected yet

    const applying = controller.applyPreset(female);
    controller.reconcile(); // mid-apply values do not match yet
    expect(current().preset?.id).toBe('p1');
    expect(current().isCustomPreset).toBe(false);
    peek.mockReturnValue(capture());
    release();
    await applying;
    controller.reconcile();
    expect(current().preset?.id).toBe('p1');
  });

  it('records no preset in the title while custom', async () => {
    const { controller, peek } = await setup();
    vi.spyOn(controller.adapter, 'getDestinationName').mockReturnValue('WS');
    const setTitle = vi.spyOn(controller.adapter, 'setTitle');
    await controller.setAutoTitle(true);
    await controller.saveTitleFormat('{{WORKSPACE}} [{{PRESET}}]');
    expect(setTitle).toHaveBeenLastCalledWith('WS [Female]');
    peek.mockReturnValue(capture({ weirdness: 3 }));
    controller.reconcile();
    expect(setTitle).toHaveBeenLastCalledWith('WS [カスタム]');
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

  it('records the submitted parameters when a zero-padded {{TAKE:3}} placeholder is used', async () => {
    const controller = new SunoController();
    mockAdapterForCreate(controller, 'Workspace (ARIA) {{TAKE:3}}');

    const created = await controller.executeCreateWithTake();
    expect(created).toBe(true);

    const stored = await readStorage();
    expect(stored.takeHistory).toHaveLength(1);
    const record = stored.takeHistory[0]!;
    expect(record.title).toBe('Workspace (ARIA) 001');
    expect(record.takeKey).toBe('Workspace (ARIA)');
    expect(record.takeNumber).toBe(1);
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
  it('captures a trusted Create pointerdown before Suno can submit, while allowing the extension synthetic activation', () => {
    const controller = new SunoController();
    const createButton = document.createElement('button');
    document.body.appendChild(createButton);
    vi.spyOn(controller.adapter, 'isCreateButton').mockReturnValue(true);
    const execute = vi.spyOn(controller, 'executeCreateWithTake').mockResolvedValue(true);
    const trustedEvent = {
      target: createButton,
      isTrusted: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as PointerEvent;

    controller['handleDocumentPointerDown'](trustedEvent);

    expect(execute).toHaveBeenCalledOnce();
    expect(trustedEvent.preventDefault).toHaveBeenCalledOnce();
    expect(trustedEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(trustedEvent.stopImmediatePropagation).toHaveBeenCalledOnce();

    // The rest of the original trusted gesture must not submit a second time.
    controller['isExecutingCreate'] = true;
    const trailingUserClick = {
      target: createButton,
      isTrusted: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    controller['handleDocumentClick'](trailingUserClick);
    expect(trailingUserClick.preventDefault).toHaveBeenCalledOnce();

    // triggerCreate() dispatches untrusted events; this is the one activation
    // that must reach Suno after the take number and history snapshot are ready.
    const syntheticClick = {
      target: createButton,
      isTrusted: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    controller['handleDocumentClick'](syntheticClick);
    expect(syntheticClick.preventDefault).not.toHaveBeenCalled();

    document.body.removeChild(createButton);
  });

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
