import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { shell, type DownloadItem, type Session } from 'electron'
import type { DownloadAction, DownloadInfo } from '@shared/types'
import type { WindowManager } from '../windows/WindowManager'

interface Entry {
  info: DownloadInfo
  item: DownloadItem
  session: Session
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

/**
 * Downloads (CLAUDE.md §6.7): saved straight into the downloads folder (private windows too, like
 * Chrome), listed in the toolbar panel with progress, pause, cancel, open. Each window only lists
 * the downloads of its own session, so a private window's downloads never show elsewhere.
 */
export class DownloadsManager {
  private entries: Entry[] = []
  private pushTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly windows: WindowManager,
    private readonly downloadDir: () => string
  ) {
    windows.on('window-created', (handle) => {
      handle.window.webContents.once('did-finish-load', () => this.push())
    })
  }

  attach(ses: Session): void {
    ses.on('will-download', (_event, item) => {
      item.setSavePath(uniquePath(this.downloadDir(), item.getFilename()))
      const info: DownloadInfo = {
        id: randomUUID(),
        filename: item.getFilename(),
        path: item.getSavePath(),
        url: item.getURL(),
        state: 'progressing',
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
        startedAt: Date.now()
      }
      const entry: Entry = { info, item, session: ses }
      this.entries.unshift(entry)
      item.on('updated', (_e, state) => {
        info.state = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing'
        info.receivedBytes = item.getReceivedBytes()
        info.totalBytes = item.getTotalBytes()
        this.schedulePush()
      })
      item.once('done', (_e, state) => {
        info.state = state
        info.receivedBytes = item.getReceivedBytes()
        info.path = item.getSavePath()
        info.filename = info.path.split(/[/\\]/).pop() ?? info.filename
        this.push()
      })
      this.push()
    })
  }

  /** Downloads of the session of the window `sender` belongs to. */
  stateFor(ses: Session): DownloadInfo[] {
    return this.entries.filter((e) => e.session === ses).map((e) => ({ ...e.info }))
  }

  act(id: string, action: DownloadAction): void {
    const entry = this.entries.find((e) => e.info.id === id)
    if (!entry) return
    const { item, info } = entry
    switch (action) {
      case 'pause':
        if (info.state === 'progressing') item.pause()
        break
      case 'resume':
        if (item.canResume()) item.resume()
        break
      case 'cancel':
        if (info.state === 'progressing' || info.state === 'paused') item.cancel()
        break
      case 'open':
        if (info.state === 'completed') void shell.openPath(info.path)
        break
      case 'show':
        shell.showItemInFolder(info.path)
        break
      case 'remove':
        if (info.state === 'progressing' || info.state === 'paused') item.cancel()
        this.entries = this.entries.filter((e) => e !== entry)
        break
    }
    this.push()
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
  }
}
