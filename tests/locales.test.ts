import { describe, expect, it } from 'vitest';
import {
  detectLanguage,
  getAllClearFormLabels,
  getAllClipRowLikeLabels,
  getAllClipRowShareLabels,
  getAllDestinationKeywords,
  getAllExcludedStylesPlaceholders,
  getAllOptionResetLabels,
  getAllSavedStyleDialogLabels,
  getAllSavedStyleMutationLabels,
  getAllSavedStyleSaveNewLabels,
  getAllSavedStyleTriggerLabels,
  getAllTitlePlaceholders,
  getHostLocale,
  getLocale,
  getRowLabels,
  getSliderLabels,
  getUiMessages,
  isSavedStyleDateString,
} from '../src/locales';

describe('locales module', () => {
  it('detects language from document element lang attribute', () => {
    const docJa = { documentElement: { lang: 'ja' } } as unknown as Document;
    expect(detectLanguage(docJa)).toBe('ja');

    const docJaJp = { documentElement: { lang: 'ja-JP' } } as unknown as Document;
    expect(detectLanguage(docJaJp)).toBe('ja');

    const docEn = { documentElement: { lang: 'en' } } as unknown as Document;
    expect(detectLanguage(docEn)).toBe('en');

    const docEnUs = { documentElement: { lang: 'en-US' } } as unknown as Document;
    expect(detectLanguage(docEnUs)).toBe('en');

    const docUnknown = { documentElement: { lang: 'fr' } } as unknown as Document;
    expect(detectLanguage(docUnknown)).toBe('ja');

    const docEmpty = { documentElement: { lang: '' } } as unknown as Document;
    expect(detectLanguage(docEmpty)).toBe('ja');
  });

  it('returns valid locale definitions for ja and en', () => {
    const ja = getLocale('ja');
    expect(ja.lang).toBe('ja');
    expect(ja.host.titlePlaceholders).toContain('曲名(任意)');
    expect(ja.ui.savePreset).toBe('設定を保存');

    const en = getLocale('en');
    expect(en.lang).toBe('en');
    expect(en.host.titlePlaceholders).toContain('Song Title (Optional)');
    expect(en.ui.savePreset).toBe('Save Preset');
  });

  it('getHostLocale and getUiMessages match the requested language', () => {
    expect(getHostLocale('en').rows.vocalGender.label).toBe('Vocal Gender');
    expect(getHostLocale('ja').rows.vocalGender.label).toBe('ボーカル性別');

    expect(getUiMessages('en').autoTitle).toBe('Auto Title');
    expect(getUiMessages('ja').autoTitle).toBe('自動設定');
  });

  it('aggregates all title placeholders, destination keywords, and reset labels', () => {
    const placeholders = getAllTitlePlaceholders();
    expect(placeholders).toContain('曲名(任意)');
    expect(placeholders).toContain('Song Title (Optional)');

    const destinations = getAllDestinationKeywords();
    expect(destinations).toContain('保存先…');
    expect(destinations).toContain('Save to...');

    const resetLabels = getAllOptionResetLabels();
    expect(resetLabels).toContain('すべてリセット');
    expect(resetLabels).toContain('Reset All');

    const excludedStylesPlaceholders = getAllExcludedStylesPlaceholders();
    expect(excludedStylesPlaceholders).toContain('スタイルを除外');
    expect(excludedStylesPlaceholders).toContain('Exclude styles');

    const triggerLabels = getAllSavedStyleTriggerLabels();
    expect(triggerLabels).toContain('保存したスタイルプロンプトを見る');
    expect(triggerLabels).toContain('View saved style prompts');

    const dialogLabels = getAllSavedStyleDialogLabels();
    expect(dialogLabels).toContain('保存したスタイル');
    expect(dialogLabels).toContain('Saved Styles');

    const mutationLabels = getAllSavedStyleMutationLabels();
    expect(mutationLabels).toContain('削除');
    expect(mutationLabels).toContain('Delete');
    expect(mutationLabels).toContain('名前を変更');
    expect(mutationLabels).toContain('Rename');

    const saveNewLabels = getAllSavedStyleSaveNewLabels();
    expect(saveNewLabels).toContain('プロンプトを保存');
    expect(saveNewLabels).toContain('Save prompt');

    const clearFormLabels = getAllClearFormLabels();
    expect(clearFormLabels).toContain('すべてのフォーム入力をクリア');
    expect(clearFormLabels).toContain('Clear all form inputs');

    const likeLabels = getAllClipRowLikeLabels();
    expect(likeLabels).toContain('クリップに「いいね」');
    expect(likeLabels).toContain('Like clip');

    const shareLabels = getAllClipRowShareLabels();
    expect(shareLabels).toContain('クリップを共有');
    expect(shareLabels).toContain('Share clip');
  });

  it('identifies saved style dates in multiple formats and languages', () => {
    expect(isSavedStyleDateString('2024-05-01')).toBe(true);
    expect(isSavedStyleDateString('2024/05/01')).toBe(true);
    expect(isSavedStyleDateString('2024年5月1日')).toBe(true);
    expect(isSavedStyleDateString('3日前')).toBe(true);
    expect(isSavedStyleDateString('保存日: 2024-01-01')).toBe(true);
    expect(isSavedStyleDateString('created 2 hours ago')).toBe(true);
    expect(isSavedStyleDateString('saved: 3 days ago')).toBe(true);
    expect(isSavedStyleDateString('yesterday')).toBe(true);
    expect(isSavedStyleDateString('5 minutes ago')).toBe(true);

    expect(isSavedStyleDateString('Romantic orchestral jazz ballad')).toBe(false);
    expect(isSavedStyleDateString('My favorite style')).toBe(false);
  });

  it('provides all slider and row labels for ja and en', () => {
    expect(getSliderLabels('weirdness')).toEqual(expect.arrayContaining(['奇抜さ', 'Weirdness']));
    expect(getSliderLabels('styleInfluence')).toEqual(expect.arrayContaining(['スタイルの影響', 'Style Influence']));
    expect(getSliderLabels('variation')).toEqual(expect.arrayContaining(['バリエーション', 'Variety']));
    expect(getSliderLabels('audioInfluence')).toEqual(expect.arrayContaining(['オーディオの影響', 'Audio Influence']));

    expect(getRowLabels('vocalGender')).toEqual(expect.arrayContaining(['ボーカル性別', 'Vocal Gender']));
    expect(getRowLabels('duration')).toEqual(expect.arrayContaining(['長さ', 'Duration']));
    expect(getRowLabels('maxMode')).toEqual(expect.arrayContaining(['Maxモード', 'Max Mode']));
    expect(getRowLabels('personalization')).toEqual(expect.arrayContaining(['パーソナライズ', 'Personalize']));
  });
});

