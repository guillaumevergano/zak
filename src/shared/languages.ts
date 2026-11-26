/**
 * Zak's interface languages, each named in its own language (as in every language menu). Kept
 * apart from the translations (src/shared/i18n.ts) so that the preloads can use it without them.
 */
export const LANGUAGES = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português'
} as const

export type Lang = keyof typeof LANGUAGES
export type LangSetting = 'system' | Lang

export const LANG_CODES = Object.keys(LANGUAGES) as Lang[]
/** Every value of the « Langue » setting (settings file, MCP server). */
export const LANG_SETTINGS = ['system', 'en', 'fr', 'es', 'de', 'it', 'pt'] as const satisfies readonly LangSetting[]

export const isLang = (value: unknown): value is Lang => typeof value === 'string' && value in LANGUAGES
