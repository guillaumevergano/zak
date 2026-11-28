import { getLang, t } from '@shared/i18n'
import { join } from 'node:path'
import {
  BrowserWindow,
  clipboard,
  desktopCapturer,
  screen,
  session,
  shell,
  systemPreferences,
  type MenuItemConstructorOptions,
  type NativeImage,
  type Session,
  type WebContents
} from 'electron'
import { aggregateBrand, formatColor, normalizeHex, type BrandData, type BrandScan, type ColorFormat } from '@shared/colors'
import { COLORS_PAGE_URL, type ColorPickerSetup } from '@shared/ipc'
import type { ColorsToast, Rect } from '@shared/types'
import type { ColorsStore } from '../store/colors'
import type { SettingsStore } from '../store/settings'
import type { BrowserWindowHandle, WindowManager } from '../windows/WindowManager'
import { fetchSiteIcon } from '../sidebar/siteIcon'
import { BRAND_WORLD_ID, brandScript } from './brandScript'

const TOAST_WIDTH = 300
const TOAST_HEIGHT = 196
const MAX_LOGO_BYTES = 600_000
const PREVIEW_WIDTH = 960

/** E2E tests: the test app can't see the screen; the eyedropper shows the active page instead. */
const FAKE = process.env['ZAK_E2E'] === '1'

interface Picking {
  /** The browser window it was started from: the color's thumbnail shows there. */
  handle: BrowserWindowHandle | null
  windows: { win: BrowserWindow; image: NativeImage; bounds: Rect }[]
}

/**
 * « Couleurs » (CLAUDE.md §6.8). The eyedropper: a picture of every screen, shown full screen in
 * Zak's own windows with a magnifier; a click takes the pixel's color (copied, kept in the history).
 * Electron has no EyeDropper API, and a picture works everywhere on the screen, outside Zak too.
 * The brand kit: a script reads the page's computed styles (colors by area, fonts by text, styles,
 * buttons, logo), kept with a picture of the page on zak://colors. Nothing leaves the computer
 * (the logo and icon come from the site itself).
 */
export class ColorTool {
  private picking: Picking | null = null
  private scanning = new Set<number>()

  constructor(
    private readonly settings: SettingsStore,
    private readonly windows: WindowManager,
    private readonly store: ColorsStore
  ) {}

  enabled(): boolean {
    return this.settings.getTools().colors.enabled
  }

  format(): ColorFormat {
    return this.settings.getTools().colors.format
  }

  /** The page menu's entries (none when the tool is off). */
  menuItems(handle: BrowserWindowHandle, wc: WebContents): MenuItemConstructorOptions[] {
    if (!this.enabled()) return []
    const items: MenuItemConstructorOptions[] = [{ label: t('Prendre une couleur…'), click: () => void this.pick(handle) }]
    if (/^https?:/.test(wc.getURL())) items.push({ label: t('Analyser la charte graphique'), click: () => void this.scan(handle, wc) })
    return items
  }

  // ─── Eyedropper ─────────────────────────────────────────────────────────────────────────────

  /** The eyedropper over every screen (once: a second call while it shows does nothing). */
  async pick(handle: BrowserWindowHandle | null): Promise<void> {
    if (!this.enabled() || this.picking) return
    const picking: Picking = { handle, windows: [] }
    this.picking = picking
    // The last color's thumbnail would be in the picture.
    if (handle?.overlay.showing()?.kind === 'colors-toast') handle.overlay.hide()
    try {
      const shots = FAKE ? await this.pageShot(handle) : await this.screenShots()
      if (shots === 'denied') {
        this.picking = null
        this.toast(handle, { mode: 'error', message: t('Autorisez Zak dans Réglages Système → Confidentialité et sécurité → Enregistrement de l’écran, puis relancez Zak.'), privacy: true })
        return
      }
      if (this.picking !== picking) return
      if (shots.length === 0) {
        this.picking = null
        this.toast(handle, { mode: 'error', message: t('Impossible de voir l’écran.') })
        return
      }
      const cursor = screen.getCursorScreenPoint()
      for (const shot of shots) {
        const win = this.window(shot.bounds)
        picking.windows.push({ win, image: shot.image, bounds: shot.bounds })
        win.on('closed', () => {
          // Closed some other way (the system): no color.
          if (this.picking === picking) this.finish(null)
        })
        const inside = cursor.x >= shot.bounds.x && cursor.x < shot.bounds.x + shot.bounds.width && cursor.y >= shot.bounds.y && cursor.y < shot.bounds.y + shot.bounds.height
        win.once('ready-to-show', () => {
          if (FAKE) win.showInactive()
          else {
            win.show()
            if (inside) win.focus()
          }
        })
        this.load(win)
      }
    } catch (err) {
      console.error('[colors] eyedropper', err)
      if (this.picking === picking) this.finish(null)
    }
  }

  /** One picture per screen, with its place on the desktop; 'denied' when macOS hides the screen. */
  private async screenShots(): Promise<{ image: NativeImage; bounds: Rect }[] | 'denied'> {
    const denied = (): boolean => process.platform === 'darwin' && ['denied', 'restricted'].includes(systemPreferences.getMediaAccessStatus('screen'))
    if (denied()) return 'denied'
    const displays = screen.getAllDisplays()
    const largest = displays.reduce(
      (size, d) => ({ width: Math.max(size.width, Math.round(d.size.width * d.scaleFactor)), height: Math.max(size.height, Math.round(d.size.height * d.scaleFactor)) }),
      { width: 0, height: 0 }
    )
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: largest })
    // macOS asked just now, or still says no: the pictures only show the wallpaper.
    if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') return 'denied'
    return displays.flatMap((display, i) => {
      const source = sources.find((s) => s.display_id === String(display.id)) ?? (sources.length === displays.length ? sources[i] : undefined)
      return source && !source.thumbnail.isEmpty() ? [{ image: source.thumbnail, bounds: display.bounds }] : []
    })
  }

  /** E2E tests: the active page, where it is on the screen. */
  private async pageShot(handle: BrowserWindowHandle | null): Promise<{ image: NativeImage; bounds: Rect }[]> {
    const wc = handle?.tabs.getActive()
    const page = handle && wc ? handle.tabs.pageBounds(wc.id) : null
    if (!handle || !wc || !page) return []
    const content = handle.window.getContentBounds()
    return [{ image: await wc.capturePage(), bounds: { x: content.x + page.x, y: content.y + page.y, width: page.width, height: page.height } }]
  }

  /** An eyedropper window: its screen's picture, pointer position in it. */
  async setup(sender: WebContents): Promise<ColorPickerSetup | null> {
    const shot = this.picking?.windows.find((w) => !w.win.isDestroyed() && w.win.webContents === sender)
    if (!shot) return null
    const cursor = screen.getCursorScreenPoint()
    const inside = cursor.x >= shot.bounds.x && cursor.x < shot.bounds.x + shot.bounds.width && cursor.y >= shot.bounds.y && cursor.y < shot.bounds.y + shot.bounds.height
    return { image: new Uint8Array(shot.image.toPNG()), cursor: inside ? { x: cursor.x - shot.bounds.x, y: cursor.y - shot.bounds.y } : null }
  }

  /** An eyedropper window: the color clicked, or null (Esc). Every window closes. */
  choose(sender: WebContents, hex: string | null): void {
    if (!this.picking?.windows.some((w) => !w.win.isDestroyed() && w.win.webContents === sender)) return
    this.finish(hex)
  }

  private finish(value: string | null): void {
    const picking = this.picking
    if (!picking) return
    this.picking = null
    for (const { win } of picking.windows) if (!win.isDestroyed()) win.destroy()
    const hex = value && normalizeHex(value)
    if (!hex) return
    const handle = picking.handle && !picking.handle.window.isDestroyed() ? picking.handle : this.windows.focusedNormal()
    const color = this.store.pick(hex)
    const copied = formatColor(hex, this.format())
    clipboard.writeText(copied)
    const active = handle.tabs.getActive()
    this.toast(handle, { mode: 'picked', color, copied, canScan: !!active && /^https?:/.test(active.getURL()) })
  }

  /** A frameless window over a whole screen, above everything (the menu bar and the Dock too). */
  private window(bounds: Rect): BrowserWindow {
    const win = new BrowserWindow({
      ...bounds,
      frame: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      enableLargerThanScreen: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hiddenInMissionControl: true,
      acceptFirstMouse: true,
      show: false,
      backgroundColor: '#000000',
      webPreferences: {
        preload: join(__dirname, '../preload/chrome.js'),
        additionalArguments: [`--zak-lang=${getLang()}`],
        session: this.pickerSession(),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
    // macOS keeps new windows below the menu bar: put it back over the whole screen.
    win.setBounds(bounds)
    return win
  }

  private load(win: BrowserWindow): void {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    void (devUrl ? win.loadURL(`${devUrl}#colorpicker`) : win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'colorpicker' })).catch(() => {})
  }

  private ses: Session | null = null

  /** Its own session, without any permission: it only shows a picture. */
  private pickerSession(): Session {
    if (this.ses) return this.ses
    const ses = session.fromPartition('zak-colorpicker')
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    ses.setPermissionCheckHandler(() => false)
    this.ses = ses
    return ses
  }

  // ─── Thumbnail (overlay) ────────────────────────────────────────────────────────────────────

  setFavorite(id: string, favorite: boolean): void {
    this.store.setFavorite(id, favorite)
  }

  copy(hex: string, format: ColorFormat): void {
    const clean = normalizeHex(hex)
    if (clean) clipboard.writeText(formatColor(clean, format))
  }

  /** The thumbnail in the page's bottom corner, a few seconds (or the setting's explanation). */
  private toast(handle: BrowserWindowHandle | null, toast: ColorsToast): void {
    const target = handle && !handle.window.isDestroyed() ? handle : null
    if (!target) return
    const active = target.tabs.getActive()
    const page = active ? target.tabs.pageBounds(active.id) : null
    if (!page) return
    const height = toast.mode === 'picked' ? TOAST_HEIGHT : toast.mode === 'scanning' ? 64 : 150
    const frame = { x: page.x + page.width - TOAST_WIDTH - 12, y: page.y + page.height - height - 12, width: TOAST_WIDTH, height }
    void target.overlay.open({ kind: 'colors-toast', frame, toast })
  }

  openPrivacy(): void {
    if (process.platform === 'darwin') void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
  }

  /** zak://colors in the window (an open one comes forward), `hash` to show a kit. */
  openPage(handle: BrowserWindowHandle, hash = ''): void {
    const wc = handle.tabs.getActive()
    handle.tabs.create(`${COLORS_PAGE_URL}${hash}`, { index: wc ? handle.tabs.indexOf(wc.id) + 1 : undefined })
  }

  // ─── Brand kit ──────────────────────────────────────────────────────────────────────────────

  /** Reads the page's brand kit, keeps it, and shows it on zak://colors next to the page. */
  async scan(handle: BrowserWindowHandle, wc: WebContents | null = handle.tabs.getActive() ?? null): Promise<void> {
    if (!this.enabled() || !wc || wc.isDestroyed()) return
    const url = wc.getURL()
    if (!/^https?:/.test(url)) {
      this.toast(handle, { mode: 'error', message: t('Ouvrez un site pour analyser sa charte graphique.') })
      return
    }
    if (this.scanning.has(wc.id)) return
    this.scanning.add(wc.id)
    const host = new URL(url).hostname.replace(/^www\./, '')
    this.toast(handle, { mode: 'scanning', host })
    try {
      const scan = (await wc.executeJavaScriptInIsolatedWorld(BRAND_WORLD_ID, [{ code: brandScript() }])) as BrandScan
      const [logo, icon, preview] = await Promise.all([
        this.logoOf(wc.session, scan),
        this.iconOf(wc.session, scan, url),
        wc
          .capturePage()
          .then((image) => (image.isEmpty() ? null : `data:image/jpeg;base64,${image.resize({ width: Math.min(PREVIEW_WIDTH, image.getSize().width) }).toJPEG(78).toString('base64')}`))
          .catch(() => null)
      ])
      const data: BrandData = { ...aggregateBrand(scan), logo, icon }
      const kit = this.store.addKit({ url, title: scan.title || host, host, data, preview })
      if (handle.overlay.showing()?.kind === 'colors-toast') handle.overlay.hide()
      if (!handle.window.isDestroyed()) handle.tabs.create(`${COLORS_PAGE_URL}#kit=${kit.id}`, { index: handle.tabs.indexOf(wc.id) + 1 })
    } catch (err) {
      console.error('[colors] brand kit', err)
      this.toast(handle, { mode: 'error', message: t('Impossible d’analyser cette page.') })
    } finally {
      this.scanning.delete(wc.id)
    }
  }

  /** The logo as a data: URL, so it shows offline (its address when it can't be fetched). */
  private async logoOf(ses: Session, scan: BrandScan): Promise<string | null> {
    if (!scan.logo) return null
    if (scan.logo.kind === 'svg') return `data:image/svg+xml;base64,${Buffer.from(scan.logo.markup).toString('base64')}`
    return (await fetchImage(ses, scan.logo.src)) ?? (/^https?:/.test(scan.logo.src) ? scan.logo.src : null)
  }

  private async iconOf(ses: Session, scan: BrandScan, url: string): Promise<string | null> {
    for (const href of scan.icons) {
      const data = await fetchImage(ses, href)
      if (data) return data
    }
    return fetchSiteIcon(url).catch(() => null)
  }
}

/** An image of the site, as a data: URL (null when too big, not an image, or unreachable). */
async function fetchImage(ses: Session, src: string): Promise<string | null> {
  if (src.startsWith('data:image/')) return src.length < MAX_LOGO_BYTES * 1.4 ? src : null
  if (!/^https?:/.test(src)) return null
  try {
    const res = await ses.fetch(src, { signal: AbortSignal.timeout(8000) })
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim()
    if (!res.ok || !type.startsWith('image/')) return null
    const body = Buffer.from(await res.arrayBuffer())
    if (body.length > MAX_LOGO_BYTES) return null
    return `data:${type};base64,${body.toString('base64')}`
  } catch {
    return null
  }
}
