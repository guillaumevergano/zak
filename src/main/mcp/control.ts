import type { GeneralSettings } from '@shared/types'
import { DEFAULT_COLORS, DEFAULT_FONTS } from '@shared/appearance'
import { toUrl } from '@shared/url'
import { TabManager } from '../tabs/TabManager'
import type { FavoritesStore } from '../store/favorites'
import type { SettingsStore } from '../store/settings'
import type { SidebarController } from '../sidebar/SidebarController'
import type { ModsManager } from '../mods/ModsManager'
import type { BrowserWindowHandle, WindowManager } from '../windows/WindowManager'
import type { McpSettings, ZakControl } from './ZakMcpServer'

/** The MCP tools' view of the running Zak (see ZakControl for what is, and isn't, reachable). */
export function zakControl(deps: {
  windows: WindowManager
  favorites: FavoritesStore
  sidebar: SidebarController
  settings: SettingsStore
  mods: ModsManager
  applySettings: (general: GeneralSettings) => void
}): ZakControl {
  const { windows, favorites, sidebar, settings, mods } = deps
  const withLayout = (general: GeneralSettings): McpSettings => {
    const { side, tabs } = settings.getSidebar()
    return { ...general, sidebarSide: side, tabsPosition: tabs }
  }
  const normal = (): BrowserWindowHandle[] => windows.all().filter((h) => !h.private)
  const windowOf = (tabId: number): BrowserWindowHandle | undefined => normal().find((h) => h.tabs.indexOf(tabId) !== -1)

  return {
    windows: () =>
      normal().map((h, i) => {
        const { tabs, activeId, groups } = h.tabs.getState()
        return {
          window: i + 1,
          tabs: tabs.map((t) => ({ id: t.id, title: t.title, url: t.url, pinned: t.pinned, active: t.id === activeId, groupId: t.groupId, favoriteId: t.favoriteId })),
          groups
        }
      }),
    openTab: (url, background) => {
      // Created on its address: the Chrome identity of the tab is set before the first request.
      return windows.focusedNormal().tabs.create(toUrl(url, TabManager.searchEngine()), { active: !background }).id
    },
    closeTabs: (ids) => {
      let closed = 0
      for (const id of ids) {
        const handle = windowOf(id)
        if (handle) {
          handle.tabs.close(id)
          closed++
        }
      }
      return closed
    },
    activateTab: (id) => {
      const handle = windowOf(id)
      if (!handle) return false
      handle.tabs.activate(id)
      handle.window.show()
      handle.window.focus()
      return true
    },
    groupTabs: (ids, name, color) => {
      const handle = windowOf(ids[0]!)
      if (!handle) return null
      return handle.tabs.addToNewGroup(
        ids.filter((id) => handle.tabs.indexOf(id) !== -1),
        { name, ...(color ? { color } : {}) }
      )
    },
    favorites: () => ({ folders: favorites.folders(), favorites: favorites.favorites().map(({ favicon: _icon, ...f }) => f) }),
    addFavorite: ({ url, title, emoji, folder }) => {
      let folderId: string | null = null
      if (folder) {
        folderId = favorites.folders().find((f) => f.name.toLowerCase() === folder.toLowerCase())?.id ?? favorites.addFolder({ name: folder, emoji: '📁' })
      }
      const href = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`
      const id = favorites.addFavorite({ title, url: href, emoji, folderId })
      sidebar.broadcast()
      return id
    },
    settings: () => withLayout(settings.getGeneral()),
    updateSettings: (patch) => {
      // The download folder only changes through its picker, like in the settings page.
      const { downloadDir: _ignored, sidebarSide, tabsPosition, ...rest } = patch
      const general = settings.setGeneral(rest)
      deps.applySettings(general)
      if (sidebarSide !== undefined || tabsPosition !== undefined) sidebar.setLayout({ side: sidebarSide, tabs: tabsPosition })
      return withLayout(general)
    },
    appearance: () => ({
      ...settings.getAppearance(),
      defaults: { colors: DEFAULT_COLORS, fonts: DEFAULT_FONTS },
      theme: settings.getGeneral().theme,
      sidebarSide: settings.getSidebar().side,
      tabsPosition: settings.getSidebar().tabs
    }),
    updateAppearance: (patch, reset) => settings.setAppearance(patch, reset),
    mods: () => ({ dir: mods.dir, mods: mods.list() }),
    selectMod: (kind, id) => {
      mods.select(kind, id)
      return { dir: mods.dir, mods: mods.list() }
    }
  }
}
