import { EN } from './i18n.en'

/**
 * Interface language. The French text is the key (the UI was written in French): `t('Nouvel
 * onglet')` gives the English text when the language is English. A missing translation falls back
 * to French; tests/unit/i18n.test.ts checks that every `t('…')` of the code has its English.
 *
 * Placeholders: `t('{n} favoris importés', { n: 3 })`.
 */
export type Lang = 'fr' | 'en'
export type LangSetting = 'system' | Lang

let current: Lang = 'fr'

export function setLang(lang: Lang): void {
  current = lang
}

export function getLang(): Lang {
  return current
}

/** « Système »: French for a French-speaking system, English everywhere else. */
export function resolveLang(setting: LangSetting | undefined, systemLocale: string): Lang {
  if (setting === 'fr' || setting === 'en') return setting
  return systemLocale.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export function t(french: string, params?: Record<string, string | number>): string {
  const text = current === 'en' ? (EN[french] ?? french) : french
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

/** « 1 favori » / « 3 favoris »: picks the form, then translates it. */
export function plural(n: number, one: string, many: string): string {
  return t(n > 1 ? many : one, { n })
}

/** BCP 47 tag for dates and numbers (toLocaleDateString…). */
export function locale(): string {
  return current === 'en' ? 'en-US' : 'fr-FR'
}
