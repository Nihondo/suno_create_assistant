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
  // Words that mark a saved-styles row as just mutated (deleted / renamed),
  // seen either as a standalone action label or as the start of a
  // confirmation label like "Delete: <name>". Matched with String#includes.
  mutationLabels: string[];
  // Suno's own "Save prompt" button, which adds a new entry to the saved
  // styles list directly from the style textarea (distinct from the
  // extension's own dropdown).
  saveNewLabels: string[];
}

export interface SunoHostClipRow {
  // aria-label roots for the per-clip action buttons in the workspace clip
  // list (e.g. "クリップに「いいね」" / "Like clip"). Used to anchor the
  // "reuse parameters" button next to Suno's own row actions.
  likeLabels: string[];
  shareLabels: string[];
}

export interface SunoHostLocale {
  lang: SupportedLanguage;
  titlePlaceholders: string[];
  destinationKeywords: string[];
  optionHeadingRegex: RegExp;
  optionResetLabels: string[];
  excludedStylesPlaceholders: string[];
  // Label for Suno's own "Clear all form inputs" action. When clicked, the
  // extension's own style/mastering/preset selections must reset alongside
  // Suno's native fields.
  clearFormLabels: string[];
  sliders: SunoHostSliders;
  rows: {
    vocalGender: SunoHostRowVocalGender;
    duration: SunoHostRowDuration;
    maxMode: SunoHostRowMaxMode;
    personalization: SunoHostRowPersonalization;
  };
  savedStyles: SunoHostSavedStyles;
  clipRow: SunoHostClipRow;
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
    reuseParameters: string;
    settingsSections: string;
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
    titleFormatPreviewLabel: string;
    titleFormatHintLead: string;
    phWorkspace: string;
    phStyle: string;
    phAudio: string;
    phModel: string;
    phMastering: string;
    phPreset: string;
    phDate: string;
    phTime: string;
    phTake: string;
    phTakePadded: string;
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
    onOption: string;
    offOption: string;
    backupHeading: string;
    backupHint: string;
    includeTakeHistoryLabel: string;
    exportButton: string;
    importButton: string;
    importConfirm: string;
    importSuccess: string;
    importInvalidFile: string;
    takeHistoryHeading: string;
    takeHistoryHint: string;
    takeHistoryEmpty: string;
    restoreParams: string;
    saveAsPreset: string;
    clearAllHistory: string;
    clearAllHistoryConfirm: string;
    linkedToSong: string;
    linkedToSongNumbered: (index: number) => string;
    savedAsPresetNotice: string;
    takeHistoryLimitLabel: string;
    takeHistoryLimitUnit: string;
    saveTakeHistoryLimit: string;
    takeHistoryLimitSavedNotice: string;
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
    nameRequired: string;
    nameDuplicated: string;
    promptRequired: string;
    promptTooLong: (max: number) => string;
    selectAtLeastOneField: string;
  };
  separator: string;
}

export interface LocaleDefinition {
  lang: SupportedLanguage;
  host: SunoHostLocale;
  ui: UiMessages;
}
