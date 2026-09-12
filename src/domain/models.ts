export type VocalGender = 'none' | 'male' | 'female';
export type Duration = { mode: 'auto' | 'custom'; seconds?: number };

export interface MasteringPrompt {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OtherOptionsSnapshot {
  excludedStyles: string;
  vocalGender: VocalGender;
  duration: Duration;
  maxMode: boolean;
  weirdness: number;
  styleInfluence: number;
  variation: number;
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

export interface StorageSchemaV1 {
  schemaVersion: 1;
  masteringPrompts: MasteringPrompt[];
  optionPresets: OtherOptionsPreset[];
  autoTitleEnabled: boolean;
  titleFormat?: string;
  takeNumbers?: Record<string, number>;
  closeDisclosuresOnAdvanced?: boolean;
}

export interface SavedStyle {
  id: string;
  name: string;
  prompt: string;
}

export interface ApplyResult {
  applied: OtherOptionsKey[];
  skipped: OtherOptionsKey[];
}

export interface OtherOptionsCapture {
  snapshot: OtherOptionsSnapshot;
  unreadable: OtherOptionsKey[];
}

export const optionLabels: Record<OtherOptionsKey, string> = {
  excludedStyles: 'スタイルを除外',
  vocalGender: 'ボーカル性別',
  duration: '長さ',
  maxMode: 'Maxモード',
  weirdness: '奇抜さ',
  styleInfluence: 'スタイルの影響',
  variation: 'バリエーション',
  personalization: 'パーソナライズ',
};

export const optionKeys = Object.keys(optionLabels) as OtherOptionsKey[];

export const emptyOtherOptions = (): OtherOptionsSnapshot => ({
  excludedStyles: '',
  vocalGender: 'none',
  duration: { mode: 'auto' },
  maxMode: false,
  weirdness: 50,
  styleInfluence: 50,
  variation: 0,
  personalization: { enabled: false },
});
