import { t } from '@shared/i18n'
import { writeFile } from 'node:fs/promises'
import { clipboard, ClipboardItem, nativeImage, shell, type MenuItemConstructorOptions, type NativeImage, type WebContents } from 'electron'
import type { Rect } from '@shared/types'
import type { ScreenshotMode } from '@shared/tools'
import type { RecordingShare } from '@shared/recordings'
import type { SettingsStore } from '../store/settings'
import type { BrowserWindowHandle } from '../windows/WindowManager'
import { uniquePath } from '../downloads/DownloadsManager'
import { clampRegion, fullPageClip, screenshotName, type LayoutMetrics } from './screenshot'

const TOAST_WIDTH = 300
const TOAST_HEIGHT = 250
/** A recording's thumbnail has the Drive share row too. */
const RECORDING_TOAST_HEIGHT = 300
const RECORDING_TOAST_WIDTH = 360

/**
 * « Capture d'écran » (CLAUDE.md §6.8): File menu (⌘⇧2) or the page's right-click menu. The page
 * dims; one draws a region, or picks the visible part or the whole page. The image is copied to the
 * clipboard and saved in the downloads folder; a thumbnail shows it a few seconds (drag it out,
 * « Afficher dans le Finder »). Nothing leaves the computer.
 */
export class ScreenshotTool {
  /** The last screenshot: what « Afficher » and dragging the thumbnail give. */
  private last: { path: string; icon: NativeImage } | null = null

  constructor(
    private readonly settings: SettingsStore,
    private readonly downloadDir: () => string
  ) {}

  enabled(): boolean {
    return this.settings.getTools().screenshot.enabled
  }

  /** The capture mode over `wc`'s page (the active tab when none is given). */
  start(handle: BrowserWindowHandle, wc: WebContents | null = handle.tabs.getActive() ?? null): void {
    if (!this.enabled() || !wc || handle.window.isDestroyed()) return
    const frame = handle.tabs.pageBounds(wc.id)
    if (frame) void handle.overlay.open({ kind: 'screenshot', frame, tabId: wc.id })
  }

  /** The page menu's entry (none when the tool is off). */
  menuItems(handle: BrowserWindowHandle, wc: WebContents): MenuItemConstructorOptions[] {
    return this.enabled() ? [{ label: t('Capture d’écran…'), click: () => this.start(handle, wc) }] : []
  }

  /** From the capture mode: takes it, then copies, saves and shows it. */
  async capture(handle: BrowserWindowHandle, mode: ScreenshotMode, rect?: Rect): Promise<void> {
    const request = handle.overlay.showing()
    if (request?.kind !== 'screenshot') return
    const wc = handle.tabs.get(request.tabId)
    // The overlay is its own view: the page's capture never shows it, but the focus goes back to the page.
    handle.overlay.close()
    if (!wc || wc.isDestroyed()) return
    let image: NativeImage
    if (mode === 'region') {
      const region = rect && clampRegion(rect, request.frame)
      if (!region) return
      image = await wc.capturePage(region)
    } else if (mode === 'full') {
      image = await capturePageFull(wc).catch(() => wc.capturePage())
    } else {
      image = await wc.capturePage()
    }
    if (image.isEmpty()) return

    const path = uniquePath(this.downloadDir(), screenshotName(t('Capture'), new Date()))
    const png = image.toPNG()
    await writeFile(path, png)
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })])
    // Another capture started meanwhile: its picker stays.
    if (handle.overlay.showing()?.kind !== 'screenshot') this.showFile(handle, path, image, false)
  }

  /**
   * The thumbnail of a file just made (a screenshot, or a screen recording: `video`) in the bottom
   * corner of the window's page, a few seconds: drag it out, or show it in the Finder.
   */
  showFile(handle: BrowserWindowHandle, path: string, image: NativeImage, video: boolean, recording?: { id: string; share: RecordingShare }): void {
    // Dragging needs an icon: a blank one when there is no picture.
    const icon = image.isEmpty() ? nativeImage.createFromBitmap(Buffer.alloc(16 * 16 * 4), { width: 16, height: 16 }) : image.resize({ width: 96 })
    this.last = { path, icon }
    const active = handle.tabs.getActive()
    const page = active ? handle.tabs.pageBounds(active.id) : null
    if (!page || handle.window.isDestroyed()) return
    const size = image.getSize()
    const thumbnail = image.isEmpty() ? image : size.width / size.height > 2 ? image.resize({ width: 600 }) : image.resize({ height: 300 })
    const width = recording ? RECORDING_TOAST_WIDTH : TOAST_WIDTH
    const frame = {
      x: page.x + page.width - width - 12,
      y: page.y + page.height - (recording ? RECORDING_TOAST_HEIGHT : TOAST_HEIGHT) - 12,
      width,
      height: recording ? RECORDING_TOAST_HEIGHT : TOAST_HEIGHT
    }
    void handle.overlay.open({ kind: 'screenshot-done', frame, preview: thumbnail.toDataURL(), name: path.split(/[/\\]/).pop()!, video, ...(recording ? { recording } : {}) })
  }

  reveal(): void {
    if (this.last) shell.showItemInFolder(this.last.path)
  }

  /** The thumbnail dragged out: the file itself goes (into a message, the Finder…). */
  drag(sender: WebContents): void {
    if (this.last) sender.startDrag({ file: this.last.path, icon: this.last.icon })
  }
}

/**
 * The whole page, beyond what is scrolled into view (DevTools' « Capture full size screenshot »).
 * A page that scrolls inside its own box (a web app) gives its visible part only.
 */
async function capturePageFull(wc: WebContents): Promise<NativeImage> {
  if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
  const ratio = (await wc.executeJavaScript('window.devicePixelRatio')) as number
  const metrics = (await wc.debugger.sendCommand('Page.getLayoutMetrics')) as LayoutMetrics
  const { data } = (await wc.debugger.sendCommand('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: fullPageClip(metrics, ratio)
  })) as { data: string }
  return nativeImage.createFromBuffer(Buffer.from(data, 'base64'), { scaleFactor: ratio })
}
