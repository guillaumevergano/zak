import type { WebContents } from 'electron'
import type { PipSettings } from '@shared/types'
import { DEFAULT_PIP_SETTINGS, isExcluded } from './domains'

/**
 * Picks the largest playing <video> (> 200×100 px), clears `disablepictureinpicture`
 * and requests native Picture-in-Picture. Resolves to true when PiP is active.
 * With `skipMuted`, muted (or volume 0) videos don't count.
 * Only the top document is inspected (videos inside cross-origin iframes are out of scope for v1).
 */
const enterPipScript = (skipMuted: boolean): string => `(async () => {
  const skipMuted = ${skipMuted}
  const playing = Array.from(document.querySelectorAll('video')).filter((v) => {
    const r = v.getBoundingClientRect()
    if (skipMuted && (v.muted || v.volume === 0)) return false
    return !v.paused && !v.ended && v.readyState > 2 && r.width > 200 && r.height > 100
  })
  if (playing.length === 0) return false
  const area = (v) => { const r = v.getBoundingClientRect(); return r.width * r.height }
  playing.sort((a, b) => area(b) - area(a))
  const video = playing[0]
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
  constructor(private readonly settings: () => PipSettings = () => DEFAULT_PIP_SETTINGS) {}

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
    if (this.settings().closeOnReturn && active) void this.exit(active)
  }

  private async enter(wc: WebContents): Promise<void> {
    const settings = this.settings()
    if (!settings.enabled || wc.isDestroyed() || isExcluded(wc.getURL(), settings.excludedDomains)) return
    try {
      // userGesture = true is mandatory: requestPictureInPicture() needs a user activation.
      const ok: boolean = await wc.executeJavaScript(enterPipScript(settings.skipMuted), true)
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
