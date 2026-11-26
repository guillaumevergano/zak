import type { Appearance } from './appearance'
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
  /** Unloaded by the tab sleep; reloads when shown. */
  asleep: boolean
  /** Tab group it belongs to (TabsState.groups), or null. */
  groupId: string | null
}

export type TabGroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange'

/** A tab group (like Chrome's): its tabs are next to each other in the strip. */
export interface TabGroupInfo {
  id: string
  /** May be empty: the chip then only shows its color. */
  name: string
  color: TabGroupColor
  /** Folded: only the chip shows, its tabs are hidden. */
  collapsed: boolean
}

/**
 * Split view (à la Arc): two tabs shown side by side in the page area. They stay two tabs (own
 * history, own page), next to each other in the strip, drawn as one pill.
 */
export interface TabSplitInfo {
  id: string
  /** Left tab, right tab (also their order in the strip). */
  tabs: [TabId, TabId]
  /** Share of the width taken by the left page (SPLIT_MIN_RATIO–SPLIT_MAX_RATIO). */
  ratio: number
}

/** Vertical scroll of a tab's page (CSS px), for the thin indicator next to the page. */
export interface PageScroll {
  top: number
  /** Scrollable height; equal to `viewport` when the page doesn't scroll. */
  height: number
  viewport: number
}

export interface TabsState {
  tabs: TabInfo[]
  activeId: TabId | null
  groups: TabGroupInfo[]
  splits: TabSplitInfo[]
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

export type SidebarSide = 'left' | 'right'
export type TabsPosition = 'top' | 'sidebar'

export interface SidebarLayout {
  /** 220–380 px when expanded. */
  width: number
  /** Cmd/Ctrl+B: icons-only column. */
  collapsed: boolean
  /** Which side of the page the sidebar sits on (right by default, CLAUDE.md §6.2). */
  side: SidebarSide
  /** Tabs in the strip at the top (default) or in the sidebar, one per row (§6.1). */
  tabs: TabsPosition
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
  | { kind: 'save-password'; frame: Rect; promptId: number; origin: string; username: string; update: boolean }

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
  /** Loaded from a folder (made by hand, by Claude Code or Codex…): its path, else null. */
  unpackedPath: string | null
}

/** Automatic Picture-in-Picture (CLAUDE.md §6.4), set on zak://settings. */
export interface PipSettings {
  enabled: boolean
  /** Close the PiP window when coming back to its tab. */
  closeOnReturn: boolean
  /** Don't trigger for a muted video (default: trigger anyway). */
  skipMuted: boolean
  /** Also videos the page started by itself (feeds); by default, only those the user started. */
  autoplayed: boolean
  /** Sites where PiP never triggers (a domain covers its subdomains). */
  excludedDomains: string[]
}

/** General preferences (CLAUDE.md §6.7), set on zak://settings. */
export interface GeneralSettings {
  /** Interface language; applied at the next launch. */
  language: 'system' | 'fr' | 'en'
  searchEngine: SearchEngine
  /** At launch: reopen the last session's tabs, or a single new tab. */
  startup: 'restore' | 'newtab'
  theme: 'system' | 'light' | 'dark'
  /** Where downloads go (private windows too, like Chrome). */
  downloadDir: string
  /** Ask where to save each file (a save dialog) instead of saving straight into downloadDir. */
  askWhereToSave: boolean
  /** Warn before opening a known phishing or malware page (src/main/safety/). */
  safeBrowsing: boolean
  /** Offer to save the passwords typed in login forms (src/main/passwords/). */
  savePasswords: boolean
  /** Unload background tabs after this many minutes alone (CLAUDE.md §6.1), 0 = never. */
  sleepTabsAfter: number
}

/** What zak://settings shows and edits. */
export interface BrowserSettings {
  general: GeneralSettings
  pip: PipSettings
  /** Remembered per-site permission decisions. */
  permissions: SitePermission[]
  /** Sidebar in icons-only mode (Cmd/Ctrl+B). */
  sidebar: SidebarLayout
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

/** A saved password, as listed (the password itself only on demand). */
export interface SavedLogin {
  id: string
  /** https://site.example (scheme, host, port). */
  origin: string
  username: string
  updatedAt: number
  usedAt: number | null
}

/** « Enregistrer le mot de passe ? »: save, never for this site, or not now. */
export type SavePasswordChoice = 'save' | 'never' | 'dismiss'

/** The AI agents Zak connects to in one click (main/mcp/connect.ts). */
export type AgentId = 'claude-code' | 'codex' | 'claude-desktop'

export interface AgentStatus {
  id: AgentId
  installed: boolean
  /** Already set up with Zak; null when it can't be told without asking the agent. */
  connected: boolean | null
}

/** Zak's MCP server, as shown in the settings. */
export interface McpState {
  enabled: boolean
  /** http://127.0.0.1:<port>/mcp when running. */
  url: string | null
  token: string
  error: string | null
}

/** A mod (src/main/mods/): a theme and/or a new tab page, from the profile's mods folder. */
export interface ModInfo {
  /** Its folder's name. */
  id: string
  name: string
  version: string
  description: string
  hasTheme: boolean
  hasNewtab: boolean
  themeActive: boolean
  newtabActive: boolean
}

/** A profile (src/main/profiles/): a separate Zak with its own data. */
export interface ProfileInfo {
  id: string
  name: string
  emoji: string
}

/** Another browser to import from (zak://settings → Importer). */
export interface ImportSource {
  browser: string
  profiles: { path: string; name: string }[]
}

/** "Effacer les données de navigation" on zak://settings. */
export interface ClearDataRequest {
  period: ClearPeriod
  history: boolean
  /** Cookies and site data (storage, cache of service workers…). */
  siteData: boolean
  cache: boolean
  /** The list of zak://downloads (the files stay on disk). */
  downloads: boolean
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
 * Whether Zak opens web links for the system: `unavailable` in development (the process is
 * Electron.app, which must not be registered).
 */
export type DefaultBrowserStatus = 'default' | 'other' | 'unavailable'

/** "Effacer les données de navigation": how far back. */
export type ClearPeriod = 'hour' | 'day' | 'week' | 'month' | 'all'

/**
 * A download (CLAUDE.md §6.7), as shown in the toolbar panel and on zak://downloads.
 * `blocked`: its address is on the malware list (src/main/safety/), nothing was saved.
 */
export interface DownloadInfo {
  id: string
  filename: string
  /** Final path on disk ('' while the save dialog is open). */
  path: string
  url: string
  state: 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted' | 'blocked'
  receivedBytes: number
  /** 0 when unknown. */
  totalBytes: number
  startedAt: number
  /** Completed downloads only: false once the file was moved or deleted. */
  exists?: boolean
}

/** `retry`: download the address again; `keep`: a blocked download, downloaded anyway. */
export type DownloadAction = 'pause' | 'resume' | 'cancel' | 'open' | 'show' | 'remove' | 'retry' | 'keep'

/** What zak://appearance shows: the overrides, the theme, the layout, and a mod theme underneath. */
export interface AppearanceState {
  appearance: Appearance
  theme: GeneralSettings['theme']
  sidebar: SidebarLayout
  /** Name of the mod theme in use (Réglages → Personnaliser), under these colors; null: none. */
  modTheme: string | null
}
