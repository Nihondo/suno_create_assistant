import type { OtherOptionsKey } from '../domain/models';

export type SupportedLanguage = 'ja' | 'en';

export interface SunoHostRowVocalGender {
  label: string;
  male: string;
  female: string;
}

export interface SunoHostRowDuration {
  label: string;
  custom: string;
  auto: string;
}

export interface SunoHostRowMaxMode {
  label: string;
  on: string;
  off: string;
}

export interface SunoHostRowPersonalization {
  label: string;
  on: string;
  off: string;
  myTaste: string;
}

export interface SunoHostSliders {
  weirdness: string;
  styleInfluence: string;
  variation: string;
  audioInfluence: string;
}

export interface SunoHostSavedStyles {
  triggerAriaLabels: string[];
  dialogAriaLabels: string[];
  excludedActionRegex: RegExp;
  dateRegex: RegExp;
}

export interface SunoHostLocale {
  lang: SupportedLanguage;
  titlePlaceholders: string[];
  destinationKeywords: string[];
  optionHeadingRegex: RegExp;
  optionResetLabels: string[];
  excludedStylesPlaceholders: string[];
  sliders: SunoHostSliders;
  rows: {
    vocalGender: SunoHostRowVocalGender;
    duration: SunoHostRowDuration;
    maxMode: SunoHostRowMaxMode;
    personalization: SunoHostRowPersonalization;
  };
  savedStyles: SunoHostSavedStyles;
  lyricsHeadings: string[];
  lyricsPlaceholders: string[];
  styleHeadings: string[];
}

export interface UiMessages {
  unselected: string;
  manage: string;
  managePresets: string;
  loading: string;
  custom: string;
  clear: string;
  savePreset: string;
  autoTitle: string;
  extensionSettings: string;
  style: string;
  mastering: string;
  preset: string;
  aria: {
    styleSettings: string;
    presetSettings: string;
    titleFormatInput: string;
    lyricsTagPalette: string;
    editLyricsTags: string;
  };
  dialog: {
    title: string;
    close: string;
    cancel: string;
    save: string;
    edit: string;
    delete: string;
    add: string;
    notRegisteredYet: string;
    titleFormatHeading: string;
    titleFormatHint: string;
    resetDefault: string;
    saveFormat: string;
    savedNotice: string;
    displayHeading: string;
    closeDisclosuresLabel: string;
    closeDisclosuresHint: string;
    lyricsTagsHeading: string;
    lyricsTagsHint: string;
    saveLyricsTags: string;
    lyricsTagsSavedNotice: string;
    masteringHeading: string;
    masteringHint: string;
    masteringName: string;
    masteringPrompt: string;
    presetHeading: string;
    presetHint: string;
    presetName: string;
    presetFieldsLegend: string;
    allFields: string;
    excludeStylesLabel: string;
    noneOption: string;
    maleOption: string;
    femaleOption: string;
    secondsLabel: string;
    maxModeToggle: string;
    personalizationToggle: string;
  };
  optionLabels: Record<OtherOptionsKey, string>;
  feedback: {
    noSavedStyles: string;
    failedUpdateStyles: string;
    cannotOpenSavedStyles: string;
    skippedItemsPrefix: string;
    failedApplyPreset: string;
    optionsNotFound: string;
    capturedUnreadableNotice: (unreadableCount: number, keys: string) => string;
    failedCaptureOptions: string;
    promptLengthLimit: (total: number, max: number) => string;
  };
  separator: string;
}

export interface LocaleDefinition {
  lang: SupportedLanguage;
  host: SunoHostLocale;
  ui: UiMessages;
}
