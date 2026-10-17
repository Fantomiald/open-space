// The languages Open Space speaks. The page and the server each keep their own words (src/i18n/, server/i18n/); the
// language itself is a setting (Preferences.language), guessed from the browser until the user picks one.
export const LANGUAGES = ['fr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language);

/** The first of the browser's languages that Open Space speaks (navigator.languages), English when none. */
export function languageOf(tags: readonly string[]): Language {
  for (const tag of tags) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLanguage(primary)) return primary;
  }
  return 'en';
}

/** The locale dates and numbers are written in. */
export const localeOf = (language: Language) => (language === 'fr' ? 'fr-FR' : 'en-US');
