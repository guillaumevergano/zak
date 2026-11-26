import { t } from '@shared/i18n'
import { writeFile } from 'node:fs/promises'
import { clipboard, ClipboardItem, nativeImage, shell, type MenuItemConstructorOptions, type NativeImage, type WebContents } from 'electron'
import type { Rect } from '@shared/types'
import type { ScreenshotMode } from '@shared/tools'
import type { SettingsStore } from '../store/settings'
import type { BrowserWindowHandle } from '../windows/WindowManager'
import { uniquePath } from '../downloads/DownloadsManager'
import { clampRegion, fullPageClip, screenshotName, type LayoutMetrics } from './screenshot'

const TOAST_WIDTH = 300
const TOAST_HEIGHT = 250

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
    const size = image.getSize()
    const thumbnail = size.width / size.height > 2 ? image.resize({ width: 600 }) : image.resize({ height: 300 })
    this.last = { path, icon: image.resize({ width: 96 }) }

    const page = handle.tabs.pageBounds(request.tabId) ?? request.frame
    const frame = {
      x: page.x + page.width - TOAST_WIDTH - 12,
      y: page.y + page.height - TOAST_HEIGHT - 12,
      width: TOAST_WIDTH,
      height: TOAST_HEIGHT
    }
    // Another capture started meanwhile: its picker stays.
    if (!handle.window.isDestroyed() && handle.overlay.showing()?.kind !== 'screenshot') {
      void handle.overlay.open({ kind: 'screenshot-done', frame, preview: thumbnail.toDataURL(), name: path.split(/[/\\]/).pop()! })
    }
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
