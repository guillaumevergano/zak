import type { WebContents } from 'electron'
import type { PipSettings } from '@shared/types'
import { DEFAULT_PIP_SETTINGS, isExcluded } from './domains'

/** Isolated world of the PiP scripts: the page can't see or fake which videos were chosen. */
export const PIP_WORLD_ID = 2003

/**
 * Installed in every page (isolated world): remembers the videos the user started, i.e. that
 * began playing or were unmuted right after a click or a key press in the page (transient user
 * activation). Videos a feed starts by itself (X, Instagram…) never count.
 */
export const WATCH_SCRIPT = `(() => {
  if (window.__zakPipChosen) return
  const chosen = (window.__zakPipChosen = new WeakSet())
  const byUser = () => navigator.userActivation && navigator.userActivation.isActive
  document.addEventListener('play', (e) => {
    if (e.target instanceof HTMLVideoElement && byUser()) chosen.add(e.target)
  }, true)
  document.addEventListener('volumechange', (e) => {
    const v = e.target
    if (v instanceof HTMLVideoElement && !v.muted && v.volume > 0 && byUser()) chosen.add(v)
  }, true)
})()`

/**
 * The video to float: the largest playing <video> (> 200×100 px), or null.
 * Only videos the user started count (WATCH_SCRIPT), unless `autoplayed`; with `skipMuted`,
 * muted (or volume 0) videos don't count.
 * Only the top document is inspected (videos inside cross-origin iframes are out of scope for v1).
 */
export const pickVideo = (skipMuted: boolean, autoplayed: boolean): string => `
  const chosen = window.__zakPipChosen
  const playing = Array.from(document.querySelectorAll('video')).filter((v) => {
    const r = v.getBoundingClientRect()
    if (${skipMuted} && (v.muted || v.volume === 0)) return false
    if (!${autoplayed} && !(chosen && chosen.has(v))) return false
    return !v.paused && !v.ended && v.readyState > 2 && r.width > 200 && r.height > 100
  })
  const area = (v) => { const r = v.getBoundingClientRect(); return r.width * r.height }
  playing.sort((a, b) => area(b) - area(a))
  const video = playing[0] || null
`

/** Native Picture-in-Picture for that video (`disablepictureinpicture` cleared). Resolves to true when active. */
const enterPipScript = (skipMuted: boolean, autoplayed: boolean): string => `(async () => {
  ${pickVideo(skipMuted, autoplayed)}
  if (!video) return false
  if (document.pictureInPictureElement === video) return true
  video.removeAttribute('disablepictureinpicture')
  video.disablePictureInPicture = false
  try {
    await video.requestPictureInPicture()
    return true
  } catch (e) {
    console.warn('[zak] PiP refused:', e && e.message)
    return false
  }
})()`

const EXIT_PIP_SCRIPT = `(async () => {
  if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return true }
  return false
})()`

/** Arc-style automatic PiP (CLAUDE.md §6.4). Settings are read on every switch: changes apply at once. */
export class PipController {
  /** Zak's own floating player (MiniPlayer.ts), set at startup; the native one without it. */
  miniPlayer: { open: (wc: WebContents, settings: PipSettings) => Promise<boolean>; giveBack: (wc: WebContents) => void } | null = null

  constructor(private readonly settings: () => PipSettings = () => DEFAULT_PIP_SETTINGS) {}

  /** Starts watching which videos the user starts in a tab, on each page it loads. */
  watch(wc: WebContents): void {
    wc.on('dom-ready', () => {
      if (!wc.isDestroyed()) void wc.executeJavaScriptInIsolatedWorld(PIP_WORLD_ID, [{ code: WATCH_SCRIPT }]).catch(() => {})
    })
  }

  /**
   * Called before the tab being left is hidden; the caller waits for it (bounded). Chromium pauses
   * muted / video-only playback as soon as a page is hidden, so PiP must start while it is visible.
   */
  onTabLeaving(previous: WebContents): Promise<void> {
    return this.enter(previous)
  }

  onTabActivated(next: WebContents): void {
    if (this.settings().closeOnReturn) void this.exit(next)
  }

  onWindowMinimized(active: WebContents | undefined): void {
    if (active) void this.enter(active)
  }

  onWindowRestored(active: WebContents | undefined): void {
    // Zak's player holds the page itself: it always comes back to the window.
    if (active) this.miniPlayer?.giveBack(active)
    if (this.settings().closeOnReturn && active) void this.exit(active)
  }

  private async enter(wc: WebContents): Promise<void> {
    const settings = this.settings()
    if (!settings.enabled || wc.isDestroyed() || isExcluded(wc.getURL(), settings.excludedDomains)) return
    if (settings.style === 'zak' && this.miniPlayer) {
      await this.miniPlayer.open(wc, settings)
      return
    }
    try {
      // userGesture = true is mandatory: requestPictureInPicture() needs a user activation.
      const script = enterPipScript(settings.skipMuted, settings.autoplayed)
      const ok = (await wc.executeJavaScriptInIsolatedWorld(PIP_WORLD_ID, [{ code: script }], true)) as boolean
      if (ok) console.log(`[pip] entered on ${wc.getURL()}`)
    } catch (err) {
      console.warn('[pip] enter failed', err)
    }
  }

  private async exit(wc: WebContents): Promise<void> {
    if (wc.isDestroyed()) return
    try {
      await wc.executeJavaScript(EXIT_PIP_SCRIPT, true)
    } catch {
      /* page may be navigating; nothing to close */
    }
  }
}
