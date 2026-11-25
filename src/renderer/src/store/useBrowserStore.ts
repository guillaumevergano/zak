import { create } from 'zustand'
import type { DownloadInfo, FavoriteInfo, PageScroll, SidebarLayout, SidebarState, TabGroupInfo, TabId, TabInfo, TabSplitInfo, TabsState } from '@shared/types'

interface BrowserStore {
  tabs: TabInfo[]
  activeId: TabId | null
  groups: TabGroupInfo[]
  splits: TabSplitInfo[]
  /** Scroll of the tabs' pages, for the indicator next to the page. */
  scrolls: Record<TabId, PageScroll>
  setScroll: (tabId: TabId, scroll: PageScroll | null) => void
  /** While a tab is dragged and held over another one: the tab it would join in a split view. */
  mergeTarget: TabId | null
  setMergeTarget: (id: TabId | null) => void
  /** Bumped to ask the omnibox to take focus and select its text. */
  omniboxFocusTick: number
  sidebar: SidebarState | null
  /** This window's downloads (toolbar button and badge). */
  downloads: DownloadInfo[]
  setDownloads: (downloads: DownloadInfo[]) => void

  setTabsState: (state: TabsState) => void
  /** Optimistic reorder while main applies `tabs:move` (avoids a flicker at drop). */
  moveTabLocally: (id: TabId, index: number) => void
  focusOmnibox: () => void
  /** Broom: closes every tab but the active and pinned ones (no confirmation). */
  closeAll: () => Promise<void>

  setSidebar: (state: SidebarState) => void
  /** Optimistic drag & drop of a favorite while main persists it. */
  /** Same rules as main's FavoritesStore.moveFavorite (rows in the root). */
  moveFavoriteLocally: (id: string, folderId: string | null, index: number, row?: number) => void
  /** Local layout change; `persist` saves it (shared by all windows). */
  /** Merged into the current layout; `persist` saves it (every window follows). */
  setSidebarLayout: (patch: Partial<SidebarLayout>, persist: boolean) => void
  toggleSidebar: () => void
}

const api = window.zak

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  tabs: [],
  activeId: null,
  groups: [],
  splits: [],
  scrolls: {},
  setScroll: (tabId, scroll) =>
    set(({ scrolls }) => {
      const next = { ...scrolls }
      if (scroll) next[tabId] = scroll
      else delete next[tabId]
      return { scrolls: next }
    }),
  mergeTarget: null,
  setMergeTarget: (mergeTarget) => set({ mergeTarget }),
  omniboxFocusTick: 0,
  sidebar: null,
  downloads: [],
  setDownloads: (downloads) => set({ downloads }),

  setTabsState: ({ tabs, activeId, groups, splits }) => set({ tabs, activeId, groups, splits }),

  moveTabLocally: (id, index) =>
    set(({ tabs }) => {
      const from = tabs.findIndex((t) => t.id === id)
      if (from < 0) return {}
      const next = [...tabs]
      const [tab] = next.splice(from, 1)
      next.splice(index, 0, tab!)
      return { tabs: next }
    }),

  focusOmnibox: () => set(({ omniboxFocusTick }) => ({ omniboxFocusTick: omniboxFocusTick + 1 })),

  closeAll: async () => {
    await api.invoke('tabs:closeAll')
  },

  setSidebar: (sidebar) => set({ sidebar }),

  moveFavoriteLocally: (id, folderId, index, row) =>
    set(({ sidebar }) => {
      if (!sidebar) return {}
      const moving = sidebar.favorites.find((f) => f.id === id)
      if (!moving) return {}
      if (folderId === null) {
        const rows: FavoriteInfo[][] = []
        for (const f of sidebar.favorites) if (f.folderId === null && f.id !== id) (rows[f.row] ??= []).push(f)
        const lines = rows.filter((r) => r !== undefined)
        const at = Math.max(0, Math.min(row ?? lines.length - 1, lines.length))
        if (at === lines.length) lines.push([])
        lines[at]!.splice(Math.min(Math.max(index, 0), lines[at]!.length), 0, { ...moving, folderId: null })
        let position = 0
        const placed = lines.filter((r) => r.length > 0).flatMap((r, n) => r.map((f) => ({ ...f, row: n, position: position++ })))
        const others = sidebar.favorites.filter((f) => f.folderId !== null && f.id !== id)
        return { sidebar: { ...sidebar, favorites: [...placed, ...others] } }
      }
      const target = sidebar.favorites.filter((f) => f.folderId === folderId && f.id !== id)
      target.splice(Math.min(Math.max(index, 0), target.length), 0, { ...moving, folderId, row: 0 })
      const placed = target.map((f, position) => ({ ...f, position }))
      const others = sidebar.favorites.filter((f) => f.folderId !== folderId && f.id !== id)
      return { sidebar: { ...sidebar, favorites: [...others, ...placed] } }
    }),

  setSidebarLayout: (patch, persist) => {
    set(({ sidebar }) => (sidebar ? { sidebar: { ...sidebar, layout: { ...sidebar.layout, ...patch } } } : {}))
    if (persist) void api.invoke('sidebar:setLayout', patch)
  },

  toggleSidebar: () => {
    const layout = get().sidebar?.layout
    if (layout) get().setSidebarLayout({ collapsed: !layout.collapsed }, true)
  }
}))

export const selectActiveTab = (s: BrowserStore): TabInfo | undefined => s.tabs.find((t) => t.id === s.activeId)
