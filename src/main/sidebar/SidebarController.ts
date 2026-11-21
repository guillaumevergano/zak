import { readFile } from 'node:fs/promises'
import { clipboard, Menu } from 'electron'
import { parseBookmarksHtml } from './bookmarksHtml'
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
    const parsed = parseBookmarksHtml(await readFile(path, 'utf8'))
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
      extensionBar: this.settings.getExtensionBar()
    }
  }

  /** Runs a change, then refreshes every window. */
  change<T>(fn: () => T): T {
    const result = fn()
    this.broadcast()
    return result
  }

  setLayout(layout: SidebarLayout): void {
    this.change(() => this.settings.setSidebar(layout))
  }

  addFromTab(handle: BrowserWindowHandle, tabId: TabId, folderId: string | null, index: number): string {
    const tab = handle.tabs.snapshot(tabId)
    if (!tab || !/^https?:/.test(tab.url)) return ''
    return this.change(() =>
      this.favorites.addFavorite({ title: tab.title, url: tab.url, emoji: null, folderId, favicon: tab.favicon }, index)
    )
  }

  open(handle: BrowserWindowHandle, id: string, disposition: OpenDisposition): void {
    const favorite = this.favorites.favorite(id)
    if (!favorite) return
    const activeId = handle.tabs.getActiveId()
    if (disposition === 'current' && activeId !== null) handle.tabs.navigate(activeId, favorite.url)
    else handle.tabs.create(favorite.url, { active: disposition !== 'background-tab' })
  }

  showFavoriteMenu(handle: BrowserWindowHandle, id: string): void {
    const favorite = this.favorites.favorite(id)
    if (!favorite) return
    const destinations: { id: string | null; label: string }[] = [
      { id: null, label: 'Racine (hors dossier)' },
      ...this.favorites.folders().map((f) => ({ id: f.id, label: `${f.emoji ? `${f.emoji} ` : ''}${f.name}` }))
    ]
    Menu.buildFromTemplate([
      { label: 'Ouvrir dans un nouvel onglet', click: () => this.open(handle, id, 'foreground-tab') },
      { type: 'separator' },
      { label: 'Modifier…', click: () => this.windows.send(handle, 'sidebar:edit', { kind: 'favorite', id }) },
      {
        label: 'Déplacer vers',
        submenu: destinations.map((d) => ({
          label: d.label,
          type: 'checkbox' as const,
          checked: d.id === favorite.folderId,
          enabled: d.id !== favorite.folderId,
          click: () => this.change(() => this.favorites.moveFavorite(id, d.id, Number.MAX_SAFE_INTEGER))
        }))
      },
      { label: "Copier l'adresse", click: () => clipboard.writeText(favorite.url) },
      { type: 'separator' },
      { label: 'Supprimer', click: () => this.change(() => this.favorites.removeFavorite(id)) }
    ]).popup({ window: handle.window })
  }

  showFolderMenu(handle: BrowserWindowHandle, id: string): void {
    const inside = this.favorites.favorites().filter((f) => f.folderId === id)
    Menu.buildFromTemplate([
      {
        label: 'Ouvrir tous dans des onglets',
        enabled: inside.length > 0,
        click: () => inside.forEach((f, i) => handle.tabs.create(f.url, { active: i === 0 }))
      },
      { type: 'separator' },
      { label: 'Renommer…', click: () => this.windows.send(handle, 'sidebar:edit', { kind: 'folder', id }) },
      {
        label: inside.length > 0 ? 'Supprimer le dossier (garder ses favoris)' : 'Supprimer le dossier',
        click: () => this.change(() => this.favorites.removeFolder(id))
      }
    ]).popup({ window: handle.window })
  }

  private broadcast(): void {
    this.windows.broadcast('sidebar:state', this.state())
  }
}
