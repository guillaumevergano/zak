import { t } from '@shared/i18n'
import { existsSync, statSync } from 'node:fs'
import { clipboard, shell } from 'electron'
import { RECORDINGS_PAGE_URL } from '@shared/ipc'
import { NO_SHARE, type RecordingInfo, type RecordingShare, type RecordingsPageState } from '@shared/recordings'
import type { GoogleDrive } from '../drive/GoogleDrive'
import type { RecordingRow, RecordingsStore } from '../store/recordings'
import type { SettingsStore } from '../store/settings'
import type { BrowserWindowHandle, WindowManager } from '../windows/WindowManager'

/**
 * The screen recordings (CLAUDE.md §6.8): the library of zak://recordings and sharing one through
 * Google Drive. An upload's progress goes to every window's thumbnail as it happens; once done the
 * link is copied.
 */
export class Recordings {
  /** Uploads under way or failed (done ones are in the store). */
  private uploads = new Map<string, RecordingShare>()

  constructor(
    private readonly store: RecordingsStore,
    private readonly drive: GoogleDrive,
    private readonly settings: SettingsStore,
    private readonly windows: WindowManager
  ) {}

  /** A recording just saved: on the list, and on its way to Drive when asked for. */
  async add(path: string, duration: number, thumbnail: string | null): Promise<RecordingInfo> {
    const name = path.split(/[/\\]/).pop() ?? path
    const row = this.store.add(path, name, duration, thumbnail)
    if (this.settings.getTools().record.autoShare && (await this.drive.status()).connected) void this.share(row.id)
    return this.info(row)
  }

  info(row: RecordingRow): RecordingInfo {
    const exists = existsSync(row.path)
    const share: RecordingShare = this.uploads.get(row.id) ?? (row.link ? { state: 'done', progress: 1, link: row.link, error: null } : NO_SHARE)
    return {
      id: row.id,
      path: row.path,
      name: row.name,
      createdAt: row.createdAt,
      duration: row.duration,
      size: exists ? statSync(row.path).size : 0,
      exists,
      thumbnail: row.thumbnail,
      share
    }
  }

  async page(): Promise<RecordingsPageState> {
    const { autoShare, publicLink } = this.settings.getTools().record
    return { recordings: this.store.list().map((row) => this.info(row)), drive: await this.drive.status(), autoShare, publicLink }
  }

  /**
   * Shares a recording: signs in to Drive first if needed (the Google page in a tab), uploads it
   * and copies its link. Already shared: the link is copied again.
   */
  async share(id: string, handle: BrowserWindowHandle | null = null): Promise<void> {
    const row = this.store.get(id)
    if (!row || this.uploads.get(id)?.state === 'uploading') return
    if (row.link) {
      clipboard.writeText(row.link)
      this.publish(id, { state: 'done', progress: 1, link: row.link, error: null })
      return
    }
    this.publish(id, { state: 'uploading', progress: 0, link: null, error: null })
    try {
      if (!existsSync(row.path)) throw new Error(t('Le fichier n’est plus là.'))
      if (!(await this.drive.status()).connected) await this.connect(handle)
      const mime = row.path.endsWith('.webm') ? 'video/webm' : 'video/mp4'
      let last = 0
      const { id: driveId, link } = await this.drive.upload(row.path, row.name, mime, this.settings.getTools().record.publicLink, (progress) => {
        // A few updates a second at most.
        if (progress - last < 0.01 && progress < 1) return
        last = progress
        this.publish(id, { state: 'uploading', progress, link: null, error: null })
      })
      this.store.setShared(id, driveId, link)
      this.uploads.delete(id)
      clipboard.writeText(link)
      this.publish(id, { state: 'done', progress: 1, link, error: null })
    } catch (err) {
      const share: RecordingShare = { state: 'error', progress: 0, link: null, error: err instanceof Error ? err.message : String(err) }
      this.uploads.set(id, share)
      this.publish(id, share)
    }
  }

  copyLink(id: string): void {
    const link = this.store.get(id)?.link
    if (link) clipboard.writeText(link)
  }

  reveal(id: string): void {
    const row = this.store.get(id)
    if (row && existsSync(row.path)) shell.showItemInFolder(row.path)
  }

  async play(id: string): Promise<void> {
    const row = this.store.get(id)
    if (row && existsSync(row.path)) await shell.openPath(row.path)
  }

  /** Off the list; `fromDrive`: its Drive copy goes too (the link stops working). The file stays. */
  async remove(id: string, fromDrive: boolean): Promise<void> {
    const row = this.store.get(id)
    if (!row) return
    if (fromDrive && row.driveId) await this.drive.remove(row.driveId)
    this.store.remove(id)
    this.uploads.delete(id)
  }

  /** No longer shared: the Drive copy goes, the recording stays on the list. */
  async unshare(id: string): Promise<void> {
    const row = this.store.get(id)
    if (!row?.driveId) return
    await this.drive.remove(row.driveId)
    this.store.setShared(id, null, null)
    this.publish(id, NO_SHARE)
  }

  /** Signs in to Drive, the Google page in a tab of `handle` (or the front window). */
  connect(handle: BrowserWindowHandle | null = null): Promise<unknown> {
    return this.drive.connect((url) => {
      const target = handle && !handle.window.isDestroyed() ? handle : this.windows.focusedNormal()
      const wc = target.tabs.create(url)
      return { close: () => !wc.isDestroyed() && target.tabs.close(wc.id) }
    })
  }

  openPage(handle: BrowserWindowHandle): void {
    handle.tabs.create(RECORDINGS_PAGE_URL)
  }

  private publish(id: string, share: RecordingShare): void {
    if (share.state === 'uploading') this.uploads.set(id, share)
    for (const handle of this.windows.all()) handle.overlay.send('recordings:upload', { id, share })
  }
}
