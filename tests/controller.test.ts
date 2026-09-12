import { describe, expect, it, vi } from 'vitest';
import type { OtherOptionsPreset } from '../src/domain/models';
import { type ControllerState, SunoController } from '../src/suno/controller';

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
});
