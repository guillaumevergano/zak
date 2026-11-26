import type { WebContents } from 'electron'
import type { MediaAction, MediaState } from '@shared/media'
import type { BrowserWindowHandle, WindowManager } from '../windows/WindowManager'
import { actionScript, STATE_SCRIPT, volumeScript } from './pageScripts'

/** How often the playing tab is read again (title, play/pause), while there is one. */
const POLL_MS = 1500

interface PageMedia {
  media: boolean
  playing: boolean
  title: string
  artist: string
  artwork: string
  volume: number | null
  actions: string[]
}

/** Shown in the chrome UI: an address of its own, or a picture. Anything else (blob:, javascript:…) is dropped. */
const safeImage = (url: string | null): string | null => (url && /^(https:|data:image\/)/i.test(url) ? url : null)

/**
 * Media controls at the bottom of the sidebar (CLAUDE.md §6.2): the tab of the window that plays
 * (the last one that started making sound), its title, cover art and ⏮ ⏯ ⏭ and volume. A paused
 * player stays there until its page has no media left or the tab closes.
 */
export class MediaController {
  /** Per window: the tab shown, and what was last sent (to send only changes). */
  private shown = new Map<BrowserWindowHandle, { tabId: number; sent: string }>()
  /** When each tab started making sound (the last one wins). */
  private audibleSince = new Map<number, number>()

  constructor(private readonly windows: WindowManager) {
    setInterval(() => void this.pollAll(), POLL_MS).unref()
  }

  state(handle: BrowserWindowHandle): Promise<MediaState | null> {
    return this.poll(handle)
  }

  async act(handle: BrowserWindowHandle, action: MediaAction): Promise<void> {
    const tabId = this.shown.get(handle)?.tabId
    const wc = tabId !== undefined ? handle.tabs.get(tabId) : undefined
    if (!wc || wc.isDestroyed() || tabId === undefined) return
    if (action === 'show') handle.tabs.activate(tabId)
    else if (action === 'mute' || action === 'unmute') wc.setAudioMuted(action === 'mute')
    // A user gesture: play() is allowed, and the site's handler runs as if a media key was pressed.
    else await wc.executeJavaScript(actionScript(action), true).catch(() => false)
    await this.poll(handle)
  }

  async setVolume(handle: BrowserWindowHandle, volume: number): Promise<void> {
    const tabId = this.shown.get(handle)?.tabId
    const wc = tabId !== undefined ? handle.tabs.get(tabId) : undefined
    if (!wc || wc.isDestroyed() || !Number.isFinite(volume)) return
    await wc.executeJavaScript(volumeScript(volume)).catch(() => false)
    if (volume > 0 && wc.isAudioMuted()) wc.setAudioMuted(false)
    await this.poll(handle)
  }

  private async pollAll(): Promise<void> {
    for (const handle of this.windows.all()) await this.poll(handle)
  }

  /** Picks the window's playing tab, reads it, and tells the sidebar when something changed. */
  private async poll(handle: BrowserWindowHandle): Promise<MediaState | null> {
    if (handle.window.isDestroyed()) {
      this.shown.delete(handle)
      return null
    }
    const pages = handle.tabs.webContentsList()
    const now = Date.now()
    for (const wc of pages) {
      if (wc.isCurrentlyAudible()) {
        if (!this.audibleSince.has(wc.id)) this.audibleSince.set(wc.id, now)
      } else this.audibleSince.delete(wc.id)
    }
    const audible = pages.filter((wc) => this.audibleSince.has(wc.id)).sort((a, b) => this.audibleSince.get(b.id)! - this.audibleSince.get(a.id)!)
    const previous = this.shown.get(handle)
    const candidates = [...audible, ...pages.filter((wc) => wc.id === previous?.tabId && !this.audibleSince.has(wc.id))]

    let state: MediaState | null = null
    for (const wc of candidates) {
      state = await this.read(handle, wc)
      if (state) break
    }
    const sent = JSON.stringify(state)
    if (sent !== previous?.sent) this.windows.send(handle, 'media:state', state)
    if (state) this.shown.set(handle, { tabId: state.tabId, sent })
    else this.shown.delete(handle)
    return state
  }

  private async read(handle: BrowserWindowHandle, wc: WebContents): Promise<MediaState | null> {
    if (wc.isDestroyed()) return null
    const page = (await wc.executeJavaScript(STATE_SCRIPT).catch(() => null)) as PageMedia | null
    const audible = wc.isCurrentlyAudible()
    // Nothing to control any more: no player in the page, and no sound (a sound of its own, a call…).
    if (!audible && !page?.media) return null
    const tab = handle.tabs.getState().tabs.find((t) => t.id === wc.id)
    const title = typeof page?.title === 'string' ? page.title.trim() : ''
    const artist = typeof page?.artist === 'string' ? page.artist.trim() : ''
    let site = ''
    try {
      site = new URL(wc.getURL()).hostname.replace(/^www\./, '')
    } catch {
      /* not an address with a host */
    }
    const actions = Array.isArray(page?.actions) ? page.actions : []
    return {
      tabId: wc.id,
      title: title || tab?.title || wc.getTitle() || site,
      subtitle: artist || site,
      artwork: safeImage(typeof page?.artwork === 'string' ? page.artwork : null) ?? safeImage(tab?.favicon ?? null),
      // The page knows best (the sound stops a moment after a pause); a sound without a player, only the sound.
      playing: page?.media ? page.playing === true : audible,
      canPrevious: actions.includes('previoustrack'),
      canNext: actions.includes('nexttrack'),
      volume: typeof page?.volume === 'number' && Number.isFinite(page.volume) ? page.volume : null,
      muted: wc.isAudioMuted()
    }
  }
}
