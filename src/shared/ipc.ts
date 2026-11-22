import type {
  ImportSource,
  McpState,
  ModInfo,
  ProfileInfo,
  TabGroupInfo,
  SavePasswordChoice,
  SavedLogin,
  BrowserSettings,
  DownloadAction,
  DownloadInfo,
  FindResult,
  OmniboxSuggestion,
  ClearDataRequest,
  ClearPeriod,
  DefaultBrowserStatus,
  GeneralSettings,
  PermissionKind,
  SitePermission,
  HistoryEntry,
  ExtensionBarSettings,
  ExtensionInfo,
  PipSettings,
  FavoriteInput,
  FolderInput,
  LayoutInsets,
  OpenDisposition,
  OverlayRequest,
  SidebarLayout,
  SidebarState,
  TabId,
  TabsState,
  WidevineStatus
} from './types'

/**
 * Single source of truth for IPC channels between main and the chrome renderer.
 * Never use a raw channel string elsewhere (CLAUDE.md §3).
 */

/** renderer → main, request/response (ipcRenderer.invoke / ipcMain.handle). */
export interface InvokeChannels {
  'tabs:create': { args: [url?: string]; result: TabId }
  /** `focusPage` false: keep the keyboard in the tab strip (arrow keys). */
  /** Tab groups: rename, recolor, fold (from the chip in the strip). */
  'tabGroups:update': { args: [groupId: string, changes: Partial<Omit<TabGroupInfo, 'id'>>]; result: void }
  /** Right-click on a group's chip: native menu (rename, colors, ungroup, close). */
  'tabGroups:showMenu': { args: [groupId: string]; result: void }
  'tabs:activate': { args: [id: TabId, focusPage?: boolean]; result: void }
  'tabs:close': { args: [id: TabId]; result: void }
  'tabs:navigate': { args: [id: TabId, input: string]; result: void }
  'tabs:back': { args: [id: TabId]; result: void }
  'tabs:forward': { args: [id: TabId]; result: void }
  'tabs:reload': { args: [id: TabId]; result: void }
  'tabs:stop': { args: [id: TabId]; result: void }
  /** "Tout fermer" (broom): closes every tab but the active and the pinned ones. */
  'tabs:closeAll': { args: []; result: void }
  'tabs:setPinned': { args: [id: TabId, pinned: boolean]; result: void }
  'tabs:toggleMute': { args: [id: TabId]; result: void }
  /** Moves a tab to `index` in the strip; main keeps pinned tabs before the others. */
  'tabs:move': { args: [id: TabId, index: number]; result: void }
  /** Native context menu of a tab in the strip (épingler, dupliquer, fermer…). */
  'tabs:showContextMenu': { args: [id: TabId]; result: void }
  'tabs:getState': { args: []; result: TabsState }
  'widevine:getStatus': { args: []; result: WidevineStatus }

  'sidebar:getState': { args: []; result: SidebarState }
  'sidebar:setLayout': { args: [layout: SidebarLayout]; result: void }
  'favorites:add': { args: [input: FavoriteInput]; result: string }
  /** Drag of a tab from the strip into the sidebar: main knows its title, URL and favicon. */
  'favorites:addFromTab': { args: [tabId: TabId, folderId: string | null, index: number]; result: string }
  'favorites:update': { args: [id: string, input: FavoriteInput]; result: void }
  'favorites:remove': { args: [id: string]; result: void }
  'favorites:move': { args: [id: string, folderId: string | null, index: number]; result: void }
  'favorites:open': { args: [id: string, disposition: OpenDisposition]; result: void }
  'favorites:showContextMenu': { args: [id: string]; result: void }
  'folders:add': { args: [input: FolderInput]; result: string }
  'folders:update': { args: [id: string, input: FolderInput]; result: void }
  'folders:setCollapsed': { args: [id: string, collapsed: boolean]; result: void }
  'folders:move': { args: [id: string, index: number]; result: void }
  'folders:showContextMenu': { args: [id: string]; result: void }

  /** Chrome renderer → main: show a popover in the overlay view. */
  'overlay:open': { args: [request: OverlayRequest]; result: void }
  /** Overlay → main: popover dismissed or done (the focus goes back to the page). */
  'overlay:close': { args: []; result: void }
  /** Hides the overlay if it shows `kind`, without moving the focus (omnibox suggestions). */
  'overlay:hide': { args: [kind: OverlayRequest['kind']]; result: void }

  /** Omnibox dropdown for `text`: what Enter does first, then history and favorites. */
  'omnibox:suggest': { args: [text: string]; result: OmniboxSuggestion[] }
  /** Find bar → main: search the tab (Cmd/Ctrl+F). `findNext` continues the current search. */
  'find:query': { args: [tabId: TabId, text: string, forward: boolean, findNext: boolean]; result: void }
  /** Find bar closed: clear the highlights, keep the selection. */
  'find:close': { args: []; result: void }
  /** Permission prompt answered (remembered for the site); null: dismissed, refused this time only. */
  'permission:answer': { args: [requestId: number, granted: boolean | null]; result: void }
  /** « Enregistrer le mot de passe ? » answered. */
  'passwords:answer': { args: [promptId: number, choice: SavePasswordChoice]; result: void }
  'downloads:getState': { args: []; result: DownloadInfo[] }
  'downloads:action': { args: [id: string, action: DownloadAction]; result: void }
  /** Toolbar zoom badge: back to 100 %. */
  'tabs:resetZoom': { args: [id: TabId]; result: void }
}

/** renderer → main, fire-and-forget (ipcRenderer.send / ipcMain.on). */
export interface SendChannels {
  'layout:update': LayoutInsets
}

/** main → renderer events (webContents.send / ipcRenderer.on). */
export interface EventChannels {
  'tabs:state': TabsState
  /** Cmd/Ctrl+L, new tab: focus and select the omnibox. */
  'omnibox:focus': null
  /** Favorites, folders or sidebar layout changed (sent to every window). */
  'sidebar:state': SidebarState
  /** Cmd/Ctrl+B. */
  'sidebar:toggle': null
  /** « Renommer le groupe » picked in the group's menu: the chip turns into a field. */
  'tabGroups:rename': { groupId: string }
  /** "Modifier…" picked in a native context menu: the renderer opens the editor at the tile. */
  'sidebar:edit': { kind: 'favorite' | 'folder'; id: string }
  /** Overlay view only: the popover to render, or null once hidden. */
  'overlay:show': OverlayRequest | null
  /** Overlay view only: results of the find bar's search. */
  'find:result': FindResult
  /** Downloads list changed (chrome UIs and overlays). */
  'downloads:state': DownloadInfo[]
}

export type InvokeChannel = keyof InvokeChannels
export type SendChannel = keyof SendChannels
export type EventChannel = keyof EventChannels

export const INVOKE_CHANNELS = [
  'tabs:create',
  'tabs:activate',
  'tabGroups:update',
  'tabGroups:showMenu',
  'tabs:close',
  'tabs:navigate',
  'tabs:back',
  'tabs:forward',
  'tabs:reload',
  'tabs:stop',
  'tabs:closeAll',
  'tabs:setPinned',
  'tabs:toggleMute',
  'tabs:move',
  'tabs:showContextMenu',
  'tabs:getState',
  'widevine:getStatus',
  'sidebar:getState',
  'sidebar:setLayout',
  'favorites:add',
  'favorites:addFromTab',
  'favorites:update',
  'favorites:remove',
  'favorites:move',
  'favorites:open',
  'favorites:showContextMenu',
  'folders:add',
  'folders:update',
  'folders:setCollapsed',
  'folders:move',
  'folders:showContextMenu',
  'overlay:open',
  'overlay:close',
  'overlay:hide',
  'omnibox:suggest',
  'find:query',
  'find:close',
  'permission:answer',
  'passwords:answer',
  'downloads:getState',
  'downloads:action',
  'tabs:resetZoom'
] as const satisfies readonly InvokeChannel[]

export const SEND_CHANNELS = ['layout:update'] as const satisfies readonly SendChannel[]
export const EVENT_CHANNELS = [
  'tabs:state',
  'omnibox:focus',
  'sidebar:state',
  'sidebar:toggle',
  'sidebar:edit',
  'tabGroups:rename',
  'overlay:show',
  'find:result',
  'downloads:state'
] as const satisfies readonly EventChannel[]

/** Shape of `window.zak` exposed by src/preload/chrome.ts. */
export interface ZakApi {
  /** Interface language (src/shared/i18n.ts). */
  lang: 'fr' | 'en'
  /** « 🏠 Perso » when there are several profiles (src/main/profiles/), else null. */
  profile: string | null
  invoke<C extends InvokeChannel>(
    channel: C,
    ...args: InvokeChannels[C]['args']
  ): Promise<InvokeChannels[C]['result']>
  send<C extends SendChannel>(channel: C, payload: SendChannels[C]): void
  on<C extends EventChannel>(channel: C, listener: (payload: EventChannels[C]) => void): () => void
}

/**
 * main ↔ extension service workers (src/preload/extension-sw.ts).
 * Fills gaps of electron-chrome-extensions / Electron that break real extensions:
 * Electron's native `sender.tab` is always `active: false, windowId: 0`, and
 * `chrome.tabs.onHighlighted` never fires. Dashlane only autofills "active" tabs.
 */
export interface ExtensionTabState {
  windowId: number
  index: number
  active: boolean
}
export interface ExtensionWorkerChannels {
  /** worker → main (invoke): current state of every tab, keyed by tab id. */
  'zak-ext:get-tabs': { args: []; result: Record<number, ExtensionTabState> }
  /** main → worker: tab state changed. */
  'zak-ext:tabs': Record<number, ExtensionTabState>
  /** main → worker: a tab became the highlighted (active) tab of its window. */
  'zak-ext:highlighted': { windowId: number; tabIds: number[] }
}
export const EXT_GET_TABS = 'zak-ext:get-tabs' satisfies keyof ExtensionWorkerChannels
export const EXT_TABS = 'zak-ext:tabs' satisfies keyof ExtensionWorkerChannels
export const EXT_HIGHLIGHTED = 'zak-ext:highlighted' satisfies keyof ExtensionWorkerChannels

/**
 * Internal pages (zak://extensions…) → main. Tab pages get no preload (CLAUDE.md §3), so these
 * pages call main with `fetch(POST /api/<route>)` on their own origin, served by the zak:
 * protocol handler (src/main/internal/InternalProtocol.ts). The scheme is not CORS-enabled and every
 * call must carry INTERNAL_API_HEADER, so a web page can neither read nor trigger these routes.
 */
export const INTERNAL_SCHEME = 'zak'
export const INTERNAL_API_HEADER = 'x-zak-internal'

/** Route `<page>/<name>` is served at `zak://<page>/api/<name>`. */
export interface InternalApiRoutes {
  'extensions/list': { body: null; result: ExtensionInfo[] }
  'extensions/setEnabled': { body: { id: string; enabled: boolean }; result: null }
  'extensions/uninstall': { body: { id: string }; result: null }
  'extensions/openOptions': { body: { id: string }; result: null }
  /** Opens the Chrome Web Store in a new tab. */
  'extensions/openStore': { body: null; result: null }
  /** « Charger une extension non empaquetée… » (folder picker); null when cancelled. */
  'extensions/loadUnpacked': { body: null; result: string | null }
  'extensions/reload': { body: { id: string }; result: null }
  'settings/get': { body: null; result: BrowserSettings }
  /** Saves the PiP section; returns it normalized (cleaned-up domains). */
  'settings/setPip': { body: PipSettings; result: PipSettings }
  /** zak://history: newest first, `before` (visit time) pages through older entries. */
  'settings/setGeneral': { body: Partial<GeneralSettings>; result: GeneralSettings }
  /** Opens a folder picker; returns the (possibly unchanged) section. */
  'settings/chooseDownloadDir': { body: null; result: GeneralSettings }
  'settings/removePermission': { body: { origin: string; permission: PermissionKind }; result: SitePermission[] }
  'settings/clearData': { body: ClearDataRequest; result: null }
  'settings/setSidebarCollapsed': { body: { collapsed: boolean }; result: null }
  /** Installed extensions (a page only reaches its own routes, so not extensions/list). */
  'settings/listExtensions': { body: null; result: ExtensionInfo[] }
  /** Which extension icons the sidebar shows, and in what order. */
  'settings/setExtensionBar': { body: ExtensionBarSettings; result: ExtensionBarSettings }
  /** Picks a bookmarks HTML file and imports it; null when cancelled. */
  'settings/importBookmarks': { body: null; result: { favorites: number; folders: number } | null }
  /** « Personnaliser avec Claude Code ou Codex »: where the settings file is, open or show it. */
  'settings/customizeInfo': { body: null; result: { settingsPath: string } }
  'settings/openSettingsFile': { body: { reveal: boolean }; result: null }
  /** Zak's MCP server: state, on/off, a new token. `error` when it couldn't start. */
  'settings/mcp': { body: null; result: McpState }
  'settings/setMcp': { body: { enabled: boolean }; result: McpState }
  'settings/newMcpToken': { body: null; result: McpState }
  /** Mods (src/main/mods/): what the mods folder holds, and which theme / new tab is in use. */
  'settings/mods': { body: null; result: { dir: string; mods: ModInfo[] } }
  'settings/selectMod': { body: { kind: 'theme' | 'newtab'; id: string | null }; result: { dir: string; mods: ModInfo[] } }
  'settings/openModsFolder': { body: null; result: null }
  /** Profiles (src/main/profiles/): the list, and the one of this window. */
  'settings/profiles': { body: null; result: { current: string; list: ProfileInfo[] } }
  'settings/createProfile': { body: { name: string; emoji: string; open: boolean }; result: { current: string; list: ProfileInfo[] } }
  'settings/updateProfile': { body: { id: string; name?: string; emoji?: string }; result: { current: string; list: ProfileInfo[] } }
  'settings/removeProfile': { body: { id: string }; result: { current: string; list: ProfileInfo[] } }
  'settings/openProfile': { body: { id: string }; result: null }
  /** Other Chromium browsers installed (Chrome, Edge, Brave, Arc…) and their profiles. */
  'settings/importSources': { body: null; result: ImportSource[] }
  /** Imports a profile's favorites and/or history (`profile` = a path from importSources). */
  'settings/importFrom': {
    body: { profile: string; bookmarks: boolean; history: boolean }
    result: { favorites: number; folders: number; pages: number }
  }
  'settings/defaultBrowser': { body: null; result: DefaultBrowserStatus }
  /** macOS shows a confirmation dialog; Windows opens its default apps settings. */
  'settings/makeDefaultBrowser': { body: null; result: DefaultBrowserStatus }
  'history/search': { body: { query: string; before: number | null }; result: HistoryEntry[] }
  'history/remove': { body: { ids: number[] }; result: null }
  'history/clear': { body: { period: ClearPeriod }; result: null }
  /** New tab page: « Reprendre la navigation » available, and « Récemment ». */
  'newtab/state': { body: null; result: { canReopenSession: boolean; recent: HistoryEntry[] } }
  'newtab/reopenSession': { body: null; result: null }
  /** The page's « Où voulez-vous aller ? » field: same suggestions as the omnibox. */
  'newtab/suggest': { body: { text: string }; result: OmniboxSuggestion[] }
  /** zak://passwords. `reveal` asks the system (Touch ID…) first, null when refused. */
  'passwords/list': { body: null; result: SavedLogin[] }
  'passwords/reveal': { body: { id: string }; result: string | null }
  'passwords/add': { body: { url: string; username: string; password: string }; result: SavedLogin[] }
  'passwords/update': { body: { id: string; username?: string; password?: string }; result: SavedLogin[] }
  'passwords/remove': { body: { id: string }; result: SavedLogin[] }
  'passwords/import': { body: null; result: { count: number } | null }
  'passwords/export': { body: null; result: { count: number } | null }
  /** zak://welcome, shown at the first launch: same actions as the settings. */
  'welcome/state': { body: null; result: { sources: ImportSource[]; defaultBrowser: DefaultBrowserStatus; language: GeneralSettings['language'] } }
  'welcome/importFrom': { body: { profile: string }; result: { favorites: number; folders: number; pages: number } }
  'welcome/makeDefaultBrowser': { body: null; result: DefaultBrowserStatus }
  'welcome/setLanguage': { body: { language: GeneralSettings['language'] }; result: null }
  /** Warning page of a dangerous site: « Continuer quand même » for this session. */
  'error/proceed': { body: { url: string }; result: null }
  /** « Retour en lieu sûr »: back to the last page before the dangerous one (`page` = the warning's URL). */
  'error/leave': { body: { page: string }; result: null }
}
export type InternalApiRoute = keyof InternalApiRoutes

export const INTERNAL_API_ROUTES = [
  'extensions/list',
  'extensions/setEnabled',
  'extensions/uninstall',
  'extensions/openOptions',
  'extensions/openStore',
  'extensions/loadUnpacked',
  'extensions/reload',
  'settings/get',
  'settings/setPip',
  'settings/setGeneral',
  'settings/chooseDownloadDir',
  'settings/removePermission',
  'settings/clearData',
  'settings/setSidebarCollapsed',
  'settings/listExtensions',
  'settings/setExtensionBar',
  'settings/importBookmarks',
  'settings/mcp',
  'settings/setMcp',
  'settings/newMcpToken',
  'settings/mods',
  'settings/selectMod',
  'settings/openModsFolder',
  'settings/customizeInfo',
  'settings/openSettingsFile',
  'settings/profiles',
  'settings/createProfile',
  'settings/updateProfile',
  'settings/removeProfile',
  'settings/openProfile',
  'settings/importSources',
  'settings/importFrom',
  'settings/defaultBrowser',
  'settings/makeDefaultBrowser',
  'history/search',
  'history/remove',
  'history/clear',
  'newtab/state',
  'newtab/reopenSession',
  'newtab/suggest',
  'passwords/list',
  'passwords/reveal',
  'passwords/add',
  'passwords/update',
  'passwords/remove',
  'passwords/import',
  'passwords/export',
  'welcome/state',
  'welcome/importFrom',
  'welcome/makeDefaultBrowser',
  'welcome/setLanguage',
  'error/proceed',
  'error/leave'
] as const satisfies readonly InternalApiRoute[]

/** Internal pages: host → HTML entry of the renderer build (electron.vite.config.ts). */
export const INTERNAL_PAGES = {
  newtab: 'newtab.html',
  extensions: 'extensions.html',
  settings: 'settings.html',
  history: 'history.html',
  passwords: 'passwords.html',
  welcome: 'welcome.html',
  error: 'error.html'
} as const
export type InternalPage = keyof typeof INTERNAL_PAGES
export const NEWTAB_PAGE_URL = `${INTERNAL_SCHEME}://newtab/`
export const EXTENSIONS_PAGE_URL = `${INTERNAL_SCHEME}://extensions/`
export const SETTINGS_PAGE_URL = `${INTERNAL_SCHEME}://settings/`
export const HISTORY_PAGE_URL = `${INTERNAL_SCHEME}://history/`
export const PASSWORDS_PAGE_URL = `${INTERNAL_SCHEME}://passwords/`
export const WELCOME_PAGE_URL = `${INTERNAL_SCHEME}://welcome/`
export const ERROR_PAGE_URL = `${INTERNAL_SCHEME}://error/`
