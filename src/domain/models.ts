export type VocalGender = 'none' | 'male' | 'female';
export type Duration = { mode: 'auto' | 'custom'; seconds?: number };

export interface MasteringPrompt {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

// A style prompt the user maintains in the extension itself, independent of
// Suno's own saved styles (which the extension only reads, never persists -
// see SavedStyle below). Structurally identical to MasteringPrompt so the
// same save/delete/validate patterns apply.
export interface CustomStyle {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

// Which source(s) feed the style dropdown (see mergeStyleSources in
// src/domain/logic.ts). 'custom' must never trigger opening Suno's native
// saved-styles dialog - see SunoController.loadStyles().
export type StyleSource = 'merged' | 'custom' | 'suno';
export const DEFAULT_STYLE_SOURCE: StyleSource = 'merged';

export interface OtherOptionsSnapshot {
  excludedStyles: string;
  vocalGender: VocalGender;
  duration: Duration;
  maxMode: boolean;
  weirdness: number;
  styleInfluence: number;
  variation: number;
  audioInfluence: number;
  personalization: { enabled: boolean; tasteName?: string };
}

export type OtherOptionsKey = keyof OtherOptionsSnapshot;

export interface OtherOptionsPreset {
  id: string;
  name: string;
  fields: Partial<OtherOptionsSnapshot>;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_LYRICS_TAGS: string[] = [
  '[Instrumental]',
  '[Intro]',
  '[Verse 1]',
  '[Verse 2]',
  '[Pre-Chorus]',
  '[Chorus]',
  '[Bridge]',
  '[Guitar Solo]',
  '[Instrumental Break]',
  '[Final Chorus]',
  '[Outro]',
];

export interface StorageSchemaV1 {
  schemaVersion: 1;
  masteringPrompts: MasteringPrompt[];
  optionPresets: OtherOptionsPreset[];
  autoTitleEnabled: boolean;
  titleFormat?: string;
  takeNumbers?: Record<string, number>;
  closeDisclosuresOnAdvanced?: boolean;
  lyricsTags?: string[];
}

// Records the full set of parameters used at the moment a take was
// submitted, so a good take can be reproduced later even though Suno's own
// song detail panel only keeps a handful of fields (see CLAUDE.md's
// "workspace clip list and song detail panel" note). `options` mirrors the
// same 9 fields as OtherOptionsSnapshot rather than reusing it directly,
// because a field genuinely unreadable at submit time (see `unreadable`)
// must be distinguishable from a field that was read and happened to be at
// its default value.
export interface TakeRecord {
  id: string;
  createdAt: string;
  title: string;
  takeKey?: string;
  takeNumber?: number;
  styleName?: string;
  stylePrompt: string;
  masteringId?: string;
  masteringName?: string;
  presetId?: string;
  presetName?: string;
  model?: string;
  options: Partial<OtherOptionsSnapshot>;
  unreadable: OtherOptionsKey[];
  clipIds: string[];
  linkedAt?: string;
}

export const DEFAULT_TAKE_HISTORY_LIMIT = 500;

// Suno creates a pair of clips (2 variations) by default per submission.
// Single source of truth for both storage/repository.ts's
// findUnlinkedTakeRecords() (which record counts as still pending) and
// suno/clip-linker.ts's linkPendingTakes() (how many clips one record can
// claim per pass) - keeping this in one place instead of two independently
// hardcoded numbers is what actually prevents them drifting apart.
export const EXPECTED_CLIPS_PER_TAKE = 2;

export interface StorageSchemaV2 {
  schemaVersion: 2;
  masteringPrompts: MasteringPrompt[];
  optionPresets: OtherOptionsPreset[];
  autoTitleEnabled: boolean;
  titleFormat?: string;
  takeNumbers?: Record<string, number>;
  closeDisclosuresOnAdvanced?: boolean;
  lyricsTags?: string[];
  takeHistory: TakeRecord[];
  takeHistoryLimit?: number;
  customStyles?: CustomStyle[];
  styleSource?: StyleSource;
}

export type StorageSchema = StorageSchemaV2;

export const CURRENT_SCHEMA_VERSION = 2;

export interface SavedStyle {
  id: string;
  name: string;
  prompt: string;
}

// These values are intentionally kept in the live controller state rather
// than persisted as extension preferences. They describe the current Style
// prompt, which can change independently when Suno or the user edits it.
export interface MusicalSettings {
  key?: string;
  tempo?: number;
  timeSignature?: string;
}

export type MusicalSettingsField = keyof MusicalSettings;

export interface MusicalSettingsDetection extends MusicalSettings {
  conflicts: MusicalSettingsField[];
}

export interface ApplyResult {
  applied: OtherOptionsKey[];
  skipped: OtherOptionsKey[];
}

export interface OtherOptionsCapture {
  snapshot: OtherOptionsSnapshot;
  unreadable: OtherOptionsKey[];
}

// Display order for the 9 fields of OtherOptionsSnapshot. Labels come from
// ui.optionLabels (src/locales) exclusively - this array only fixes order.
export const optionKeys: OtherOptionsKey[] = [
  'excludedStyles',
  'vocalGender',
  'duration',
  'maxMode',
  'weirdness',
  'styleInfluence',
  'variation',
  'audioInfluence',
  'personalization',
];

export const emptyOtherOptions = (): OtherOptionsSnapshot => ({
  excludedStyles: '',
  vocalGender: 'none',
  duration: { mode: 'auto' },
  maxMode: false,
  weirdness: 50,
  styleInfluence: 50,
  variation: 0,
  audioInfluence: 50,
  personalization: { enabled: false },
});
