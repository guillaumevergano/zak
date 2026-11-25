import { existsSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, shell, type DownloadItem, type NativeImage, type Session, type WebContents } from 'electron'
import type { ClearPeriod, DownloadAction, DownloadInfo } from '@shared/types'
import type { DownloadsStore } from '../store/downloads'
import type { WindowManager } from '../windows/WindowManager'

interface Entry {
  info: DownloadInfo
  /** null once the item is gone (blocked before it started). */
  item: DownloadItem | null
  session: Session
  /** Its file's icon, for dragging it out of the panel (fetched once completed). */
  icon: NativeImage | null
}

export interface DownloadsOptions {
  store: DownloadsStore
  /** The session that retries a download only known from the history (no live entry). */
  defaultSession: Session
  downloadDir: () => string
  askWhereToSave: () => boolean
  /** Is this address on the malware or phishing lists (src/main/safety/)? */
  isDangerous: (url: string) => boolean
  /** « Télécharger quand même »: the address's host is trusted until the app quits. */
  allow: (url: string) => void
}

/** `name.ext`, or `name (1).ext`, `name (2).ext`… so nothing is overwritten. */
export function uniquePath(dir: string, filename: string, exists: (path: string) => boolean = existsSync): string {
  const safe = filename.replace(/[/\\]/g, '_') || 'téléchargement'
  const ext = extname(safe)
  const base = safe.slice(0, safe.length - ext.length)
  let candidate = join(dir, safe)
  for (let n = 1; exists(candidate); n++) candidate = join(dir, `${base} (${n})${ext}`)
  return candidate
}

const isActive = (info: DownloadInfo): boolean => info.state === 'progressing' || info.state === 'paused'

/**
 * Downloads (CLAUDE.md §6.7): saved straight into the downloads folder (private windows too, like
 * Chrome), or wherever the user picks when « Demander où enregistrer » is on. Listed in the toolbar
 * panel (this run's downloads of the window's session) and on zak://downloads (the history, kept in
 * SQLite for normal windows only). A download whose address is on the malware lists is blocked.
 * The Dock / taskbar icon shows the overall progress.
 */
export class DownloadsManager {
  private entries: Entry[] = []
  /** Sessions whose downloads are remembered (not private windows). */
  private persisted = new WeakSet<Session>()
  private pushTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly windows: WindowManager,
    private readonly options: DownloadsOptions
  ) {
    options.store.markUnfinishedInterrupted()
    windows.on('window-created', (handle) => {
      handle.window.webContents.once('did-finish-load', () => this.push())
    })
  }

  attach(ses: Session, persisted: boolean): void {
    if (persisted) this.persisted.add(ses)
    ses.on('will-download', (event, item) => this.start(ses, event, item))
  }

  private start(ses: Session, event: Electron.Event, item: DownloadItem): void {
    const info: DownloadInfo = {
      id: randomUUID(),
      filename: item.getFilename(),
      path: '',
      url: item.getURL(),
      state: 'progressing',
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      startedAt: Date.now()
    }
    const entry: Entry = { info, item, session: ses, icon: null }

    // Any address of the redirect chain on the lists: nothing is saved, the list says why.
    if (item.getURLChain().some((url) => this.options.isDangerous(url))) {
      event.preventDefault()
      info.state = 'blocked'
      entry.item = null
      this.entries.unshift(entry)
      this.record(entry, Date.now())
      this.push()
      return
    }

    const target = uniquePath(this.options.downloadDir(), item.getFilename())
    if (this.options.askWhereToSave()) item.setSaveDialogOptions({ defaultPath: target })
    else {
      item.setSavePath(target)
      info.path = target
    }
    this.entries.unshift(entry)
    this.record(entry)

    item.on('updated', (_e, state) => {
      info.state = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing'
      info.receivedBytes = item.getReceivedBytes()
      info.totalBytes = item.getTotalBytes()
      this.takePath(entry)
      this.schedulePush()
    })
    item.once('done', (_e, state) => {
      info.receivedBytes = item.getReceivedBytes()
      this.takePath(entry)
      // Save dialog cancelled: as if nothing was downloaded.
      if (state === 'cancelled' && info.path === '') {
        this.forget(entry)
        this.push()
        return
      }
      info.state = state
      this.record(entry, Date.now())
      if (state === 'completed') {
        info.exists = true
        if (process.platform === 'darwin') app.dock?.downloadFinished(info.path)
        app
          .getFileIcon(info.path, { size: 'normal' })
          .then((icon) => (entry.icon = icon))
          .catch(() => undefined)
      }
      this.push()
    })
    this.push()
  }

  /** The path once known (it is '' until the save dialog is answered). */
  private takePath(entry: Entry): void {
    const path = entry.item?.getSavePath() ?? ''
    if (path === '' || path === entry.info.path) return
    const first = entry.info.path === ''
    entry.info.path = path
    entry.info.filename = path.split(/[/\\]/).pop() ?? entry.info.filename
    if (first) this.record(entry)
  }

  private record(entry: Entry, endedAt: number | null = null): void {
    if (this.persisted.has(entry.session)) this.options.store.save(entry.info, endedAt)
  }

  private forget(entry: Entry): void {
    this.entries = this.entries.filter((e) => e !== entry)
    if (this.persisted.has(entry.session)) this.options.store.remove(entry.info.id)
  }

  /** Toolbar panel: this run's downloads of the window's session. */
  stateFor(ses: Session): DownloadInfo[] {
    return this.entries.filter((e) => e.session === ses).map((e) => this.snapshot(e.info))
  }

  /**
   * zak://downloads: the history of a normal window's session (with live progress), or only this
   * run's downloads for a private window. Newest first, `before` pages through older ones.
   */
  list(ses: Session, query: string, before: number | null): DownloadInfo[] {
    const live = this.entries.filter((e) => e.session === ses)
    if (!this.persisted.has(ses)) {
      const text = query.trim().toLowerCase()
      return live
        .filter((e) => before === null || e.info.startedAt < before)
        .filter((e) => text === '' || e.info.filename.toLowerCase().includes(text) || e.info.url.toLowerCase().includes(text))
        .map((e) => this.snapshot(e.info))
    }
    const byId = new Map(live.map((e) => [e.info.id, e.info]))
    return this.options.store.search(query, before).map((row) => this.snapshot(byId.get(row.id) ?? row))
  }

  private snapshot(info: DownloadInfo): DownloadInfo {
    return info.state === 'completed' ? { ...info, exists: existsSync(info.path) } : { ...info }
  }

  act(id: string, action: DownloadAction, ses: Session = this.options.defaultSession): void {
    const entry = this.entries.find((e) => e.info.id === id)
    const info = entry?.info ?? (this.persisted.has(ses) ? this.options.store.get(id) : null)
    if (!info) return
    const item = entry?.item ?? null
    switch (action) {
      case 'pause':
        if (item && info.state === 'progressing') item.pause()
        break
      case 'resume':
        if (item?.canResume()) item.resume()
        break
      case 'cancel':
        if (item && isActive(info)) item.cancel()
        break
      case 'open':
        if (info.state === 'completed' && existsSync(info.path)) void shell.openPath(info.path)
        break
      case 'show':
        if (existsSync(info.path)) shell.showItemInFolder(info.path)
        else if (info.path && existsSync(dirname(info.path))) void shell.openPath(dirname(info.path))
        break
      case 'retry':
        if (!isActive(info)) (entry?.session ?? ses).downloadURL(info.url)
        break
      case 'keep':
        if (info.state !== 'blocked') break
        this.options.allow(info.url)
        this.remove(entry, id, ses)
        ;(entry?.session ?? ses).downloadURL(info.url)
        break
      case 'remove':
        if (item && isActive(info)) item.cancel()
        this.remove(entry, id, ses)
        break
    }
    this.push()
  }

  private remove(entry: Entry | undefined, id: string, ses: Session): void {
    if (entry) this.forget(entry)
    else if (this.persisted.has(ses)) this.options.store.remove(id)
  }

  /** « Tout effacer » on zak://downloads: forgets the finished downloads (files stay on disk). */
  clear(ses: Session): void {
    this.entries = this.entries.filter((e) => e.session !== ses || isActive(e.info))
    if (this.persisted.has(ses)) this.options.store.clear('all')
    this.push()
  }

  /** « Effacer les données » in the settings: the download history of the period. */
  clearHistory(period: ClearPeriod): void {
    this.options.store.clear(period)
  }

  /** The panel's row dragged out: the file goes to the Finder, the desktop, a mail… */
  drag(sender: WebContents, id: string): void {
    const entry = this.entries.find((e) => e.info.id === id)
    if (!entry?.icon || entry.info.state !== 'completed' || !existsSync(entry.info.path)) return
    sender.startDrag({ file: entry.info.path, icon: entry.icon })
  }

  /** Progress events come many times a second: refresh the UI at most every 250 ms. */
  private schedulePush(): void {
    if (this.pushTimer) return
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      this.push()
    }, 250)
  }

  private push(): void {
    for (const handle of this.windows.all()) {
      const state = this.stateFor(handle.session)
      this.windows.send(handle, 'downloads:state', state)
      handle.overlay.send('downloads:state', state)
    }
    this.showProgress()
  }

  /** Dock (macOS) / taskbar (Windows) progress of every running download; hidden when none. */
  private showProgress(): void {
    const active = this.entries.filter((e) => isActive(e.info))
    const total = active.reduce((sum, e) => sum + e.info.totalBytes, 0)
    const received = active.reduce((sum, e) => sum + e.info.receivedBytes, 0)
    // > 1: indeterminate (a size is unknown).
    const progress = active.length === 0 ? -1 : active.some((e) => e.info.totalBytes === 0) ? 2 : received / total
    for (const handle of this.windows.all()) {
      if (!handle.window.isDestroyed()) handle.window.setProgressBar(progress)
    }
  }
}
