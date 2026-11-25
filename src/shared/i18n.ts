import { EN } from './i18n.en'
import { DE } from './i18n/de'
import { ES } from './i18n/es'
import { IT } from './i18n/it'
import { PT } from './i18n/pt'
import { isLang, type Lang, type LangSetting } from './languages'

export { LANGUAGES, LANG_CODES, isLang, type Lang, type LangSetting } from './languages'

/**
 * Interface language. The French text is the key (the UI was written in French): `t('Nouvel
 * onglet')` gives the text in the current language. Each language has one file in
 * src/shared/i18n/ (English split by process: en-main, en-ui, en-welcome). A missing translation
 * falls back to English, then French; tests/unit/i18n.test.ts checks that every `t('…')` of the
 * code is translated in every language.
 *
 * Placeholders: `t('{n} favoris importés', { n: 3 })`.
 */
export const TRANSLATIONS: Record<Exclude<Lang, 'fr'>, Record<string, string>> = { en: EN, es: ES, de: DE, it: IT, pt: PT }

const LOCALES: Record<Lang, string> = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', it: 'it-IT', pt: 'pt-BR' }

let current: Lang = 'fr'

export function setLang(lang: Lang): void {
  current = lang
}

export function getLang(): Lang {
  return current
}

/** « Système »: the system's language when Zak has it, English otherwise. */
export function resolveLang(setting: LangSetting | undefined, systemLocale: string): Lang {
  if (isLang(setting)) return setting
  const system = systemLocale.slice(0, 2).toLowerCase()
  return isLang(system) ? system : 'en'
}

export function t(french: string, params?: Record<string, string | number>): string {
  // `Annuler@@undo`: one French word, two meanings (undo / cancel) — the part after @@ only tells
  // the translations apart, it is never shown.
  const shown = french.split('@@')[0]!
  const text = current === 'fr' ? shown : (TRANSLATIONS[current][french] ?? EN[french] ?? shown)
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

/** « 1 favori » / « 3 favoris »: picks the form, then translates it (French: 0 and 1 are singular). */
export function plural(n: number, one: string, many: string): string {
  const singular = current === 'fr' ? n <= 1 : n === 1
  return t(singular ? one : many, { n })
}

/** BCP 47 tag for dates and numbers (toLocaleDateString…). */
export function locale(): string {
  return LOCALES[current]
}
