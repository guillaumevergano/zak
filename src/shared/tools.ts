/**
 * Zak's own tools (CLAUDE.md §6.8): built into Zak, switched on and off on zak://extensions.
 * A tool switched off leaves no trace: no menu entry, no button, nothing in the pages.
 */

export type ZakToolId = 'translate' | 'screenshot'

export const ZAK_TOOL_IDS: readonly ZakToolId[] = ['screenshot', 'translate']

/** Translation of a selection (right-click), on demand only. */
export interface TranslateSettings {
  enabled: boolean
  /** Language a text one reads is translated into; '' = Zak's interface language. */
  target: string
  /** Languages last chosen in « Traduire en », most recent first (at most RECENT_MAX). */
  recent: string[]
}

/** Screenshots of the page: a region drawn, the visible part or the whole page. Nothing leaves the computer. */
export interface ScreenshotSettings {
  enabled: boolean
}

export interface ToolsSettings {
  translate: TranslateSettings
  screenshot: ScreenshotSettings
}

export const DEFAULT_TOOLS: ToolsSettings = {
  translate: { enabled: true, target: '', recent: [] },
  screenshot: { enabled: true }
}

/** Languages offered (Google Translate codes); names come from Intl.DisplayNames, in Zak's language. */
export const TRANSLATE_LANGUAGES = [
  'fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ro', 'cs', 'sv', 'da', 'no', 'fi', 'el', 'hu',
  'tr', 'ru', 'uk', 'ar', 'he', 'hi', 'zh-CN', 'zh-TW', 'ja', 'ko', 'vi', 'th', 'id'
] as const

const RECENT_MAX = 4

const isLanguage = (value: unknown): value is string => typeof value === 'string' && (TRANSLATE_LANGUAGES as readonly string[]).includes(value)

/** The file can be edited by hand: anything unknown falls back to the default. */
export function normalizeTools(raw: unknown): ToolsSettings {
  const { translate, screenshot } = (raw ?? {}) as { translate?: Partial<TranslateSettings>; screenshot?: Partial<ScreenshotSettings> }
  return {
    translate: {
      enabled: translate?.enabled !== false,
      target: isLanguage(translate?.target) ? translate.target : '',
      recent: Array.isArray(translate?.recent) ? [...new Set(translate.recent.filter(isLanguage))].slice(0, RECENT_MAX) : []
    },
    screenshot: { enabled: screenshot?.enabled !== false }
  }
}

/** The tools switched on, in ZAK_TOOL_IDS order. */
export function enabledTools(tools: ToolsSettings): ZakToolId[] {
  return ZAK_TOOL_IDS.filter((id) => tools[id].enabled)
}

/** `language` moved to the front of the recent ones. */
export function withRecent(recent: string[], language: string): string[] {
  return [language, ...recent.filter((l) => l !== language)].slice(0, RECENT_MAX)
}

/** The translation target for a reader: the chosen one, else Zak's language. */
export function readingTarget(settings: TranslateSettings, uiLanguage: string): string {
  return settings.target || uiLanguage
}

/**
 * A language's name in the interface language: « Anglais » on its own (a list), « anglais » in a
 * sentence (`capitalized` false: « Traduire en anglais »).
 */
export function languageName(code: string, uiLanguage: string, capitalized = true): string {
  let name = code
  try {
    name = new Intl.DisplayNames([uiLanguage], { type: 'language' }).of(code) ?? code
  } catch {
    /* an unknown code: shown as is */
  }
  return capitalized ? name.charAt(0).toLocaleUpperCase(uiLanguage) + name.slice(1) : name
}

/** Languages sorted by name, the recent ones first. */
export function languageMenu(recent: string[], uiLanguage: string): { recent: string[]; others: string[] } {
  const byName = (a: string, b: string): number => languageName(a, uiLanguage).localeCompare(languageName(b, uiLanguage), uiLanguage)
  return { recent, others: TRANSLATE_LANGUAGES.filter((l) => !recent.includes(l)).sort(byName) }
}

/** What a screenshot takes: a region drawn on the page, the visible part, or the whole page. */
export type ScreenshotMode = 'region' | 'visible' | 'full'
