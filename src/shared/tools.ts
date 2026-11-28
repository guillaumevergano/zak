/**
 * Zak's own tools (CLAUDE.md §6.8): built into Zak, switched on and off on zak://extensions.
 * A tool switched off leaves no trace: no menu entry, no button, nothing in the pages.
 */

import { COLOR_FORMATS, type ColorFormat } from './colors'

export type ZakToolId = 'translate' | 'screenshot' | 'record' | 'colors'

export const ZAK_TOOL_IDS: readonly ZakToolId[] = ['screenshot', 'record', 'translate', 'colors']

/**
 * What a sidebar icon of a tool does: most tools have one, « Couleurs » two (the eyedropper, and
 * reading the site's brand kit).
 */
export type ToolAction = ZakToolId | 'brand'

const TOOL_ACTIONS: Record<ZakToolId, ToolAction[]> = {
  screenshot: ['screenshot'],
  record: ['record'],
  translate: ['translate'],
  colors: ['colors', 'brand']
}

/** The sidebar icons of the tools switched on, in their order. */
export function toolActions(tools: readonly ZakToolId[]): ToolAction[] {
  return tools.flatMap((tool) => TOOL_ACTIONS[tool])
}

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

/**
 * Screen recording, à la Loom: a screen or a window, the camera in a round bubble, the microphone.
 * A video file in the downloads folder; nothing leaves the computer.
 */
export interface RecordSettings {
  enabled: boolean
  /**
   * The camera bubble, and the camera chosen by its name ('' = the system's): device ids differ
   * from one session to the other, names don't.
   */
  camera: boolean
  cameraLabel: string
  /** The microphone, and the one chosen by its name ('' = the system's). */
  mic: boolean
  micLabel: string
  /** The computer's own sound (a video playing, a call): Windows, and macOS 13+ (ScreenCaptureKit). */
  systemAudio: boolean
  /** Each recording goes to Google Drive as soon as it is made (once Drive is connected). */
  autoShare: boolean
  /** Shared recordings can be watched by anyone with the link (otherwise: the Drive's owner only). */
  publicLink: boolean
  /**
   * A Google OAuth client (« Desktop app ») of one's own, when the build has none: see
   * docs/DRIVE.md. Not a secret for an installed app (Google says so), but kept out of the repo.
   */
  driveClientId: string
  driveClientSecret: string
}

/**
 * « Couleurs »: an eyedropper anywhere on the screen (history, favorites) and the brand kit of a
 * site (colors, fonts, styles), kept on zak://colors. Nothing leaves the computer.
 */
export interface ColorsSettings {
  enabled: boolean
  /** How a picked color is copied. */
  format: ColorFormat
}

export interface ToolsSettings {
  translate: TranslateSettings
  screenshot: ScreenshotSettings
  record: RecordSettings
  colors: ColorsSettings
}

export const DEFAULT_TOOLS: ToolsSettings = {
  translate: { enabled: true, target: '', recent: [] },
  screenshot: { enabled: true },
  record: { enabled: true, camera: true, cameraLabel: '', mic: true, micLabel: '', systemAudio: false, autoShare: false, publicLink: true, driveClientId: '', driveClientSecret: '' },
  colors: { enabled: true, format: 'hex' }
}

/** Where a recording comes from: a screen or a window (desktopCapturer), with its thumbnail. */
export interface RecordSource {
  id: string
  name: string
  kind: 'screen' | 'window'
  /** data: URL. */
  thumbnail: string
  appIcon: string | null
}

/** What the recorder needs to start: the source and the devices by name ('' = the system's, null = none). */
export interface RecordRequest {
  sourceId: string
  camera: string | null
  mic: string | null
  systemAudio: boolean
}

/** Zak's access to the screen, camera and microphone (macOS asks the user; elsewhere 'granted'). */
export interface RecordAccess {
  screen: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
  camera: boolean
  mic: boolean
}

/** What the recorder's controls show and do. */
export interface RecorderSetup {
  sourceId: string
  /** The microphone's name ('' = the system's, null = none). */
  mic: string | null
  /** The computer's sound, mixed with the microphone. */
  systemAudio: boolean
  /** E2E tests: a drawn picture in place of the screen. */
  fake: boolean
}

export type RecorderCommand = 'stop' | 'pause' | 'resume' | 'cancel'

/** Languages offered (Google Translate codes); names come from Intl.DisplayNames, in Zak's language. */
export const TRANSLATE_LANGUAGES = [
  'fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ro', 'cs', 'sv', 'da', 'no', 'fi', 'el', 'hu',
  'tr', 'ru', 'uk', 'ar', 'he', 'hi', 'zh-CN', 'zh-TW', 'ja', 'ko', 'vi', 'th', 'id'
] as const

const RECENT_MAX = 4

const isLanguage = (value: unknown): value is string => typeof value === 'string' && (TRANSLATE_LANGUAGES as readonly string[]).includes(value)

/** The file can be edited by hand: anything unknown falls back to the default. */
export function normalizeTools(raw: unknown): ToolsSettings {
  const { translate, screenshot, record, colors } = (raw ?? {}) as {
    translate?: Partial<TranslateSettings>
    screenshot?: Partial<ScreenshotSettings>
    record?: Partial<RecordSettings>
    colors?: Partial<ColorsSettings>
  }
  const id = (value: unknown): string => (typeof value === 'string' ? value.slice(0, 200) : '')
  return {
    translate: {
      enabled: translate?.enabled !== false,
      target: isLanguage(translate?.target) ? translate.target : '',
      recent: Array.isArray(translate?.recent) ? [...new Set(translate.recent.filter(isLanguage))].slice(0, RECENT_MAX) : []
    },
    screenshot: { enabled: screenshot?.enabled !== false },
    record: {
      enabled: record?.enabled !== false,
      camera: record?.camera !== false,
      cameraLabel: id(record?.cameraLabel),
      mic: record?.mic !== false,
      micLabel: id(record?.micLabel),
      systemAudio: record?.systemAudio === true,
      autoShare: record?.autoShare === true,
      publicLink: record?.publicLink !== false,
      driveClientId: id(record?.driveClientId).trim(),
      driveClientSecret: id(record?.driveClientSecret).trim()
    },
    colors: {
      enabled: colors?.enabled !== false,
      format: COLOR_FORMATS.includes(colors?.format as ColorFormat) ? (colors!.format as ColorFormat) : 'hex'
    }
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
