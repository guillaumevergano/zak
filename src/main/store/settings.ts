import { app } from 'electron'
import Store from 'electron-store'
import type { ExtensionBarSettings, GeneralSettings, PipSettings, SidebarLayout } from '@shared/types'
import { DEFAULT_EXTENSION_BAR, normalizeExtensionBar } from '@shared/extensionBar'
import { SEARCH_ENGINES } from '@shared/url'
import { EMPTY_APPEARANCE, normalizeAppearance, patchAppearance, type Appearance, type AppearancePatch } from '@shared/appearance'
import { DEFAULT_PIP_SETTINGS, normalizePipSettings } from '../pip/domains'

/** Preferences (CLAUDE.md §2: electron-store), edited on zak://settings. */
interface Settings {
  sidebar: SidebarLayout
  /** Ids of installed extensions the user switched off on zak://extensions. */
  disabledExtensions: string[]
  /** Folders of extensions loaded unpacked (« Charger une extension non empaquetée »). */
  unpackedExtensions: string[]
  pip: PipSettings
  general: Partial<GeneralSettings>
  /** Extension icons shown in the sidebar, and their order. */
  extensionBar: ExtensionBarSettings
  /** The welcome page (zak://welcome) has been shown once. */
  onboarded: boolean
  /** Mods in use (folder names in the mods folder), null = Zak's own. */
  mods: { theme: string | null; newtab: string | null }
  /** Zak's MCP server (mcp/ZakMcpServer.ts): off by default; port and token kept across launches. */
  mcp: { enabled: boolean; port: number; token: string }
  /** Zak's own colors (per theme) and fonts, chosen on zak://appearance; only what differs from the defaults. */
  appearance: Appearance
}

const SCHEMA_URL = 'https://raw.githubusercontent.com/guillaumevergano/zak/main/docs/customize/settings.schema.json'

/** Same bounds as the renderer's Sidebar (5 tiles per row need some room). */
export const SIDEBAR_MIN_WIDTH = 140
export const SIDEBAR_MAX_WIDTH = 380

export const DEFAULT_SIDEBAR: SidebarLayout = { width: 300, collapsed: false, side: 'right', tabs: 'top' }

/** The file can be edited by hand: anything unknown falls back to the default. */
export function normalizeSidebar(raw: Partial<SidebarLayout> | undefined): SidebarLayout {
  const width = typeof raw?.width === 'number' && Number.isFinite(raw.width) ? raw.width : DEFAULT_SIDEBAR.width
  return {
    width: Math.round(Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH)),
    collapsed: raw?.collapsed === true,
    side: raw?.side === 'left' ? 'left' : 'right',
    tabs: raw?.tabs === 'sidebar' ? 'sidebar' : 'top'
  }
}

export class SettingsStore {
  private store = new Store<Settings>({
    // The file can be edited by hand or by an AI agent (docs/customize/): changes apply at once.
    watch: true,
    defaults: { sidebar: DEFAULT_SIDEBAR, disabledExtensions: [], unpackedExtensions: [], pip: DEFAULT_PIP_SETTINGS, general: {}, extensionBar: DEFAULT_EXTENSION_BAR, onboarded: false, mods: { theme: null, newtab: null }, mcp: { enabled: false, port: 0, token: '' }, appearance: EMPTY_APPEARANCE }
  })

  /** Where the settings live (config.json in the profile folder), for « Ouvrir le fichier de réglages ». */
  get path(): string {
    return this.store.path
  }

  /** Points editors and AI agents at the schema that documents every key. */
  markSchema(): void {
    const raw = this.store as unknown as Store<Record<string, unknown>>
    if (raw.get('$schema') !== SCHEMA_URL) raw.set('$schema', SCHEMA_URL)
  }

  /** Any change, including one made to the file outside Zak. */
  onChange(listener: () => void): void {
    this.store.onDidAnyChange(listener)
  }

  getSidebar(): SidebarLayout {
    return normalizeSidebar(this.store.get('sidebar'))
  }

  /** Any part of the layout; the rest stays as it is. */
  setSidebar(patch: Partial<SidebarLayout>): SidebarLayout {
    const given = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
    const layout = normalizeSidebar({ ...this.getSidebar(), ...given })
    this.store.set('sidebar', layout)
    return layout
  }

  getAppearance(): Appearance {
    return normalizeAppearance(this.store.get('appearance'))
  }

  /** Some colors or fonts (null: back to Zak's own); `reset` starts from Zak's own look. */
  setAppearance(patch: AppearancePatch, reset = false): Appearance {
    const appearance = patchAppearance(reset ? EMPTY_APPEARANCE : this.getAppearance(), patch)
    this.store.set('appearance', appearance)
    return appearance
  }

  getExtensionBar(): ExtensionBarSettings {
    return normalizeExtensionBar(this.store.get('extensionBar'))
  }

  setExtensionBar(bar: ExtensionBarSettings): ExtensionBarSettings {
    const clean = normalizeExtensionBar(bar)
    this.store.set('extensionBar', clean)
    return clean
  }

  getUnpackedExtensions(): string[] {
    return this.store.get('unpackedExtensions')
  }

  setUnpackedExtensions(paths: string[]): void {
    this.store.set('unpackedExtensions', [...new Set(paths)])
  }

  getDisabledExtensions(): string[] {
    return this.store.get('disabledExtensions')
  }

  setDisabledExtensions(ids: string[]): void {
    this.store.set('disabledExtensions', [...new Set(ids)])
  }

  getPip(): PipSettings {
    // Merged with the defaults: settings saved by an older version may lack newer keys.
    return normalizePipSettings({ ...DEFAULT_PIP_SETTINGS, ...this.store.get('pip') })
  }

  setPip(pip: PipSettings): PipSettings {
    const clean = normalizePipSettings(pip)
    this.store.set('pip', clean)
    return clean
  }

  getMods(): { theme: string | null; newtab: string | null } {
    const mods = this.store.get('mods')
    const id = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
    return { theme: id(mods?.theme), newtab: id(mods?.newtab) }
  }

  setMods(mods: { theme: string | null; newtab: string | null }): void {
    this.store.set('mods', mods)
  }

  getMcp(): { enabled: boolean; port: number; token: string } {
    const mcp = this.store.get('mcp')
    return {
      enabled: mcp?.enabled === true,
      port: Number.isInteger(mcp?.port) && mcp.port > 0 && mcp.port < 65536 ? mcp.port : 0,
      token: typeof mcp?.token === 'string' ? mcp.token : ''
    }
  }

  setMcp(mcp: { enabled: boolean; port: number; token: string }): void {
    this.store.set('mcp', mcp)
  }

  isOnboarded(): boolean {
    return this.store.get('onboarded')
  }

  setOnboarded(): void {
    this.store.set('onboarded', true)
  }

  getGeneral(): GeneralSettings {
    return normalizeGeneral(this.store.get('general'))
  }

  /** Saves the given keys; returns the whole section, cleaned up. */
  setGeneral(patch: Partial<GeneralSettings>): GeneralSettings {
    const clean = normalizeGeneral({ ...this.store.get('general'), ...patch })
    this.store.set('general', clean)
    return clean
  }
}

/** Defaults for missing keys, and anything unknown replaced by its default. */
export function normalizeGeneral(raw: Partial<GeneralSettings>): GeneralSettings {
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback
  return {
    language: pick(raw.language, ['system', 'fr', 'en'] as const, 'system'),
    searchEngine: pick(raw.searchEngine, Object.keys(SEARCH_ENGINES) as (keyof typeof SEARCH_ENGINES)[], 'google'),
    startup: pick(raw.startup, ['restore', 'newtab'] as const, 'restore'),
    theme: pick(raw.theme, ['system', 'light', 'dark'] as const, 'light'),
    downloadDir: typeof raw.downloadDir === 'string' && raw.downloadDir !== '' ? raw.downloadDir : app.getPath('downloads'),
    askWhereToSave: raw.askWhereToSave === true,
    safeBrowsing: raw.safeBrowsing !== false,
    savePasswords: raw.savePasswords !== false,
    sleepTabsAfter: [0, 15, 30, 60, 120].includes(raw.sleepTabsAfter as number) ? (raw.sleepTabsAfter as number) : 0
  }
}
