import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, components, dialog, ipcMain, nativeTheme, type IpcMainInvokeEvent } from 'electron'
import { SETTINGS_PAGE_URL, WELCOME_PAGE_URL, type InvokeChannel, type InvokeChannels, type SendChannel, type SendChannels } from '@shared/ipc'
import type { WidevineStatus } from '@shared/types'
import { resolveLang, setLang, t, type LangSetting } from '@shared/i18n'
import { chromeUserAgent, identitySettled } from './userAgent'
import { SessionManager } from './sessions/SessionManager'
import { WindowManager } from './windows/WindowManager'
import { ExtensionsHost } from './extensions/ExtensionsHost'
import { PipController } from './pip/PipController'
import { enableAdBlocker } from './adblock/AdBlocker'
import { SafeBrowsing, leaveDangerousPage } from './safety/SafeBrowsing'
import { detectBrowsers, readChromiumBookmarks, readChromiumHistory } from './import/chromium'
import { PasswordStore } from './passwords/PasswordStore'
import { startCrashReporter } from './support/report'
import { DEFAULT_PROFILE_ID, Profiles } from './profiles/Profiles'
import { PasswordManager } from './passwords/PasswordManager'
import { keychainCipher, passwordRoutes } from './passwords/routes'
import type { ImportSource } from '@shared/types'

/**
 * The welcome page opens once, at the first launch without a previous session. Not in the e2e
 * tests (they expect a new tab), unless ZAK_ONBOARDING asks for it.
 */
function shouldWelcome(settings: SettingsStore): boolean {
  if (process.env['ZAK_E2E'] === '1' && process.env['ZAK_ONBOARDING'] !== '1') return false
  return !settings.isOnboarded()
}

/** Chromium browsers to import from (ZAK_IMPORT_HOME: a fake home folder for the e2e tests). */
function importSources(): ImportSource[] {
  const home = process.env['ZAK_IMPORT_HOME'] ?? app.getPath('home')
  const localAppData = process.env['ZAK_IMPORT_HOME'] ?? process.env['LOCALAPPDATA']
  return detectBrowsers({ platform: process.platform, home, localAppData }).map((b) => ({ browser: b.name, profiles: b.profiles }))
}
import { installAppMenu } from './menu/AppMenu'
import { showSplash } from './windows/Splash'
import { Updater } from './updates/Updater'
import { installShortcuts } from './shortcuts/Shortcuts'
import { openDatabase } from './store/db'
import { FavoritesStore } from './store/favorites'
import { HistoryStore } from './store/history'
import { SitesStore } from './store/sites'
import { SessionStore } from './store/sessions'
import { SessionRestore } from './sessions/SessionRestore'
import { reloadPage, TabManager } from './tabs/TabManager'
import { recordHistory } from './history/HistoryRecorder'
import { FindController } from './find/FindController'
import { ZoomController } from './tabs/zoom'
import { PermissionsHandler } from './permissions/PermissionsHandler'
import { DownloadsManager } from './downloads/DownloadsManager'
import { suggest } from './omnibox/suggest'
import { SettingsStore } from './store/settings'
import { SidebarController } from './sidebar/SidebarController'
import { handleInternalProtocol, registerInternalScheme, type InternalApiHandlers } from './internal/InternalProtocol'
import { defaultBrowserStatus, LinkReceiver, makeDefaultBrowser } from './system/DefaultBrowser'

// Separate profile for the e2e tests (tests/e2e), so they never touch the real one.
// Downloads too, so tests never write into the real Downloads folder.
const testProfile = process.env['ZAK_USER_DATA']
if (testProfile) {
  app.setPath('userData', testProfile)
  mkdirSync(join(testProfile, 'Downloads'), { recursive: true })
  app.setPath('downloads', join(testProfile, 'Downloads'))
}

// Profiles (profiles/Profiles.ts): each one its own user data folder and process.
const profiles = new Profiles(process.env['ZAK_PROFILES_DIR'] ?? join(app.getPath('appData'), 'Zak Profiles'))
const currentProfile = testProfile ? DEFAULT_PROFILE_ID : Profiles.fromArgv(process.argv)
if (currentProfile !== DEFAULT_PROFILE_ID) app.setPath('userData', profiles.dir(currentProfile))

// Must be set before any session/webContents exists (CLAUDE.md §6.5).
app.userAgentFallback = chromeUserAgent()
// zak://extensions… (privileged schemes must be registered before ready).
registerInternalScheme()
// Links from other apps once Zak is the default browser (they can arrive before ready).
// One process per profile: a second launch hands its URLs to this one and quits.
// Crashes are written locally, never uploaded (support/report.ts).
startCrashReporter()
const links = new LinkReceiver()
const primaryInstance = links.install()

let widevine: WidevineStatus = { ready: false, detail: 'pending' }

const WIDEVINE_WAIT_MS = 20_000

async function waitForWidevine(): Promise<void> {
  try {
    // castLabs ECS: downloads/registers the Widevine CDM on first launch (can take a few seconds).
    // Never wait forever (offline, captive portal, slow server): open the browser after 20 s, the
    // download goes on and DRM videos play once it's done.
    const ready = components.whenReady().then(() => true)
    const late = new Promise<false>((resolve) => setTimeout(() => resolve(false), WIDEVINE_WAIT_MS).unref())
    if (!(await Promise.race([ready, late]))) {
      widevine = { ready: false, detail: 'still downloading' }
      void ready.then(() => (widevine = { ready: true, detail: JSON.stringify(components.status()) })).catch(() => {})
      return
    }
    widevine = { ready: true, detail: JSON.stringify(components.status()) }
  } catch (err) {
    widevine = { ready: false, detail: String(err) }
  }
  console.log('[widevine]', widevine)
}

function handle<C extends InvokeChannel>(
  channel: C,
  fn: (event: IpcMainInvokeEvent, ...args: InvokeChannels[C]['args']) => InvokeChannels[C]['result'] | Promise<InvokeChannels[C]['result']>
): void {
  ipcMain.handle(channel, (event, ...args) => fn(event, ...(args as InvokeChannels[C]['args'])))
}

function on<C extends SendChannel>(channel: C, fn: (event: Electron.IpcMainEvent, payload: SendChannels[C]) => void): void {
  ipcMain.on(channel, (event, payload) => fn(event, payload as SendChannels[C]))
}

interface Services {
  windows: WindowManager
  sidebar: SidebarController
  favorites: FavoritesStore
  history: HistoryStore
  settings: SettingsStore
  find: FindController
  zoom: ZoomController
  permissions: PermissionsHandler
  downloads: DownloadsManager
  passwords: PasswordManager
}

function registerIpc({ windows, sidebar, favorites, history, settings, find, zoom, permissions, downloads, passwords }: Services): void {
  const windowOf = (event: IpcMainInvokeEvent | Electron.IpcMainEvent) => {
    const handle = windows.fromWebContents(event.sender)
    if (!handle) throw new Error('IPC from unknown window')
    return handle
  }
  const tabsOf = (event: IpcMainInvokeEvent | Electron.IpcMainEvent) => windowOf(event).tabs

  handle('tabs:create', (e, url) => {
    if (url !== undefined) return tabsOf(e).create(url).id
    windows.newTab(windowOf(e))
    return tabsOf(e).getActiveId()!
  })
  handle('tabs:activate', (e, id, focusPage) => tabsOf(e).activate(id, focusPage !== false))
  handle('tabs:close', (e, id) => tabsOf(e).close(id))
  handle('tabs:navigate', (e, id, input) => tabsOf(e).navigate(id, input))
  handle('tabs:back', (e, id) => tabsOf(e).get(id)?.navigationHistory.goBack())
  handle('tabs:forward', (e, id) => tabsOf(e).get(id)?.navigationHistory.goForward())
  handle('tabs:reload', (e, id) => {
    const wc = tabsOf(e).get(id)
    if (wc) reloadPage(wc)
  })
  handle('tabs:stop', (e, id) => tabsOf(e).get(id)?.stop())
  handle('tabs:closeAll', (e) => tabsOf(e).closeAllButActive())
  handle('tabs:setPinned', (e, id, pinned) => tabsOf(e).setPinned(id, pinned))
  handle('tabs:toggleMute', (e, id) => tabsOf(e).toggleMute(id))
  handle('tabs:move', (e, id, index) => tabsOf(e).move(id, index))
  handle('tabs:showContextMenu', (e, id) => windows.showTabMenu(windowOf(e), id))
  handle('tabGroups:update', (e, groupId, changes) => tabsOf(e).updateGroup(groupId, changes))
  handle('tabGroups:showMenu', (e, groupId) => windows.showGroupMenu(windowOf(e), groupId))
  handle('tabs:getState', (e) => tabsOf(e).getState())
  handle('widevine:getStatus', () => widevine)

  handle('sidebar:getState', () => sidebar.state())
  handle('sidebar:setLayout', (_e, layout) => sidebar.setLayout(layout))
  handle('favorites:add', (_e, input) => sidebar.change(() => favorites.addFavorite(input)))
  handle('favorites:addFromTab', (e, tabId, folderId, index) => sidebar.addFromTab(windowOf(e), tabId, folderId, index))
  handle('favorites:update', (_e, id, input) => sidebar.change(() => favorites.updateFavorite(id, input)))
  handle('favorites:remove', (_e, id) => sidebar.change(() => favorites.removeFavorite(id)))
  handle('favorites:move', (_e, id, folderId, index) => sidebar.change(() => favorites.moveFavorite(id, folderId, index)))
  handle('favorites:open', (e, id, disposition) => sidebar.open(windowOf(e), id, disposition))
  handle('favorites:showContextMenu', (e, id) => sidebar.showFavoriteMenu(windowOf(e), id))
  handle('folders:add', (_e, input) => sidebar.change(() => favorites.addFolder(input)))
  handle('folders:update', (_e, id, input) => sidebar.change(() => favorites.updateFolder(id, input)))
  handle('folders:setCollapsed', (_e, id, collapsed) => sidebar.change(() => favorites.setFolderCollapsed(id, collapsed)))
  handle('folders:move', (_e, id, index) => sidebar.change(() => favorites.moveFolder(id, index)))
  handle('folders:showContextMenu', (e, id) => sidebar.showFolderMenu(windowOf(e), id))
  handle('overlay:open', (e, request) => windowOf(e).overlay.open(request))
  handle('overlay:close', (e) => windowOf(e).overlay.close())
  handle('overlay:hide', (e, kind) => {
    const { overlay } = windowOf(e)
    if (overlay.showing()?.kind === kind) overlay.hide()
  })
  handle('omnibox:suggest', (_e, text) => suggest(text, settings.getGeneral().searchEngine, favorites, history))
  handle('find:query', (e, tabId, text, forward, findNext) => find.query(windowOf(e), tabId, text, forward, findNext))
  handle('find:close', (e) => windowOf(e).overlay.close())
  handle('permission:answer', (_e, requestId, granted) => permissions.answer(requestId, granted))
  handle('passwords:answer', (_e, promptId, choice) => passwords.answer(promptId, choice))
  handle('downloads:getState', (e) => downloads.stateFor(windowOf(e).session))
  handle('downloads:action', (_e, id, action) => downloads.act(id, action))
  handle('tabs:resetZoom', (e, id) => {
    const wc = tabsOf(e).get(id)
    if (wc) zoom.change(wc, 0)
  })

  on('layout:update', (e, insets) => tabsOf(e).setInsets(insets))
}

app.whenReady().then(async () => {
  if (!primaryInstance) return
  const settings = new SettingsStore()
  // Interface language (ZAK_LANG: forced by the e2e tests, whose selectors are in French).
  setLang(resolveLang((process.env['ZAK_LANG'] as LangSetting | undefined) ?? settings.getGeneral().language, app.getLocale()))
  // Packaged builds get the icon from the bundle; in development, show it in the Dock too.
  if (!app.isPackaged && process.platform === 'darwin') app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  // Usually instant; on first launch the CDM download takes a few seconds: show why nothing opens.
  let splash: BrowserWindow | null = null
  const splashTimer = setTimeout(() => (splash = showSplash()), 400)
  await waitForWidevine()
  clearTimeout(splashTimer)

  const sessions = new SessionManager()
  const browsingSession = sessions.getMain()
  // Not awaited: the cached lists load in a moment, the first download must not delay the window.
  const safeBrowsing = new SafeBrowsing(() => settings.getGeneral().safeBrowsing)
  void safeBrowsing.start()
  const windows = new WindowManager(sessions, new PipController(() => settings.getPip()))
  const db = openDatabase(app.getPath('userData'))
  const favorites = new FavoritesStore(db)
  const history = new HistoryStore(db)
  const sites = new SitesStore(db)
  const session = new SessionRestore(new SessionStore(db), windows)
  sessionRestore = session
  TabManager.searchEngine = () => settings.getGeneral().searchEngine
  TabManager.sleepAfterMinutes = () => settings.getGeneral().sleepTabsAfter || null
  // e2e tests (ZAK_USER_DATA): put idle tabs to sleep now instead of waiting for the timer.
  if (testProfile) {
    Object.assign(globalThis, { zakSleepIdleTabs: () => windows.all().forEach((w) => w.tabs.sleepIdleTabs(Date.now() + 864e5)) })
  }
  nativeTheme.themeSource = settings.getGeneral().theme
  recordHistory(windows, history)
  const sidebar = new SidebarController(favorites, settings, windows)
  const find = new FindController(windows)
  const zoom = new ZoomController(sites, windows)
  const permissions = new PermissionsHandler(sites, windows)
  const downloads = new DownloadsManager(windows, () => settings.getGeneral().downloadDir)
  permissions.attach(browsingSession, false)
  downloads.attach(browsingSession)
  const passwordStore = new PasswordStore(db, keychainCipher)
  const passwords = new PasswordManager(passwordStore, windows, () => settings.getGeneral().savePasswords)
  registerIpc({ windows, sidebar, favorites, history, settings, find, zoom, permissions, downloads, passwords })
  const menuCommands = {
    find,
    zoom,
    session,
    updater: new Updater(),
    profiles: {
      list: () => profiles.list(),
      current: currentProfile,
      open: (id: string) => openProfile(id),
      manage: () => void windows.focusedNormal().tabs.create(`${SETTINGS_PAGE_URL}#profiles`)
    }
  }
  const refreshMenu = (): void => installAppMenu(windows, menuCommands)
  refreshMenu()
  const profileState = () => ({ current: currentProfile, list: profiles.list() })
  /** The menu lists the profiles; window titles show this one's name once there are several. */
  const profilesChanged = (): void => {
    const all = profiles.list()
    const mine = all.find((p) => p.id === currentProfile)
    WindowManager.profileLabel = () => (all.length > 1 && mine ? `${mine.emoji} ${mine.name}` : null)
    refreshMenu()
  }
  profilesChanged()
  /** Another profile opens in its own process (the running one shows a window instead). */
  const openProfile = (id: string): void => {
    if (id === currentProfile) windows.openFromSystem([])
    // e2e tests: record the launch instead of starting a process they can't control.
    else if (process.env['ZAK_E2E'] === '1') (globalThis as { zakOpenedProfiles?: string[] }).zakOpenedProfiles = [id]
    else {
      // The test profile override must not leak into the profile's own process.
      const { ZAK_USER_DATA: _ignored, ...env } = process.env
      profiles.open(id, { execPath: process.execPath, appPath: app.isPackaged ? null : app.getAppPath(), env })
    }
  }
  installShortcuts(windows)

  const extensions = new ExtensionsHost(browsingSession, windows, settings)
  await extensions.init()
  const importProfile = (profile: string, bookmarks: boolean, withHistory: boolean) => {
    // Only a profile found by importSources: the page cannot make main read any folder.
    if (!importSources().some((s) => s.profiles.some((p) => p.path === profile))) throw new Error(t('Profil inconnu'))
    const parsed = bookmarks ? readChromiumBookmarks(profile) : null
    const added = parsed ? sidebar.importParsed(parsed) : { favorites: 0, folders: 0 }
    const pages = withHistory ? history.importVisits(readChromiumHistory(profile)) : 0
    return { ...added, pages }
  }
  const internalApi: InternalApiHandlers = {
    'extensions/list': () => extensions.list(),
    'extensions/setEnabled': async ({ id, enabled }) => {
      await extensions.setEnabled(id, enabled)
      return null
    },
    'extensions/uninstall': async ({ id }) => {
      await extensions.uninstall(id)
      return null
    },
    'extensions/openOptions': ({ id }) => {
      extensions.openOptions(id)
      return null
    },
    'extensions/openStore': () => {
      extensions.openStore()
      return null
    },
    'settings/get': () => ({
      general: settings.getGeneral(),
      pip: settings.getPip(),
      permissions: sites.permissions(),
      sidebarCollapsed: settings.getSidebar().collapsed,
      extensionBar: settings.getExtensionBar()
    }),
    'settings/listExtensions': () => extensions.list(),
    'settings/setExtensionBar': (bar) => sidebar.change(() => settings.setExtensionBar(bar)),
    'settings/importBookmarks': async () => {
      const result = await dialog.showOpenDialog({
        title: t('Importer des favoris'),
        properties: ['openFile'],
        filters: [{ name: t('Favoris (HTML)'), extensions: ['html', 'htm'] }]
      })
      return result.canceled || !result.filePaths[0] ? null : sidebar.importBookmarks(result.filePaths[0])
    },
    'settings/profiles': () => profileState(),
    'settings/createProfile': ({ name, emoji, open }) => {
      const profile = profiles.create(name, emoji)
      profilesChanged()
      if (open) openProfile(profile.id)
      return profileState()
    },
    'settings/updateProfile': ({ id, name, emoji }) => {
      profiles.update(id, { name, emoji })
      profilesChanged()
      return profileState()
    },
    'settings/removeProfile': ({ id }) => {
      profiles.remove(id, currentProfile)
      profilesChanged()
      return profileState()
    },
    'settings/openProfile': ({ id }) => {
      openProfile(id)
      return null
    },
    'settings/importSources': () => importSources(),
    'settings/importFrom': ({ profile, bookmarks, history: withHistory }) => importProfile(profile, bookmarks, withHistory),
    'welcome/state': () => ({
      sources: importSources(),
      defaultBrowser: defaultBrowserStatus(),
      language: settings.getGeneral().language
    }),
    'welcome/importFrom': ({ profile }) => importProfile(profile, true, true),
    'welcome/makeDefaultBrowser': () => makeDefaultBrowser(),
    'welcome/setLanguage': ({ language }) => {
      settings.setGeneral({ language })
      return null
    },
    'settings/setSidebarCollapsed': ({ collapsed }) => {
      sidebar.setLayout({ ...settings.getSidebar(), collapsed })
      return null
    },
    'settings/setGeneral': (patch) => {
      // The folder only changes through the picker below.
      const { downloadDir: _ignored, ...rest } = patch
      const general = settings.setGeneral(rest)
      nativeTheme.themeSource = general.theme
      return general
    },
    'settings/chooseDownloadDir': async () => {
      const current = settings.getGeneral()
      const result = await dialog.showOpenDialog({
        title: t('Dossier de téléchargement'),
        defaultPath: current.downloadDir,
        properties: ['openDirectory', 'createDirectory']
      })
      return result.canceled || !result.filePaths[0] ? current : settings.setGeneral({ downloadDir: result.filePaths[0] })
    },
    'settings/removePermission': ({ origin, permission }) => {
      sites.removePermission(origin, permission)
      return sites.permissions()
    },
    'settings/clearData': async ({ period, history: clearHistory, siteData, cache }) => {
      if (clearHistory) history.clear(period)
      // Electron can't clear site data or cache by time range: these are always cleared entirely.
      if (siteData) await browsingSession.clearStorageData()
      if (cache) await browsingSession.clearCache()
      return null
    },
    'settings/setPip': (pip) => settings.setPip(pip),
    'settings/defaultBrowser': () => defaultBrowserStatus(),
    'settings/makeDefaultBrowser': () => makeDefaultBrowser(),
    'history/search': ({ query, before }) => history.search(query, before),
    'history/remove': ({ ids }) => {
      history.remove(ids)
      return null
    },
    'history/clear': ({ period }) => {
      history.clear(period)
      return null
    },
    'newtab/state': () => ({ canReopenSession: session.canReopenPrevious(), recent: history.recentByHost(4) }),
    'newtab/suggest': ({ text }) => suggest(text, settings.getGeneral().searchEngine, favorites, history),
    'newtab/reopenSession': () => {
      session.reopenPrevious()
      return null
    },
    ...passwordRoutes(passwordStore),
    'error/proceed': ({ url }) => {
      safeBrowsing.allow(url)
      return null
    },
    'error/leave': ({ page }) => {
      leaveDangerousPage(page)
      return null
    }
  }
  handleInternalProtocol(browsingSession, internalApi)
  const guard = safeBrowsing.guard.bind(safeBrowsing)
  await enableAdBlocker(browsingSession, guard)
  // Private windows (§6.3): internal pages and the built-in ad blocker, but no extensions.
  sessions.onPrivateSession = (ses) => {
    handleInternalProtocol(ses, internalApi)
    void enableAdBlocker(ses, guard)
    permissions.attach(ses, true)
    downloads.attach(ses)
  }

  const restored = session.launchWindows(settings.getGeneral().startup)
  // A link that launched the app opens after the restored tabs (in the last window), or alone.
  const launchUrls = links.takePending()
  if (restored.length > 0) {
    restored.forEach((tabs, i) => {
      const opened = i === restored.length - 1 ? launchUrls : []
      const added = opened.map((url, j) => ({ url, title: url, pinned: false, active: j === 0 }))
      const kept = added.length > 0 ? tabs.map((tab) => ({ ...tab, active: false })) : tabs
      windows.create([], { tabs: [...kept, ...added] })
    })
  } else if (launchUrls.length === 0 && shouldWelcome(settings)) {
    settings.setOnboarded()
    windows.create([WELCOME_PAGE_URL])
  } else windows.create(launchUrls)
  links.start((urls) => windows.openFromSystem(urls))
  // Closed only now: on Windows/Linux, no window at all would quit the app.
  ;(splash as BrowserWindow | null)?.destroy()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windows.create()
  })
})

// Quitting while a tab's CDP setup is in flight would hang the process (userAgent.ts): let it finish.
let quitting = false
let sessionRestore: SessionRestore | null = null
app.on('before-quit', (event) => {
  // Saved before the windows start closing (each close would drop its tabs from the session).
  sessionRestore?.freeze()
  if (quitting) return
  event.preventDefault()
  quitting = true
  void identitySettled().then(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
