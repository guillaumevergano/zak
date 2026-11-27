import { enabledTools } from '@shared/tools'
import { t } from '@shared/i18n'
import { readFile } from 'node:fs/promises'
import { clipboard, Menu } from 'electron'
import { parseBookmarksHtml, type ImportedBookmarks } from './bookmarksHtml'
import type { OpenDisposition, SidebarLayout, SidebarState, TabId } from '@shared/types'
import type { FavoritesStore } from '../store/favorites'
import type { SettingsStore } from '../store/settings'
import type { BrowserWindowHandle, WindowManager } from '../windows/WindowManager'

/**
 * Favorites sidebar (CLAUDE.md §6.2) on the main side: persistence, opening favorites, native
 * context menus. Every change is pushed to all windows (`sidebar:state`).
 */
export class SidebarController {
  constructor(
    private readonly favorites: FavoritesStore,
    private readonly settings: SettingsStore,
    private readonly windows: WindowManager
  ) {
    windows.on('tab-favicon', (pageUrl, favicon) => {
      if (this.favorites.updateFavicon(pageUrl, favicon)) this.broadcast()
    })
    windows.addLinkToFavorites = (url, title) => {
      this.favorites.addFavorite({ title, url, emoji: null, folderId: null })
      this.broadcast()
    }
  }

  /**
   * Imports a bookmarks HTML file (Chrome, Arc…; CLAUDE.md §6.2), skipping pages already saved.
   * Returns how many favorites and folders were added.
   */
  async importBookmarks(path: string): Promise<{ favorites: number; folders: number }> {
    return this.importParsed(parseBookmarksHtml(await readFile(path, 'utf8')))
  }

  /** Adds imported bookmarks (HTML file or another browser's profile), skipping pages already saved. */
  importParsed(parsed: ImportedBookmarks): { favorites: number; folders: number } {
    const known = new Set(this.favorites.favorites().map((f) => f.url))
    let favorites = 0
    let folders = 0
    const add = (folderId: string | null, link: { title: string; url: string; icon: string | null }): void => {
      if (known.has(link.url)) return
      known.add(link.url)
      this.favorites.addFavorite({ title: link.title, url: link.url, emoji: null, folderId, favicon: link.icon })
      favorites++
    }
    for (const link of parsed.root) add(null, link)
    for (const folder of parsed.folders) {
      const fresh = folder.links.filter((l) => !known.has(l.url))
      if (fresh.length === 0) continue
      const id = this.favorites.addFolder({ name: folder.name, emoji: '📁' })
      folders++
      for (const link of fresh) add(id, link)
    }
    this.broadcast()
    return { favorites, folders }
  }

  state(): SidebarState {
    return {
      folders: this.favorites.folders(),
      favorites: this.favorites.favorites(),
      layout: this.settings.getSidebar(),
      extensionBar: this.settings.getExtensionBar(),
      tools: enabledTools(this.settings.getTools())
    }
  }

  /** Runs a change, then refreshes every window. */
  change<T>(fn: () => T): T {
    const result = fn()
    this.broadcast()
    return result
  }

  /** Width, folding, side, tabs position: every window follows at once. */
  setLayout(patch: Partial<SidebarLayout>): SidebarLayout {
    return this.change(() => this.settings.setSidebar(patch))
  }

  addFromTab(handle: BrowserWindowHandle, tabId: TabId, folderId: string | null, index: number, row?: number): string {
    const tab = handle.tabs.snapshot(tabId)
    if (!tab || !/^https?:/.test(tab.url)) return ''
    return this.change(() =>
      this.favorites.addFavorite({ title: tab.title, url: tab.url, emoji: null, folderId, favicon: tab.favicon }, index, row)
    )
  }

  open(handle: BrowserWindowHandle, id: string, disposition: OpenDisposition): void {
    const favorite = this.favorites.favorite(id)
    if (!favorite) return
    // A plain click: the favorite's own tab (CLAUDE.md §6.2); Cmd/Ctrl or middle click: a new tab.
    if (disposition === 'current') handle.tabs.openFavorite(id, favorite.url)
    else handle.tabs.create(favorite.url, { active: disposition !== 'background-tab' })
  }

  /** Deletes a favorite; its tab closes in every window. */
  removeFavorite(id: string): void {
    this.change(() => this.favorites.removeFavorite(id))
    for (const handle of this.windows.all()) handle.tabs.closeFavorite(id)
  }

  showFavoriteMenu(handle: BrowserWindowHandle, id: string): void {
    const favorite = this.favorites.favorite(id)
    if (!favorite) return
    const destinations: { id: string | null; label: string }[] = [
      { id: null, label: t('Racine (hors dossier)') },
      ...this.favorites.folders().map((f) => ({ id: f.id, label: `${f.emoji ? `${f.emoji} ` : ''}${f.name}` }))
    ]
    Menu.buildFromTemplate([
      { label: t('Ouvrir dans un nouvel onglet'), click: () => this.open(handle, id, 'foreground-tab') },
      { type: 'separator' },
      { label: t('Modifier…'), click: () => this.windows.send(handle, 'sidebar:edit', { kind: 'favorite', id }) },
      {
        label: t('Déplacer vers'),
        submenu: destinations.map((d) => ({
          label: d.label,
          type: 'checkbox' as const,
          checked: d.id === favorite.folderId,
          enabled: d.id !== favorite.folderId,
          click: () => this.change(() => this.favorites.moveFavorite(id, d.id, Number.MAX_SAFE_INTEGER))
        }))
      },
      { label: t("Copier l'adresse"), click: () => clipboard.writeText(favorite.url) },
      { type: 'separator' },
      { label: t('Supprimer'), click: () => this.removeFavorite(id) }
    ]).popup({ window: handle.window })
  }

  showFolderMenu(handle: BrowserWindowHandle, id: string): void {
    const inside = this.favorites.favorites().filter((f) => f.folderId === id)
    Menu.buildFromTemplate([
      {
        label: t('Ouvrir tous dans des onglets'),
        enabled: inside.length > 0,
        click: () => inside.forEach((f, i) => handle.tabs.create(f.url, { active: i === 0 }))
      },
      { type: 'separator' },
      { label: t('Modifier le nom et l’icône…'), click: () => this.windows.send(handle, 'sidebar:edit', { kind: 'folder', id }) },
      {
        label: inside.length > 0 ? t('Supprimer le dossier (garder ses favoris)') : t('Supprimer le dossier'),
        click: () => this.change(() => this.favorites.removeFolder(id))
      }
    ]).popup({ window: handle.window })
  }

  /** Pushes the sidebar state (favorites, layout, extension bar) to every window. */
  /** After any change, also one made to the settings file outside Zak. */
  broadcast(): void {
    const state = this.state()
    this.windows.setTabsPosition(state.layout.tabs)
    this.windows.broadcast('sidebar:state', state)
  }
}
