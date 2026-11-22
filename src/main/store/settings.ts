import { app } from 'electron'
import Store from 'electron-store'
import type { ExtensionBarSettings, GeneralSettings, PipSettings, SidebarLayout } from '@shared/types'
import { DEFAULT_EXTENSION_BAR, normalizeExtensionBar } from '@shared/extensionBar'
import { SEARCH_ENGINES } from '@shared/url'
import { DEFAULT_PIP_SETTINGS, normalizePipSettings } from '../pip/domains'

/** Preferences (CLAUDE.md §2: electron-store), edited on zak://settings. */
interface Settings {
  sidebar: SidebarLayout
  /** Ids of installed extensions the user switched off on zak://extensions. */
  disabledExtensions: string[]
  pip: PipSettings
  general: Partial<GeneralSettings>
  /** Extension icons shown in the sidebar, and their order. */
  extensionBar: ExtensionBarSettings
}

/** Same bounds as the renderer's Sidebar (5 tiles per row need some room). */
export const SIDEBAR_MIN_WIDTH = 220
export const SIDEBAR_MAX_WIDTH = 380

export class SettingsStore {
  private store = new Store<Settings>({
    defaults: { sidebar: { width: 300, collapsed: false }, disabledExtensions: [], pip: DEFAULT_PIP_SETTINGS, general: {}, extensionBar: DEFAULT_EXTENSION_BAR }
  })

  getSidebar(): SidebarLayout {
    return this.store.get('sidebar')
  }

  setSidebar(layout: SidebarLayout): void {
    const width = Math.round(Math.min(Math.max(layout.width, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH))
    this.store.set('sidebar', { width, collapsed: layout.collapsed })
  }

  getExtensionBar(): ExtensionBarSettings {
    return normalizeExtensionBar(this.store.get('extensionBar'))
  }

  setExtensionBar(bar: ExtensionBarSettings): ExtensionBarSettings {
    const clean = normalizeExtensionBar(bar)
    this.store.set('extensionBar', clean)
    return clean
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
    searchEngine: pick(raw.searchEngine, Object.keys(SEARCH_ENGINES) as (keyof typeof SEARCH_ENGINES)[], 'google'),
    startup: pick(raw.startup, ['restore', 'newtab'] as const, 'restore'),
    theme: pick(raw.theme, ['system', 'light', 'dark'] as const, 'light'),
    downloadDir: typeof raw.downloadDir === 'string' && raw.downloadDir !== '' ? raw.downloadDir : app.getPath('downloads'),
    safeBrowsing: raw.safeBrowsing !== false,
    savePasswords: raw.savePasswords !== false,
    sleepTabsAfter: [0, 15, 30, 60, 120].includes(raw.sleepTabsAfter as number) ? (raw.sleepTabsAfter as number) : 0
  }
}
