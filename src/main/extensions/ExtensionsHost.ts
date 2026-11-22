import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs'
import { t } from '@shared/i18n'
import { join } from 'node:path'
import { app, session, type Session } from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { installChromeWebStore, uninstallExtension } from 'electron-chrome-web-store'
import type { ExtensionInfo } from '@shared/types'
import type { SettingsStore } from '../store/settings'
import type { WindowManager } from '../windows/WindowManager'
import { ExtensionWorkerBridge } from './ExtensionWorkerBridge'
import { iconDataUrl, localize, optionsPage, readMessages, type Manifest } from './manifest'

const WEB_STORE_URL = 'https://chromewebstore.google.com/category/extensions'

/**
 * Chrome extensions on the `persist:main` session (CLAUDE.md §6.5):
 * - electron-chrome-extensions: chrome.tabs / windows / action / contextMenus…, backed by our TabManager.
 * - electron-chrome-web-store: "Ajouter à Chrome" on chromewebstore.google.com + auto-update.
 */
export class ExtensionsHost {
  private extensions: ElectronChromeExtensions | null = null
  /**
   * Extensions switched off on zak://extensions: id → install path. Electron has no "disabled"
   * state, so they are unloaded from the session and loaded again when switched back on.
   */
  private readonly disabled = new Map<string, string>()
  private readonly extensionsPath = join(app.getPath('userData'), 'Extensions')

  constructor(
    private readonly browsingSession: Session,
    private readonly windows: WindowManager,
    private readonly settings: SettingsStore
  ) {}

  async init(): Promise<void> {
    const { windows } = this

    this.extensions = new ElectronChromeExtensions({
      session: this.browsingSession,
      async createTab(details) {
        const handle = windows.focusedNormal()
        const wc = handle.tabs.create(details.url, { active: details.active !== false })
        return [wc, handle.window]
      },
      selectTab(tab) {
        windows.fromTab(tab)?.tabs.activate(tab.id)
      },
      removeTab(tab) {
        windows.fromTab(tab)?.tabs.close(tab.id)
      },
      async createWindow(details) {
        const urls = details.url === undefined ? [] : Array.isArray(details.url) ? details.url : [details.url]
        return windows.create(urls).window
      },
      removeWindow(window) {
        window.close()
      }
    })

    // Extensions only see tabs of the browsing session: private windows have their own (§6.3).
    const ours = (wc: Electron.WebContents): boolean => !wc.isDestroyed() && wc.session === this.browsingSession
    windows.on('tab-created', (wc, window) => {
      if (ours(wc)) this.extensions?.addTab(wc, window)
    })
    windows.on('tab-selected', (wc) => {
      if (ours(wc)) this.extensions?.selectTab(wc)
    })
    windows.on('tab-removed', (wc) => {
      if (ours(wc)) this.extensions?.removeTab(wc)
    })
    windows.on('tab-context-menu', (wc, params, menu) => {
      if (!ours(wc)) return
      const items = this.extensions?.getContextMenuItems(wc, params) ?? []
      // The page menu builder puts separators around this block.
      items.forEach((item) => menu.append(item))
    })

    // Fills sender.tab.active + chrome.tabs.onHighlighted for extension service workers.
    new ExtensionWorkerBridge(this.browsingSession, windows).install()

    // <browser-action-list> lives in the chrome UI, which uses the default session.
    ElectronChromeExtensions.handleCRXProtocol(session.defaultSession)

    await installChromeWebStore({
      session: this.browsingSession,
      extensionsPath: this.extensionsPath,
      autoUpdate: true,
      // The lib defaults to MV3-only; the spec asks for MV2 + MV3 (§2).
      minimumManifestVersion: 2
    })

    this.unloadDisabled()
    for (const path of this.settings.getUnpackedExtensions()) {
      if (existsSync(join(path, 'manifest.json'))) await this.loadFolder(path).catch((err) => console.warn('[extensions]', path, err))
    }
  }

  // ── Unpacked extensions: a folder with a manifest.json, written by hand or by an AI agent ──

  /** id → folder of the extensions loaded unpacked. */
  private readonly unpacked = new Map<string, string>()
  private readonly watchers = new Map<string, FSWatcher>()

  /** « Charger une extension non empaquetée… ». Returns the extension's id. */
  async loadUnpacked(path: string): Promise<string> {
    if (!existsSync(join(path, 'manifest.json'))) throw new Error(t('Ce dossier ne contient pas de manifest.json.'))
    const id = await this.loadFolder(path)
    this.settings.setUnpackedExtensions([...this.settings.getUnpackedExtensions(), path])
    return id
  }

  /** Loads the folder again (after a change). */
  async reload(id: string): Promise<void> {
    const path = this.unpacked.get(id)
    if (!path) return
    this.browsingSession.extensions.removeExtension(id)
    await this.browsingSession.extensions.loadExtension(path, { allowFileAccess: true })
  }

  private async loadFolder(path: string): Promise<string> {
    const ext = await this.browsingSession.extensions.loadExtension(path, { allowFileAccess: true })
    this.unpacked.set(ext.id, path)
    // Reloaded as soon as a file changes: edit it (or let Claude Code / Codex edit it) and see it.
    this.watchers.get(ext.id)?.close()
    let timer: NodeJS.Timeout | null = null
    try {
      const watcher = watch(path, { recursive: true }, () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          if (!this.disabled.has(ext.id)) void this.reload(ext.id).catch((err) => console.warn('[extensions] reload', err))
        }, 400)
      })
      this.watchers.set(ext.id, watcher)
    } catch {
      /* not watchable (network drive…): « Recharger » on zak://extensions still works */
    }
    return ext.id
  }

  // ── zak://extensions ─────────────────────────────────────────────────────────

  list(): ExtensionInfo[] {
    const loaded = this.browsingSession.extensions
      .getAllExtensions()
      .map((ext) => this.describe(ext.id, ext.path, ext.manifest as Manifest, true))
    const off = [...this.disabled].map(([id, path]) => this.describe(id, path, readManifest(path), false))
    return [...loaded, ...off].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    if (enabled) {
      const path = this.disabled.get(id)
      if (!path) return
      this.disabled.delete(id)
      this.saveDisabled()
      await this.browsingSession.extensions.loadExtension(path)
    } else {
      const ext = this.browsingSession.extensions.getExtension(id)
      if (!ext) return
      this.disabled.set(id, ext.path)
      this.saveDisabled()
      this.browsingSession.extensions.removeExtension(id)
    }
  }

  async uninstall(id: string): Promise<void> {
    if (this.disabled.delete(id)) this.saveDisabled()
    // Unpacked: only forgotten, never deleted (the folder is the user's).
    const folder = this.unpacked.get(id)
    if (folder) {
      this.unpacked.delete(id)
      this.watchers.get(id)?.close()
      this.watchers.delete(id)
      this.settings.setUnpackedExtensions(this.settings.getUnpackedExtensions().filter((p) => p !== folder))
      if (this.browsingSession.extensions.getExtension(id)) this.browsingSession.extensions.removeExtension(id)
      return
    }
    await uninstallExtension(id, { session: this.browsingSession, extensionsPath: this.extensionsPath })
  }

  openOptions(id: string): void {
    const ext = this.browsingSession.extensions.getExtension(id)
    const page = ext && optionsPage(ext.manifest as Manifest)
    if (!page) return
    this.windows.focusedNormal().tabs.create(`chrome-extension://${id}/${page.replace(/^\//, '')}`)
  }

  openStore(): void {
    this.windows.focusedNormal().tabs.create(WEB_STORE_URL)
  }

  /** Startup: the web store lib loaded every installed extension; unload the ones switched off. */
  private unloadDisabled(): void {
    const all = this.browsingSession.extensions.getAllExtensions()
    for (const id of this.settings.getDisabledExtensions()) {
      const ext = all.find((e) => e.id === id)
      if (!ext) continue // uninstalled meanwhile
      this.disabled.set(id, ext.path)
      this.browsingSession.extensions.removeExtension(id)
    }
    this.saveDisabled()
    // (Re)installed from the Web Store while switched off: it is on again.
    this.browsingSession.extensions.on('extension-loaded', (_e, ext) => {
      if (this.disabled.delete(ext.id)) this.saveDisabled()
    })
  }

  private saveDisabled(): void {
    this.settings.setDisabledExtensions([...this.disabled.keys()])
  }

  private describe(id: string, path: string, manifest: Manifest, enabled: boolean): ExtensionInfo {
    const messages = readMessages(path, manifest, [app.getLocale().replace('-', '_'), app.getLocale().split('-')[0]!])
    return {
      id,
      name: localize(manifest.name, messages) || id,
      version: manifest.version ?? '',
      description: localize(manifest.description, messages),
      enabled,
      manifestVersion: manifest.manifest_version ?? 2,
      icon: iconDataUrl(path, manifest),
      hasOptions: optionsPage(manifest) !== null,
      unpackedPath: this.unpacked.get(id) ?? null
    }
  }
}

function readManifest(path: string): Manifest {
  try {
    return JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8')) as Manifest
  } catch {
    return {}
  }
}
