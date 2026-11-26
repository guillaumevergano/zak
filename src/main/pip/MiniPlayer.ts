import { getLang } from '@shared/i18n'
import { join } from 'node:path'
import { BaseWindow, screen, WebContentsView, type WebContents } from 'electron'
import type { MiniPlayerAction, MiniPlayerState } from '@shared/types'
import type { PipSettings } from '@shared/types'
import type { BrowserWindowHandle, WindowManager } from '../windows/WindowManager'
import { PIP_WORLD_ID, pickVideo } from './PipController'

/** Width of a new floating player; its height follows the video. */
const WIDTH = 400
const MARGIN = 20

/**
 * The floating video above everything else in its page: the top layer (a popover) escapes the
 * page's boxes, and these rules (user origin, so above the site's own) make it fill the view.
 */
const FLOATING_CSS = `video[data-zak-floating] {
  position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
  max-width: none !important; max-height: none !important; min-width: 0 !important; min-height: 0 !important;
  margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important;
  transform: none !important; object-fit: contain !important; background: #000 !important;
  visibility: visible !important; opacity: 1 !important; z-index: 2147483647 !important;
}
video[data-zak-floating]::backdrop { background: #000 !important; }`

/** Lifts the chosen video into the top layer; its size, or null when there is none. */
const liftScript = (skipMuted: boolean, autoplayed: boolean): string => `(() => {
  ${pickVideo(skipMuted, autoplayed)}
  if (!video || !video.videoWidth || !video.videoHeight) return null
  window.__zakFloating = video
  video.setAttribute('data-zak-floating', '')
  if (!video.hasAttribute('popover')) {
    video.setAttribute('popover', 'manual')
    window.__zakAddedPopover = true
  }
  try { video.showPopover() } catch {}
  return { width: video.videoWidth, height: video.videoHeight }
})()`

const DROP_SCRIPT = `(() => {
  const video = window.__zakFloating
  window.__zakFloating = null
  if (!video) return
  try { video.hidePopover() } catch {}
  if (window.__zakAddedPopover) video.removeAttribute('popover')
  window.__zakAddedPopover = false
  video.removeAttribute('data-zak-floating')
})()`

const TOGGLE_SCRIPT = `(() => {
  const video = window.__zakFloating
  if (!video) return null
  if (video.paused) void video.play().catch(() => {})
  else video.pause()
  return true
})()`

const PAUSE_SCRIPT = `(() => { const video = window.__zakFloating; if (video) video.pause() })()`

const STATE_SCRIPT = `(() => {
  const video = window.__zakFloating
  return video ? { playing: !video.paused && !video.ended } : null
})()`

interface Floating {
  handle: BrowserWindowHandle
  tabId: number
  wc: WebContents
  window: BaseWindow
  view: WebContentsView
  controls: WebContentsView
  cssKey: string | null
}

/**
 * Zak's floating player (CLAUDE.md §6.4), in place of Chromium's Picture-in-Picture, which Electron
 * gives no hold on: a small frameless window with macOS's rounded corners, always on top, that
 * borrows the tab's own view (TabManager.lend). The video fills it; nothing reloads, playback goes
 * on. Zak's buttons show on hover: ⏯, back to the tab, close (pauses). Coming back to the tab, or
 * restoring its window, gives the page back.
 */
export class MiniPlayer {
  private current: Floating | null = null
  /** Where the user left the last player (moved, resized): the next one opens there. */
  private lastBounds: Electron.Rectangle | null = null

  constructor(private readonly windows: WindowManager) {}

  async open(wc: WebContents, settings: PipSettings): Promise<boolean> {
    const handle = this.windows.fromTab(wc)
    if (!handle || wc.isDestroyed() || this.current?.wc === wc) return false
    const size = (await wc
      .executeJavaScriptInIsolatedWorld(PIP_WORLD_ID, [{ code: liftScript(settings.skipMuted, settings.autoplayed) }], true)
      .catch(() => null)) as { width: number; height: number } | null
    if (!size || wc.isDestroyed()) return false
    const view = handle.tabs.lend(wc.id)
    if (!view) {
      void wc.executeJavaScriptInIsolatedWorld(PIP_WORLD_ID, [{ code: DROP_SCRIPT }]).catch(() => {})
      return false
    }
    // One floating player at a time: the previous page goes back to its window.
    this.close(false)

    const ratio = size.width / size.height
    const bounds = this.placement(handle, ratio)
    const window = new BaseWindow({
      ...bounds,
      frame: false,
      roundedCorners: true,
      hasShadow: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hiddenInMissionControl: true,
      acceptFirstMouse: true,
      backgroundColor: '#000000',
      show: false,
      minWidth: 200,
      minHeight: 112
    })
    window.setAspectRatio(ratio)
    window.setAlwaysOnTop(true, 'floating')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })

    const controls = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/chrome.js'),
        additionalArguments: [`--zak-lang=${getLang()}`],
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    controls.setBackgroundColor('#00000000')
    view.setBorderRadius(0)
    view.setVisible(true)
    window.contentView.addChildView(view)
    window.contentView.addChildView(controls)
    const floating: Floating = { handle, tabId: wc.id, wc, window, view, controls, cssKey: null }
    this.current = floating
    const layout = (): void => {
      if (window.isDestroyed()) return
      const { width, height } = window.getContentBounds()
      view.setBounds({ x: 0, y: 0, width, height })
      controls.setBounds({ x: 0, y: 0, width, height })
    }
    layout()
    window.on('resize', layout)
    const remember = (): void => {
      if (!window.isDestroyed()) this.lastBounds = window.getBounds()
    }
    window.on('moved', remember)
    window.on('resized', remember)
    // Closed some other way (the system): the page still goes back.
    window.on('closed', () => {
      if (this.current === floating) this.giveBack(wc)
    })
    wc.once('destroyed', () => {
      if (this.current === floating) this.close(false)
    })
    handle.tabs.onReclaim = (id) => {
      if (this.current?.tabId === id) this.release(floating)
    }

    floating.cssKey = await wc.insertCSS(FLOATING_CSS, { cssOrigin: 'user' }).catch(() => null)
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    void (devUrl
      ? controls.webContents.loadURL(`${devUrl}#miniplayer`)
      : controls.webContents.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'miniplayer' })
    ).catch(() => {})
    // Never takes the focus from the window one is working in.
    if (this.current === floating) window.showInactive()
    return true
  }

  /** The tab is shown again, or its window restored: its page goes back there. */
  giveBack(wc: WebContents): void {
    const floating = this.current
    if (!floating || floating.wc !== wc) return
    if (floating.handle.tabs.isLent(floating.tabId)) floating.handle.tabs.reclaim(floating.tabId)
    else this.release(floating)
  }

  /** Closes the player; `pause`: the video stops (the user closed it), else it plays on in its tab. */
  close(pause: boolean): void {
    const floating = this.current
    if (!floating) return
    if (pause && !floating.wc.isDestroyed()) void floating.wc.executeJavaScriptInIsolatedWorld(PIP_WORLD_ID, [{ code: PAUSE_SCRIPT }]).catch(() => {})
    this.giveBack(floating.wc)
    if (this.current === floating) this.release(floating)
  }

  /** From the player's buttons (its controls view only). */
  async act(sender: WebContents, action: MiniPlayerAction): Promise<void> {
    const floating = this.current
    if (!floating || floating.controls.webContents !== sender) return
    if (action === 'toggle') {
      await floating.wc.executeJavaScriptInIsolatedWorld(PIP_WORLD_ID, [{ code: TOGGLE_SCRIPT }], true).catch(() => null)
    } else if (action === 'close') this.close(true)
    else {
      // Back to the tab: its window comes forward, the tab is shown, the page comes back.
      const { handle, tabId } = floating
      if (handle.window.isDestroyed()) return
      if (handle.window.isMinimized()) handle.window.restore()
      handle.window.focus()
      handle.tabs.activate(tabId)
      this.giveBack(floating.wc)
    }
  }

  async state(sender: WebContents): Promise<MiniPlayerState | null> {
    const floating = this.current
    if (!floating || floating.controls.webContents !== sender || floating.wc.isDestroyed()) return null
    const video = (await floating.wc.executeJavaScriptInIsolatedWorld(PIP_WORLD_ID, [{ code: STATE_SCRIPT }]).catch(() => null)) as {
      playing: boolean
    } | null
    return { playing: video?.playing === true, title: floating.wc.getTitle() }
  }

  /** The player's window position, when the controls start dragging it. */
  position(sender: WebContents): [number, number] | null {
    const floating = this.current
    if (!floating || floating.controls.webContents !== sender || floating.window.isDestroyed()) return null
    const [x, y] = floating.window.getPosition()
    return [x!, y!]
  }

  moveTo(sender: WebContents, x: number, y: number): void {
    const floating = this.current
    if (!floating || floating.controls.webContents !== sender || floating.window.isDestroyed()) return
    if (Number.isFinite(x) && Number.isFinite(y)) floating.window.setPosition(Math.round(x), Math.round(y))
  }

  /** Lets go of the page (already taken back by its window, or gone) and closes the player. */
  private release(floating: Floating): void {
    if (this.current !== floating) return
    this.current = null
    const { window, view, controls, wc, cssKey, handle } = floating
    if (handle.tabs.onReclaim) handle.tabs.onReclaim = null
    if (!window.isDestroyed()) {
      window.contentView.removeChildView(view)
      window.contentView.removeChildView(controls)
      window.destroy()
    }
    if (!controls.webContents.isDestroyed()) controls.webContents.close()
    if (!wc.isDestroyed()) {
      void wc.executeJavaScriptInIsolatedWorld(PIP_WORLD_ID, [{ code: DROP_SCRIPT }]).catch(() => {})
      if (cssKey) void wc.removeInsertedCSS(cssKey).catch(() => {})
    }
  }

  /** Bottom right of the screen the window is on (or where the user left the last one). */
  private placement(handle: BrowserWindowHandle, ratio: number): Electron.Rectangle {
    const last = this.lastBounds
    if (last) {
      const height = Math.round(last.width / ratio)
      return { x: last.x, y: last.y + last.height - height, width: last.width, height }
    }
    const area = screen.getDisplayMatching(handle.window.getBounds()).workArea
    const width = WIDTH
    const height = Math.round(width / ratio)
    return { x: area.x + area.width - width - MARGIN, y: area.y + area.height - height - MARGIN, width, height }
  }
}
