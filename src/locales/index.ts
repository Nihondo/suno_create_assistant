import type { LocaleDefinition, SunoHostLocale, SunoHostSliders, SupportedLanguage, UiMessages } from './types';
import { jaLocale } from './ja';
import { enLocale } from './en';

export * from './types';
export { jaLocale } from './ja';
export { enLocale } from './en';

const LOCALES: Record<SupportedLanguage, LocaleDefinition> = {
  ja: jaLocale,
  en: enLocale,
};

export function detectLanguage(doc?: Document): SupportedLanguage {
  const root = doc?.documentElement ?? (typeof document !== 'undefined' ? document.documentElement : undefined);
  const lang = root?.lang?.toLowerCase() ?? '';
  if (lang.startsWith('en')) return 'en';
  if (lang.startsWith('ja')) return 'ja';
  return 'ja'; // Default fallback
}

export function getLocale(lang?: SupportedLanguage): LocaleDefinition {
  const effectiveLang = lang ?? detectLanguage();
  return LOCALES[effectiveLang] ?? jaLocale;
}

export function getHostLocale(lang?: SupportedLanguage): SunoHostLocale {
  return getLocale(lang).host;
}

export function getUiMessages(lang?: SupportedLanguage): UiMessages {
  return getLocale(lang).ui;
}

export function getAllHostLocales(): SunoHostLocale[] {
  return Object.values(LOCALES).map((loc) => loc.host);
}

export function getAllTitlePlaceholders(): string[] {
  const set = new Set<string>();
  for (const loc of getAllHostLocales()) {
    for (const ph of loc.titlePlaceholders) set.add(ph);
  }
  return [...set];
}

export function getAllDestinationKeywords(): string[] {
  const set = new Set<string>();
  for (const loc of getAllHostLocales()) {
    for (const kw of loc.destinationKeywords) set.add(kw);
  }
  return [...set];
}

export function getAllExcludedStylesPlaceholders(): string[] {
  const set = new Set<string>();
  for (const loc of getAllHostLocales()) {
    for (const ph of loc.excludedStylesPlaceholders) set.add(ph);
  }
  return [...set];
}

export function getAllOptionResetLabels(): string[] {
  const set = new Set<string>();
  for (const loc of getAllHostLocales()) {
    for (const label of loc.optionResetLabels) set.add(label);
  }
  return [...set];
}

export function getAllSavedStyleTriggerLabels(): string[] {
  const set = new Set<string>();
  for (const loc of getAllHostLocales()) {
    for (const label of loc.savedStyles.triggerAriaLabels) set.add(label);
  }
  return [...set];
}

export function getAllSavedStyleDialogLabels(): string[] {
  const set = new Set<string>();
  for (const loc of getAllHostLocales()) {
    for (const label of loc.savedStyles.dialogAriaLabels) set.add(label);
  }
  return [...set];
}

export function getAllSavedStyleMutationLabels(): string[] {
  const set = new Set<string>();
  for (const loc of getAllHostLocales()) {
    for (const label of loc.savedStyles.mutationLabels) set.add(label);
  }
  return [...set];
}

export function getAllSavedStyleSaveNewLabels(): string[] {
  const set = new Set<string>();
  for (const loc of getAllHostLocales()) {
    for (const label of loc.savedStyles.saveNewLabels) set.add(label);
  }
  return [...set];
}

export function getAllClearFormLabels(): string[] {
  const set = new Set<string>();
  for (const loc of getAllHostLocales()) {
    for (const label of loc.clearFormLabels) set.add(label);
  }
  return [...set];
}

export function getAllClipRowLikeLabels(): string[] {
  const set = new Set<string>();
  for (const loc of getAllHostLocales()) {
    for (const label of loc.clipRow.likeLabels) set.add(label);
  }
  return [...set];
}

export function getAllClipRowShareLabels(): string[] {
  const set = new Set<string>();
  for (const loc of getAllHostLocales()) {
    for (const label of loc.clipRow.shareLabels) set.add(label);
  }
  return [...set];
}

export function isSavedStyleDateString(value: string): boolean {
  const trimmed = value.trim();
  for (const loc of getAllHostLocales()) {
    if (loc.savedStyles.dateRegex.test(trimmed)) return true;
  }
  // Generic date/time patterns
  return /^(?:\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d+\s*(?:weeks?|days?|hours?|minutes?|seconds?)\s*(?:ago)?)$/i.test(trimmed);
}

export function getSliderLabels(key: keyof SunoHostSliders): string[] {
  const set = new Set<string>();
  for (const loc of getAllHostLocales()) {
    set.add(loc.sliders[key]);
  }
  return [...set];
}

export function getRowLabels(key: 'vocalGender' | 'duration' | 'maxMode' | 'personalization'): string[] {
  const set = new Set<string>();
  for (const loc of getAllHostLocales()) {
    set.add(loc.rows[key].label);
  }
  return [...set];
}

