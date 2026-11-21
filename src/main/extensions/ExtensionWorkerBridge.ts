import { join } from 'node:path'
import type { ServiceWorkerMain, Session, WebContents } from 'electron'
import { EXT_GET_TABS, EXT_HIGHLIGHTED, EXT_TABS, type ExtensionTabState } from '@shared/ipc'
import type { WindowManager } from '../windows/WindowManager'

/**
 * Main side of src/preload/extension-sw.ts: tells extension service workers which tab is
 * active and dispatches chrome.tabs.onHighlighted. Not a patch of electron-chrome-extensions —
 * a separate shim for APIs it (and Electron) leave out. See docs/EXTENSIONS.md.
 */
export class ExtensionWorkerBridge {
  private workers = new Set<ServiceWorkerMain>()

  constructor(
    private readonly session: Session,
    private readonly windows: WindowManager
  ) {}

  /** Must run after `new ElectronChromeExtensions()` so our preload runs after the lib's. */
  install(): void {
    this.session.registerPreloadScript({
      id: 'zak-extension-sw',
      type: 'service-worker',
      filePath: join(__dirname, '../preload/extension-sw.js')
    })

    this.session.serviceWorkers.on('running-status-changed', ({ runningStatus, versionId }) => {
      if (runningStatus !== 'starting') return
      const worker = this.session.serviceWorkers.getWorkerFromVersionID(versionId)
      if (!worker?.scope.startsWith('chrome-extension://') || this.workers.has(worker)) return
      this.workers.add(worker)
      worker.ipc.handle(EXT_GET_TABS, () => this.tabState())
    })

    const push = (): void => this.broadcast(EXT_TABS, this.tabState())
    this.windows.on('tab-created', push)
    this.windows.on('tab-removed', push)
    this.windows.on('tab-selected', (wc) => {
      if (wc.session !== this.session) return
      push()
      this.highlight(wc)
    })
  }

  private highlight(wc: WebContents): void {
    const handle = this.windows.fromTab(wc)
    if (handle) this.broadcast(EXT_HIGHLIGHTED, { windowId: handle.window.id, tabIds: [wc.id] })
  }

  private tabState(): Record<number, ExtensionTabState> {
    const state: Record<number, ExtensionTabState> = {}
    for (const { window, tabs, private: isPrivate } of this.windows.all()) {
      if (window.isDestroyed() || isPrivate) continue
      const { tabs: list, activeId } = tabs.getState()
      list.forEach((tab, index) => {
        state[tab.id] = { windowId: window.id, index, active: tab.id === activeId }
      })
    }
    return state
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const worker of this.workers) {
      if (worker.isDestroyed()) {
        this.workers.delete(worker)
        continue
      }
      worker.send(channel, payload)
    }
  }
}
