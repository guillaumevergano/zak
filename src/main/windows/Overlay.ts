import { getLang } from '@shared/i18n'
import { join } from 'node:path'
import { WebContentsView, type BrowserWindow, type WebContents } from 'electron'
import type { EventChannel, EventChannels } from '@shared/ipc'
import type { OverlayRequest } from '@shared/types'

/**
 * Transparent view stacked above the tabs for popovers and panels. The chrome UI is the window's
 * own webContents, which always sits below child views, so anything drawn there would be hidden
 * by the page. The overlay runs the same renderer bundle (`#overlay`) with the same preload.
 *
 * - Modal popovers (★ editor, folders, downloads) cover the whole window and take the focus: a
 *   click outside closes them.
 * - Framed panels (omnibox suggestions, find bar, permission prompt) shrink the view to their
 *   frame so the page around stays usable; suggestions leave the focus in the omnibox.
 */
export class Overlay {
  private view: WebContentsView | null = null
  private ready: Promise<void> | null = null
  private current: OverlayRequest | null = null
  private lastWidth: number

  /** Called when a panel goes away (closed by the user, replaced or hidden). */
  onHidden: ((request: OverlayRequest) => void) | null = null

  constructor(
    private readonly window: BrowserWindow,
    /** Gives the focus back (active tab) once a popover closes. */
    private readonly restoreFocus: () => void
  ) {
    this.lastWidth = window.getContentBounds().width
    window.on('resize', () => this.onResize())
  }

  /** Loads the overlay page ahead of its first use, so opening a panel never waits for it. */
  preload(): void {
    this.ensureView()
  }

  owns(webContents: WebContents): boolean {
    return this.view?.webContents === webContents
  }

  /** What is shown, if anything. */
  showing(): OverlayRequest | null {
    return this.current
  }

  async open(request: OverlayRequest): Promise<void> {
    const view = this.ensureView()
    await this.ready
    if (this.window.isDestroyed()) return
    const previous = this.current
    this.current = request
    if (previous && previous.kind !== request.kind) this.onHidden?.(previous)
    this.layout()
    // Re-adding moves it above every tab view.
    this.window.contentView.addChildView(view)
    view.setVisible(true)
    // Suggestions keep the focus in the omnibox; a screenshot's or a color's thumbnail leaves it where it was.
    if (request.kind !== 'suggestions' && request.kind !== 'screenshot-done' && request.kind !== 'colors-toast') view.webContents.focus()
    view.webContents.send('overlay:show', request)
  }

  /** Closed by the user: hide, and give the focus back to the page. */
  close(): void {
    if (!this.hide()) return
    this.restoreFocus()
  }

  /** Hides without moving the focus (e.g. suggestions while typing goes on). Returns whether it was shown. */
  hide(): boolean {
    if (!this.view || this.window.isDestroyed() || !this.current) return false
    const previous = this.current
    this.current = null
    this.view.setVisible(false)
    // Removed so a hidden view never sits above the page (and re-added on top on next open).
    this.window.contentView.removeChildView(this.view)
    this.view.webContents.send('overlay:show', null)
    this.onHidden?.(previous)
    return true
  }

  /**
   * The framed panel's content is `height` px tall: the view follows, moved up if it would go past
   * the bottom of the window.
   */
  resize(height: number): void {
    const current = this.current
    if (!current || !('frame' in current) || this.window.isDestroyed()) return
    const room = this.window.getContentBounds().height - 8
    const frame = { ...current.frame, height: Math.min(Math.ceil(height), room - 8) }
    if (frame.y + frame.height > room) frame.y = Math.max(8, room - frame.height)
    current.frame = frame
    this.layout()
  }

  /** Main → overlay renderer events (live download progress, find results…). */
  send<C extends EventChannel>(channel: C, payload: EventChannels[C]): void {
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.send(channel, payload)
  }

  destroy(): void {
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close()
    this.view = null
  }

  private ensureView(): WebContentsView {
    if (this.view) return this.view
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/chrome.js'),
        additionalArguments: [`--zak-lang=${getLang()}`],
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    view.setBackgroundColor('#00000000')
    view.setVisible(false)
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    this.ready = (
      devUrl
        ? view.webContents.loadURL(`${devUrl}#overlay`)
        : view.webContents.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'overlay' })
    ).catch(() => {})
    this.view = view
    return view
  }

  /** Framed panels anchored to the right (find bar) follow the window's right edge. */
  private onResize(): void {
    const width = this.window.getContentBounds().width
    const delta = width - this.lastWidth
    this.lastWidth = width
    const current = this.current
    if (current?.kind === 'find' || current?.kind === 'suggestions') {
      if (current.kind === 'suggestions') {
        this.hide()
        return
      }
      current.frame = { ...current.frame, x: current.frame.x + delta }
    }
    this.layout()
  }

  private layout(): void {
    if (!this.view) return
    const current = this.current
    if (current && 'frame' in current) {
      const { x, y, width, height } = current.frame
      this.view.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) })
      return
    }
    const { width, height } = this.window.getContentBounds()
    this.view.setBounds({ x: 0, y: 0, width, height })
  }
}
