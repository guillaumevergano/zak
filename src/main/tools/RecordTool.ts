import { getLang, t } from '@shared/i18n'
import { createWriteStream, type WriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  BrowserWindow,
  desktopCapturer,
  nativeImage,
  screen,
  session,
  shell,
  systemPreferences,
  type MenuItemConstructorOptions,
  type Session,
  type WebContents
} from 'electron'
import type { RecordAccess, RecorderCommand, RecorderSetup, RecordRequest, RecordSettings, RecordSource } from '@shared/tools'
import type { SettingsStore } from '../store/settings'
import type { BrowserWindowHandle, WindowManager } from '../windows/WindowManager'
import { uniquePath } from '../downloads/DownloadsManager'
import { screenshotName } from './screenshot'
import type { ScreenshotTool } from './ScreenshotTool'

const BUBBLE_SIZE = 200
const CONTROLS_WIDTH = 236
const CONTROLS_HEIGHT = 52
const MARGIN = 24

/** E2E tests: no real screen (the test app has no screen recording permission), a drawn picture. */
const FAKE = process.env['ZAK_E2E'] === '1' && process.env['ZAK_RECORD_FAKE'] === '1'

interface Recording {
  /** The window it was started from: the thumbnail shows there at the end. */
  handle: BrowserWindowHandle
  request: RecordRequest
  controls: BrowserWindow
  bubble: BrowserWindow | null
  file: { path: string; stream: WriteStream } | null
  /** Chunks may arrive before the file is open (never in practice): kept in order. */
  pending: Buffer[]
}

/**
 * « Enregistrement de l'écran » (CLAUDE.md §6.8), à la Loom. A panel over the page picks a screen or
 * a window, the camera and the microphone. The camera shows in a round bubble above everything
 * (in the video, like Loom); the controls (countdown, time, pause, stop, throw away) in a small
 * pill kept out of the video (content protection). Both are Zak's own windows, recording in the
 * controls' renderer (MediaRecorder): the pieces are written to a file in the downloads folder as
 * they come. Nothing leaves the computer.
 */
export class RecordTool {
  private current: Recording | null = null
  /** The recording started or stopped: the File menu's entry changes. */
  onChange: () => void = () => {}

  constructor(
    private readonly settings: SettingsStore,
    private readonly windows: WindowManager,
    private readonly screenshots: ScreenshotTool,
    private readonly downloadDir: () => string
  ) {}

  enabled(): boolean {
    return this.settings.getTools().record.enabled
  }

  recording(): boolean {
    return this.current !== null
  }

  /** The sidebar icon, the File menu, the page menu: the setup panel, or stop when recording. */
  start(handle: BrowserWindowHandle): void {
    if (this.current) {
      this.command('stop')
      return
    }
    if (!this.enabled() || handle.window.isDestroyed()) return
    const active = handle.tabs.getActive()
    const frame = active ? handle.tabs.pageBounds(active.id) : null
    if (frame) void handle.overlay.open({ kind: 'record-setup', frame })
  }

  menuItems(handle: BrowserWindowHandle): MenuItemConstructorOptions[] {
    if (!this.enabled()) return []
    return [{ label: this.current ? t('Arrêter l’enregistrement') : t('Enregistrer l’écran…'), click: () => this.start(handle) }]
  }

  settingsNow(): RecordSettings {
    return this.settings.getTools().record
  }

  async access(ask: boolean): Promise<RecordAccess> {
    if (process.platform !== 'darwin' || FAKE) return { screen: 'granted', camera: true, mic: true }
    const status = (kind: 'camera' | 'microphone'): string => systemPreferences.getMediaAccessStatus(kind)
    const camera = status('camera') === 'granted' || (ask && status('camera') === 'not-determined' && (await systemPreferences.askForMediaAccess('camera')))
    const mic = status('microphone') === 'granted' || (ask && status('microphone') === 'not-determined' && (await systemPreferences.askForMediaAccess('microphone')))
    return { screen: systemPreferences.getMediaAccessStatus('screen') as RecordAccess['screen'], camera, mic }
  }

  openPrivacy(kind: 'screen' | 'camera' | 'mic'): void {
    if (process.platform === 'darwin') {
      const pane = kind === 'screen' ? 'Privacy_ScreenCapture' : kind === 'camera' ? 'Privacy_Camera' : 'Privacy_Microphone'
      void shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`)
    } else if (process.platform === 'win32') {
      void shell.openExternal(kind === 'camera' ? 'ms-settings:privacy-webcam' : 'ms-settings:privacy-microphone')
    }
  }

  async sources(): Promise<RecordSource[]> {
    if (FAKE) {
      const thumbnail = nativeImage.createFromBitmap(Buffer.alloc(32 * 20 * 4, 120), { width: 32, height: 20 }).toDataURL()
      return [{ id: 'fake:screen', name: t('Écran'), kind: 'screen', thumbnail, appIcon: null }]
    }
    const own = new Set([this.current?.controls, this.current?.bubble].filter((w): w is BrowserWindow => !!w && !w.isDestroyed()).map((w) => w.getMediaSourceId()))
    const found = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 200 }, fetchWindowIcons: true })
    const screens = found.filter((s) => s.id.startsWith('screen:'))
    return found
      .filter((s) => !own.has(s.id) && (s.id.startsWith('screen:') || s.name.trim() !== ''))
      .map((s) => ({
        id: s.id,
        name: s.id.startsWith('screen:') ? (screens.length > 1 ? t('Écran {n}', { n: screens.indexOf(s) + 1 }) : t('Écran entier')) : s.name,
        kind: s.id.startsWith('screen:') ? ('screen' as const) : ('window' as const),
        thumbnail: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL(),
        appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.resize({ width: 32 }).toDataURL() : null
      }))
  }

  /** « Enregistrer » in the setup panel: the choices are kept for next time, the windows open. */
  async begin(handle: BrowserWindowHandle, request: RecordRequest): Promise<void> {
    if (this.current || !this.enabled()) return
    if (handle.overlay.showing()?.kind === 'record-setup') handle.overlay.close()
    const tools = this.settings.getTools()
    this.settings.setTools({
      ...tools,
      record: {
        ...tools.record,
        camera: request.camera !== null,
        cameraLabel: request.camera ?? tools.record.cameraLabel,
        mic: request.mic !== null,
        micLabel: request.mic ?? tools.record.micLabel
      }
    })

    const area = this.displayOf(request.sourceId, handle).workArea
    const controls = this.window({
      x: Math.round(area.x + (area.width - CONTROLS_WIDTH) / 2),
      y: area.y + area.height - CONTROLS_HEIGHT - MARGIN,
      width: CONTROLS_WIDTH,
      height: CONTROLS_HEIGHT
    })
    // Kept out of the recording (and of other screen captures).
    controls.setContentProtection(true)
    const bubble =
      request.camera !== null
        ? this.window({ x: area.x + MARGIN, y: area.y + area.height - BUBBLE_SIZE - MARGIN, width: BUBBLE_SIZE, height: BUBBLE_SIZE })
        : null
    const recording: Recording = { handle, request, controls, bubble, file: null, pending: [] }
    this.current = recording
    controls.on('closed', () => {
      // Closed some other way (the system): what was recorded stays.
      if (this.current === recording) void this.finish(controls.webContents, null)
    })
    this.load(controls, 'recorder-controls')
    if (bubble) this.load(bubble, `recorder-camera=${encodeURIComponent(request.camera ?? '')}`)
    this.onChange()
  }

  /** Controls only: what to record. */
  setup(sender: WebContents): RecorderSetup | null {
    const rec = this.current
    if (!rec || rec.controls.webContents !== sender) return null
    return { sourceId: rec.request.sourceId, mic: rec.request.mic, fake: FAKE }
  }

  /** Controls only: the recorder started; the file opens. */
  open(sender: WebContents, extension: 'mp4' | 'webm'): void {
    const rec = this.current
    if (!rec || rec.controls.webContents !== sender || rec.file) return
    const path = uniquePath(this.downloadDir(), screenshotName(t('Enregistrement'), new Date(), extension === 'mp4' ? 'mp4' : 'webm'))
    const stream = createWriteStream(path)
    stream.on('error', () => {})
    rec.file = { path, stream }
    for (const chunk of rec.pending.splice(0)) stream.write(chunk)
  }

  write(sender: WebContents, chunk: ArrayBuffer): void {
    const rec = this.current
    if (!rec || rec.controls.webContents !== sender || !(chunk instanceof ArrayBuffer)) return
    const data = Buffer.from(chunk)
    if (rec.file) rec.file.stream.write(data)
    else rec.pending.push(data)
  }

  /** Controls only: the last piece was sent. The file closes and its thumbnail shows. */
  async finish(sender: WebContents, thumbnail: string | null): Promise<void> {
    const rec = this.current
    if (!rec || rec.controls.webContents !== sender) return
    this.current = null
    this.close(rec)
    const file = rec.file
    if (!file) return
    await new Promise<void>((resolve) => file.stream.end(resolve))
    const image = thumbnail?.startsWith('data:image/') ? nativeImage.createFromDataURL(thumbnail) : nativeImage.createEmpty()
    const handle = rec.handle.window.isDestroyed() ? this.windows.focusedNormal() : rec.handle
    this.screenshots.showFile(handle, file.path, image, true)
  }

  /** Controls only: thrown away, the file deleted. */
  async discard(sender: WebContents): Promise<void> {
    const rec = this.current
    if (!rec || rec.controls.webContents !== sender) return
    this.current = null
    this.close(rec)
    const file = rec.file
    if (!file) return
    await new Promise<void>((resolve) => file.stream.end(resolve))
    await rm(file.path, { force: true })
  }

  /** From the menu or the sidebar icon: passed on to the controls, which do it. */
  command(command: RecorderCommand): void {
    const rec = this.current
    if (rec && !rec.controls.isDestroyed()) rec.controls.webContents.send('record:command', command)
  }

  private close(rec: Recording): void {
    for (const win of [rec.controls, rec.bubble]) if (win && !win.isDestroyed()) win.destroy()
    this.onChange()
  }

  /** The screen being recorded (a window: the one Zak's window is on). */
  private displayOf(sourceId: string, handle: BrowserWindowHandle): Electron.Display {
    const displayId = /^screen:(\d+)/.exec(sourceId)?.[1]
    const shown = displayId && screen.getAllDisplays().find((d) => String(d.id) === displayId)
    return shown || screen.getDisplayMatching(handle.window.getBounds())
  }

  /** A small frameless window above everything, on every desktop, that never takes the focus. */
  private window(bounds: Electron.Rectangle): BrowserWindow {
    const win = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hiddenInMissionControl: true,
      acceptFirstMouse: true,
      focusable: process.platform !== 'darwin',
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/chrome.js'),
        additionalArguments: [`--zak-lang=${getLang()}`],
        session: this.recorderSession(),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
    win.once('ready-to-show', () => win.showInactive())
    return win
  }

  private load(win: BrowserWindow, hash: string): void {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    void (devUrl ? win.loadURL(`${devUrl}#${hash}`) : win.loadFile(join(__dirname, '../renderer/index.html'), { hash })).catch(() => {})
  }

  private ses: Session | null = null

  /**
   * The recorder's own session: camera and microphone allowed for its windows only, and the screen
   * (getDisplayMedia) answered with the source picked in the panel, for the controls only.
   */
  private recorderSession(): Session {
    if (this.ses) return this.ses
    const ses = session.fromPartition('zak-recorder')
    const ours = (wc: WebContents | null): boolean =>
      !!wc && !!this.current && (wc === this.current.controls.webContents || wc === this.current.bubble?.webContents)
    ses.setPermissionRequestHandler((wc, permission, callback) => callback(ours(wc) && (permission === 'media' || permission === 'display-capture')))
    ses.setPermissionCheckHandler((wc, permission) => ours(wc) && (permission === 'media' || permission === 'display-capture'))
    ses.setDisplayMediaRequestHandler((request, callback) => {
      const rec = this.current
      const frame = request.frame
      if (!rec || !frame || rec.controls.webContents.mainFrame !== frame) return callback({})
      void desktopCapturer
        .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
        .then((all) => {
          const source = all.find((s) => s.id === rec.request.sourceId)
          callback(source ? { video: source } : {})
        })
        .catch(() => callback({}))
    })
    this.ses = ses
    return ses
  }
}
