import type { SessionStore, SessionTab, SessionWindow } from '../store/sessions'
import type { BrowserWindowHandle, WindowManager } from '../windows/WindowManager'

const SAVE_DELAY_MS = 800
const CLOSED_WINDOWS = 10

/**
 * Session restore (CLAUDE.md §6.7): the tabs of the normal windows are saved as they change
 * (never private ones, §6.3) and reopened at launch, or from « Reprendre la navigation » on the new
 * tab page. Closing the last window keeps its tabs; quitting keeps every window's.
 * Also « Rouvrir la fenêtre fermée ».
 */
export class SessionRestore {
  /** What was saved by the previous run, read once at launch. */
  private readonly previous: SessionWindow[]
  private previousReopened = false
  private closedWindows: SessionWindow[] = []
  private frozen = false
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly store: SessionStore,
    private readonly windows: WindowManager
  ) {
    this.previous = store.load().filter((w) => w.length > 0)
    windows.on('tabs-changed', (handle) => {
      if (!handle.private) this.schedule()
    })
    windows.on('window-closing', (handle) => {
      if (handle.private || this.frozen) return
      const tabs = snapshot(handle)
      if (tabs.length > 0) this.closedWindows = [...this.closedWindows, tabs].slice(-CLOSED_WINDOWS)
      // After `closed`, once the window has left the list.
      this.schedule()
    })
  }

  /** Windows to open at launch: the previous session's when `restore` is on and there is one. */
  launchWindows(startup: 'restore' | 'newtab'): SessionWindow[] {
    if (startup !== 'restore' || this.previous.length === 0) return []
    this.previousReopened = true
    return this.previous
  }

  canReopenPrevious(): boolean {
    return !this.previousReopened && this.previous.length > 0
  }

  /** « Reprendre la navigation »: the previous session's windows, once. */
  reopenPrevious(): void {
    if (!this.canReopenPrevious()) return
    this.previousReopened = true
    for (const tabs of this.previous) this.windows.create([], { tabs })
  }

  canReopenClosedWindow(): boolean {
    return this.closedWindows.length > 0
  }

  reopenClosedWindow(): void {
    const tabs = this.closedWindows.pop()
    if (tabs) this.windows.create([], { tabs })
  }

  /** Quitting: save now, and keep it as is while the windows close. */
  freeze(): void {
    if (this.frozen) return
    this.save()
    this.frozen = true
  }

  private schedule(): void {
    if (this.frozen) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.save()
    }, SAVE_DELAY_MS)
  }

  private save(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const normal = this.windows.all().filter((h) => !h.private && !h.window.isDestroyed())
    const session = normal.map(snapshot).filter((tabs) => tabs.length > 0)
    // The last window was closed (macOS keeps the app running): keep its tabs for next launch.
    if (session.length === 0) return
    this.store.save(session)
  }
}

/** Real pages only: an empty new tab isn't worth restoring. */
function snapshot(handle: BrowserWindowHandle): SessionTab[] {
  const { tabs, activeId, groups, splits } = handle.tabs.getState()
  return tabs
    // The favorites' tabs open again from their tiles.
    .filter((t) => t.url !== '' && !t.url.startsWith('zak://newtab') && t.favoriteId === null)
    .map((t) => {
      const split = splits.find((s) => s.tabs.includes(t.id))
      return {
        url: t.url,
        title: t.title,
        pinned: t.pinned,
        active: t.id === activeId,
        group: groups.find((g) => g.id === t.groupId) ?? null,
        split: split ? { id: split.id, ratio: split.ratio } : null
      }
    })
}
