import type { SearchEngine } from './url'

export type TabId = number

export interface TabInfo {
  id: TabId
  title: string
  url: string
  favicon: string | null
  audible: boolean
  muted: boolean
  loading: boolean
  pinned: boolean
  canGoBack: boolean
  canGoForward: boolean
  /** Page zoom in percent (100 = default), shown in the omnibox when different. */
  zoom: number
}

export interface TabsState {
  tabs: TabInfo[]
  activeId: TabId | null
}

/** Space taken by the chrome UI around the web content area, from each window edge (CSS pixels). */
export interface LayoutInsets {
  left: number
  top: number
  right: number
  bottom: number
}

export interface WidevineStatus {
  ready: boolean
  /** Raw status from castLabs `components.status()`, for diagnostics. */
  detail: string
}

// ── Sidebar favorites (CLAUDE.md §6.2) ──────────────────────────────────────────

export interface FavoriteInfo {
  id: string
  title: string
  url: string
  /** Shown in the mosaic tile; null → the site's favicon. */
  emoji: string | null
  favicon: string | null
  folderId: string | null
  position: number
}

export interface FolderInfo {
  id: string
  name: string
  emoji: string | null
  position: number
  collapsed: boolean
}

export interface SidebarLayout {
  /** 180–320 px when expanded. */
  width: number
  /** Cmd/Ctrl+B: icons-only column. */
  collapsed: boolean
}

export interface SidebarState {
  folders: FolderInfo[]
  /** Sorted by folder then position; root favorites have folderId null. */
  favorites: FavoriteInfo[]
  layout: SidebarLayout
  extensionBar: ExtensionBarSettings
}

/** Extension icons at the top of the sidebar, picked and ordered on zak://settings. */
export interface ExtensionBarSettings {
  /** Extension ids in display order; extensions not listed come after, in install order. */
  order: string[]
  /** Extensions kept out of the sidebar. */
  hidden: string[]
}

export interface FavoriteInput {
  title: string
  url: string
  emoji: string | null
  folderId: string | null
  favicon?: string | null
}

export interface FolderInput {
  name: string
  emoji: string | null
}

export type OpenDisposition = 'current' | 'foreground-tab' | 'background-tab'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Popovers that must float above the page (★ editor, folder editor, emoji picker) render in a
 * transparent overlay view stacked over the tabs, since the chrome UI sits below them.
 */
export type OverlayRequest = ModalOverlayRequest | FramedOverlayRequest

/** Modal popovers: the overlay covers the window and takes the focus; a click outside closes them. */
export type ModalOverlayRequest =
  | { kind: 'favorite-editor'; anchor: Rect; favoriteId: string | null; draft: FavoriteInput }
  | { kind: 'folder-editor'; anchor: Rect; folderId: string | null; draft: FolderInput }
  | { kind: 'downloads'; anchor: Rect }

/**
 * Non-modal panels: the overlay shrinks to `frame` (window coordinates), the page around stays
 * usable. Suggestions leave the focus in the omnibox.
 */
export type FramedOverlayRequest =
  | { kind: 'suggestions'; frame: Rect; tabId: TabId; items: OmniboxSuggestion[]; selected: number }
  | { kind: 'find'; frame: Rect; tabId: TabId; text: string }
  | { kind: 'permission'; frame: Rect; requestId: number; origin: string; permission: PermissionKind }

/** A row of the omnibox dropdown (CLAUDE.md §6.7). */
export interface OmniboxSuggestion {
  kind: 'search' | 'url' | 'history' | 'favorite'
  title: string
  url: string
  favicon: string | null
  emoji: string | null
}

/** Cmd/Ctrl+F results (webContents `found-in-page`). */
export interface FindResult {
  activeMatch: number
  matches: number
}

/** An installed Chrome extension, as listed on zak://extensions. */
export interface ExtensionInfo {
  id: string
  name: string
  version: string
  description: string
  enabled: boolean
  manifestVersion: number
  /** data: URL of the largest icon (≤ 128 px), or null. */
  icon: string | null
  /** Options page, when the extension declares one. */
  hasOptions: boolean
}

/** Automatic Picture-in-Picture (CLAUDE.md §6.4), set on zak://settings. */
export interface PipSettings {
  enabled: boolean
  /** Close the PiP window when coming back to its tab. */
  closeOnReturn: boolean
  /** Don't trigger for a muted video (default: trigger anyway). */
  skipMuted: boolean
  /** Sites where PiP never triggers (a domain covers its subdomains). */
  excludedDomains: string[]
}

/** General preferences (CLAUDE.md §6.7), set on zak://settings. */
export interface GeneralSettings {
  searchEngine: SearchEngine
  /** At launch: reopen the last session's tabs, or a single new tab. */
  startup: 'restore' | 'newtab'
  theme: 'system' | 'light' | 'dark'
  /** Where downloads go (private windows too, like Chrome). */
  downloadDir: string
}

/** What zak://settings shows and edits. */
export interface BrowserSettings {
  general: GeneralSettings
  pip: PipSettings
  /** Remembered per-site permission decisions. */
  permissions: SitePermission[]
  /** Sidebar in icons-only mode (Cmd/Ctrl+B). */
  sidebarCollapsed: boolean
  extensionBar: ExtensionBarSettings
}

/** A remembered answer to a permission prompt, per origin (CLAUDE.md §6.7). */
export interface SitePermission {
  origin: string
  permission: PermissionKind
  granted: boolean
}

/** Permissions that get a prompt under the omnibox. */
export type PermissionKind = 'notifications' | 'camera' | 'microphone' | 'geolocation' | 'clipboard'

/** "Effacer les données de navigation" on zak://settings. */
export interface ClearDataRequest {
  period: ClearPeriod
  history: boolean
  /** Cookies and site data (storage, cache of service workers…). */
  siteData: boolean
  cache: boolean
}

// ── Étape 6: history, downloads, permissions, session (CLAUDE.md §6.7) ─────────────

export interface HistoryEntry {
  id: number
  url: string
  title: string
  favicon: string | null
  /** Last visit, ms since epoch. */
  visitedAt: number
  visitCount: number
}

/**
 * Whether ZAK opens web links for the system: `unavailable` in development (the process is
 * Electron.app, which must not be registered).
 */
export type DefaultBrowserStatus = 'default' | 'other' | 'unavailable'

/** "Effacer les données de navigation": how far back. */
export type ClearPeriod = 'hour' | 'day' | 'week' | 'month' | 'all'

/** A download of this session (CLAUDE.md §6.7), as shown in the downloads panel. */
export interface DownloadInfo {
  id: string
  filename: string
  /** Final path on disk. */
  path: string
  url: string
  state: 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted'
  receivedBytes: number
  /** 0 when unknown. */
  totalBytes: number
  startedAt: number
}

export type DownloadAction = 'pause' | 'resume' | 'cancel' | 'open' | 'show' | 'remove'
