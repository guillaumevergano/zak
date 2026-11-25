import { getLang, t } from '@shared/i18n'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { BrowserWindow, nativeTheme, type BaseWindow, type Menu, type Session, type WebContents } from 'electron'
import type { EventChannel, EventChannels } from '@shared/ipc'
import type { OverlayRequest, TabId, TabsPosition } from '@shared/types'
import { PRIVATE_NEW_TAB_URL } from '@shared/url'
import type { SessionTab } from '../store/sessions'
import { TabManager } from '../tabs/TabManager'
import type { PipController } from '../pip/PipController'
import type { SessionManager } from '../sessions/SessionManager'
import { buildPageMenu, buildGroupMenu, buildTabMenu } from '../menu/ContextMenu'
import { Overlay } from './Overlay'

export interface BrowserWindowHandle {
  window: BrowserWindow
  tabs: TabManager
  overlay: Overlay
  /** Private window (CLAUDE.md §6.3): its own in-memory session, no extensions, nothing recorded. */
  private: boolean
  /** Where its tabs browse: `persist:main`, or the window's private session. */
  session: Session
}

export interface CreateWindowOptions {
  private?: boolean
  /** Tabs to open (session restore, reopened window), instead of `urls`. */
  tabs?: SessionTab[]
}

interface WindowManagerEvents {
  'window-created': [handle: BrowserWindowHandle]
  /** The window is about to close (its tabs are still there). */
  'window-closing': [handle: BrowserWindowHandle]
  /** Tabs of a window changed (list, URLs, titles…). */
  'tabs-changed': [handle: BrowserWindowHandle]
  /** An overlay popover or panel went away (closed, replaced or hidden). */
  'overlay-hidden': [handle: BrowserWindowHandle, request: OverlayRequest]
  'tab-created': [webContents: WebContents, window: BaseWindow]
  'tab-selected': [webContents: WebContents]
  'tab-removed': [webContents: WebContents]
  'tab-context-menu': [webContents: WebContents, params: Electron.ContextMenuParams, menu: Menu]
  'tab-favicon': [pageUrl: string, favicon: string]
}

export class WindowManager extends EventEmitter<WindowManagerEvents> {
  /** « 🏠 Perso » when there are several profiles (window titles, chrome UI badge), else null. */
  static profileLabel: () => string | null = () => null

  private handles = new Map<number, BrowserWindowHandle>()
  /** Tabs at the top (a 44 px strip) or in the sidebar (a 36 px title bar): Windows' caption buttons follow. */
  private tabsPosition: TabsPosition = 'top'

  /** Page context menu → "Ajouter aux favoris de la sidebar" (set by the sidebar controller). */
  addLinkToFavorites: ((url: string, title: string) => void) | null = null

  constructor(
    private readonly sessions: SessionManager,
    private readonly pip: PipController
  ) {
    super()
  }

  create(urls: string[] = [], options: CreateWindowOptions = {}): BrowserWindowHandle {
    const isMac = process.platform === 'darwin'
    const isPrivate = options.private === true
    const browsingSession = isPrivate ? this.sessions.createPrivate() : this.sessions.getMain()
    const frameColor = isPrivate ? '#150C2B' : nativeTheme.shouldUseDarkColors ? '#1C131C' : '#2E1F2D'
    const window = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 480,
      minHeight: 320,
      show: false,
      title: 'Zak',
      titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
      // Design (CLAUDE.md §7): an opaque plum frame, the traffic lights (or, elsewhere, the caption
      // buttons) in the tab strip. Private windows: a darker frame (forced dark theme, §6.3).
      backgroundColor: frameColor,
      ...(isMac
        ? { trafficLightPosition: { x: 16, y: 11 } }
        : { titleBarOverlay: { color: frameColor, symbolColor: isPrivate ? '#C9BCE8' : '#D9C9D4', height: titleBarHeight(this.tabsPosition) } }),
      webPreferences: {
        // The chrome UI lives in the default session; tabs live in `persist:main`.
        preload: join(__dirname, '../preload/chrome.js'),
        additionalArguments: [`--zak-lang=${getLang()}`, `--zak-profile-label=${WindowManager.profileLabel() ?? ''}`],
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    const tabs = new TabManager(window, browsingSession)
    if (isPrivate) tabs.newTabUrl = PRIVATE_NEW_TAB_URL
    tabs.focusChrome = () => {
      if (!window.isDestroyed()) window.webContents.focus()
    }
    const overlay = new Overlay(window, () => (tabs.getActive() ?? window.webContents).focus())
    const handle: BrowserWindowHandle = { window, tabs, overlay, private: isPrivate, session: browsingSession }
    this.handles.set(window.id, handle)
    overlay.onHidden = (request) => this.emit('overlay-hidden', handle, request)
    window.webContents.once('did-finish-load', () => overlay.preload())

    const push = (): void => {
      if (window.isDestroyed()) return
      const state = tabs.getState()
      this.sendTo(window, 'tabs:state', state)
      const active = state.tabs.find((t) => t.id === state.activeId)
      const profile = WindowManager.profileLabel()
      const app = isPrivate ? t('Zak (navigation privée)') : profile ? `Zak — ${profile}` : 'Zak'
      window.setTitle(active ? `${active.title} — ${app}` : app)
      this.emit('tabs-changed', handle)
    }
    tabs.on('changed', push)
    tabs.on('scroll', (tabId, scroll) => {
      if (!window.isDestroyed()) this.sendTo(window, 'tabs:scroll', { tabId, scroll })
    })
    tabs.on('created', (wc) => this.emit('tab-created', wc, window))
    tabs.on('removed', (wc) => this.emit('tab-removed', wc))
    tabs.on('empty', () => window.close())
    // A private window records nothing, not even a favorite's favicon.
    if (!isPrivate) tabs.on('favicon', (pageUrl, favicon) => this.emit('tab-favicon', pageUrl, favicon))
    tabs.beforeHide = (previous) => this.pip.onTabLeaving(previous)
    tabs.on('activated', (_previous, next) => {
      // Panels tied to a tab (find bar, suggestions, permission prompt) don't follow a tab switch.
      if (overlay.showing() && 'frame' in overlay.showing()!) overlay.hide()
      this.pip.onTabActivated(next)
      this.emit('tab-selected', next)
    })
    tabs.on('context-menu', (wc, params) => {
      buildPageMenu(tabs, wc, params, {
        addExtensionItems: (menu) => this.emit('tab-context-menu', wc, params, menu),
        addLinkToFavorites: this.addLinkToFavorites,
        openInPrivateWindow: isPrivate ? null : (url) => this.create([url], { private: true })
      }).popup({ window })
    })

    window.on('minimize', () => this.pip.onWindowMinimized(tabs.getActive()))
    window.on('restore', () => this.pip.onWindowRestored(tabs.getActive()))
    window.on('close', () => this.emit('window-closing', handle))
    window.on('closed', () => {
      overlay.destroy()
      tabs.closeAll()
      this.handles.delete(window.id)
      if (isPrivate) void this.sessions.destroyPrivate(browsingSession)
    })
    window.once('ready-to-show', () => window.show())

    // The chrome UI reads `?private=1` to switch to the dark private theme and badge.
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const query: Record<string, string> = isPrivate ? { private: '1' } : {}
    if (devUrl) void window.loadURL(isPrivate ? `${devUrl}?private=1` : devUrl)
    else void window.loadFile(join(__dirname, '../renderer/index.html'), { query })

    // Create tabs once the chrome UI is loaded so it receives the first state push.
    window.webContents.once('did-finish-load', () => {
      if (options.tabs && options.tabs.length > 0) {
        const ids: TabId[] = []
        for (const tab of options.tabs) {
          if (tab.group) tabs.restoreGroup(tab.group)
          ids.push(tabs.create(tab.url, { active: false, pinned: tab.pinned, groupId: tab.group?.id ?? null }).id)
        }
        // Split views: two neighbours saved with the same split id (a new tab page isn't saved).
        options.tabs.forEach((tab, i) => {
          const next = options.tabs![i + 1]
          if (tab.split && next?.split?.id === tab.split.id) tabs.split(ids[i]!, ids[i + 1]!, { ratio: tab.split.ratio, activate: false })
        })
        // The saved active tab, or else the first one not hidden in a folded group, or else a new tab.
        const saved = options.tabs.findIndex((t) => t.active)
        const active = saved !== -1 ? saved : options.tabs.findIndex((t) => !t.group?.collapsed)
        const id = active === -1 ? undefined : tabs.getState().tabs[active]?.id
        if (id !== undefined) tabs.activate(id)
        else tabs.create()
        // Creating the first tab showed it, which unfolded its group: fold back what was folded.
        for (const group of new Set(options.tabs.map((t) => t.group))) {
          if (group?.collapsed) tabs.updateGroup(group.id, { collapsed: true })
        }
      } else if (urls.length === 0) {
        tabs.create(undefined, { focusPage: false })
        this.focusOmnibox(handle)
      } else {
        urls.forEach((url, i) => tabs.create(url, { active: i === 0 }))
      }
    })

    this.emit('window-created', handle)
    return handle
  }

  all(): BrowserWindowHandle[] {
    return [...this.handles.values()]
  }

  /**
   * Tabs moved between the top strip and the sidebar: the band at the top changes height, and so do
   * the caption buttons drawn over it on Windows and Linux. On macOS the traffic lights stay put
   * (y 11 sits at the middle of both bands).
   */
  setTabsPosition(position: TabsPosition): void {
    if (position === this.tabsPosition) return
    this.tabsPosition = position
    if (process.platform === 'darwin') return
    for (const { window } of this.handles.values()) {
      if (!window.isDestroyed()) window.setTitleBarOverlay({ height: titleBarHeight(position) })
    }
  }

  /** The window of a chrome UI or overlay webContents. */
  fromWebContents(sender: WebContents): BrowserWindowHandle | undefined {
    for (const handle of this.handles.values()) {
      if (handle.window.webContents === sender || handle.overlay.owns(sender)) return handle
    }
    return undefined
  }

  fromWindow(window: BaseWindow): BrowserWindowHandle | undefined {
    return this.handles.get(window.id)
  }

  fromTab(tab: WebContents): BrowserWindowHandle | undefined {
    for (const handle of this.handles.values()) if (handle.tabs.has(tab)) return handle
    return undefined
  }

  /** The focused browser window, if any (popups and DevTools are not browser windows). */
  focused(): BrowserWindowHandle | undefined {
    const focused = BrowserWindow.getFocusedWindow()
    return focused ? this.handles.get(focused.id) : undefined
  }

  focusedOrFirst(): BrowserWindowHandle {
    return this.focused() ?? this.handles.values().next().value ?? this.create()
  }

  /**
   * Where extensions and their pages open (Web Store, options, chrome.tabs.create…): the focused
   * window unless it is private, else the most recent normal window, else a new one.
   */
  focusedNormal(): BrowserWindowHandle {
    const focused = this.focused()
    if (focused && !focused.private) return focused
    const normal = [...this.handles.values()].filter((h) => !h.private)
    return normal[normal.length - 1] ?? this.create()
  }

  /**
   * Links and pages sent by other apps (Zak as the default browser): new tabs in the focused
   * normal window, else the most recent one, brought to the front; a new window if there is none.
   * No URL (the app launched again from Explorer): just bring a window to the front.
   */
  openFromSystem(urls: string[]): void {
    const focused = this.focused()
    const target = focused && !focused.private ? focused : [...this.handles.values()].filter((h) => !h.private).pop()
    if (!target) {
      this.create(urls)
      return
    }
    for (const url of urls) target.tabs.create(url)
    if (target.window.isMinimized()) target.window.restore()
    target.window.show()
    target.window.focus()
  }

  /** Tabs of normal windows only (extensions never see private tabs). */
  isPrivateTab(tab: WebContents): boolean {
    return this.fromTab(tab)?.private ?? false
  }

  // ── Commands shared by the app menu, shortcuts and IPC ──────────────────────────

  newTab(handle: BrowserWindowHandle): void {
    handle.tabs.create(undefined, { focusPage: false })
    this.focusOmnibox(handle)
  }

  /** Focus the chrome UI and select the address field (Cmd/Ctrl+L, new tab). */
  focusOmnibox(handle: BrowserWindowHandle): void {
    handle.window.webContents.focus()
    this.sendTo(handle.window, 'omnibox:focus', null)
  }

  showTabMenu(handle: BrowserWindowHandle, id: TabId): void {
    const newTabBeside = (): void => {
      const tab = handle.tabs.create(undefined, { focusPage: false, index: handle.tabs.indexOf(id) + 1 })
      handle.tabs.split(id, tab.id)
      this.focusOmnibox(handle)
    }
    buildTabMenu(handle.tabs, id, newTabBeside).popup({ window: handle.window })
  }

  showGroupMenu(handle: BrowserWindowHandle, groupId: string): void {
    buildGroupMenu(handle.tabs, groupId, () => this.send(handle, 'tabGroups:rename', { groupId })).popup({ window: handle.window })
  }

  /** Sends to the chrome UI of every browser window. */
  broadcast<C extends EventChannel>(channel: C, payload: EventChannels[C]): void {
    for (const handle of this.handles.values()) this.sendTo(handle.window, channel, payload)
  }

  send<C extends EventChannel>(handle: BrowserWindowHandle, channel: C, payload: EventChannels[C]): void {
    this.sendTo(handle.window, channel, payload)
  }

  private sendTo<C extends EventChannel>(window: BrowserWindow, channel: C, payload: EventChannels[C]): void {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

/** Height of the plum band at the top: the tab strip, or the title bar when tabs are in the sidebar. */
const titleBarHeight = (position: TabsPosition): number => (position === 'sidebar' ? 36 : 44)
