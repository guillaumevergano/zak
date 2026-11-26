import { t } from '@shared/i18n'
import { EventEmitter } from 'node:events'
import { WebContentsView, type BaseWindow, type Session, type WebContents } from 'electron'
import type { LayoutInsets, PageScroll, Rect, TabGroupInfo, TabId, TabInfo, TabSplitInfo, TabsState } from '@shared/types'
import { randomBytes, randomUUID } from 'node:crypto'
import { SCROLL_PREFIX, SCROLL_WORLD_ID, scrollScript, scrollToScript } from './scrollScript'
import { endOfGroup, groupAt, nextColor, usedGroups } from './groups'
import { outsideSplits, partnerOf, repairSplits, splitOf } from './splits'
import { clampRatio, splitRects, SPLIT_ZOOM } from '@shared/split'
import { manageIdentity, trackIdentitySetup } from '../userAgent'
import { NEW_TAB_URL, errorPageUrl, failedUrlOf, isNewTabUrl, toUrl, type SearchEngine } from '@shared/url'
import { isInternalUrl } from '../internal/InternalProtocol'
import { INTERNAL_FAVICON } from '../internal/favicon'
import { blockedThreat } from '../safety/SafeBrowsing'

const HIDE_DELAY_MS = 600
/** The page sits in the cream panel with rounded corners (CLAUDE.md §7). */
const PAGE_RADIUS = 12
/** Cmd/Ctrl+Shift+T stack depth (CLAUDE.md §6.1). */
const CLOSED_STACK_SIZE = 20

/**
 * The page's own vertical scrollbar is hidden (`html`, !important to beat the site's style): the
 * chrome UI draws a thin one in the gutter next to the page (scrollScript.ts). Inner scrollers
 * keep a scrollbar:
 * thin, in the app's colors (CLAUDE.md §7). A transparent track also lets
 * the page's rounded corners show (Chromium's default track fills the top-right corner). User
 * origin: sites that style their own scrollbars keep theirs.
 */
const SCROLLBAR_CSS = `
::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgb(120 90 115 / 0.38); border: 2.5px solid transparent;
  border-radius: 10px; background-clip: padding-box; min-height: 40px;
}
::-webkit-scrollbar-thumb:hover { background-color: rgb(120 90 115 / 0.62); }
::-webkit-scrollbar-thumb:active { background-color: rgb(198 122 251 / 0.75); }
html { scrollbar-width: none !important; }
`

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface Tab {
  id: TabId
  view: WebContentsView
  /** Kept separately: `view.webContents` is undefined once the page has been destroyed. */
  wc: WebContents
  favicon: string | null
  pinned: boolean
  /** Last committed URL, still readable once `wc` is destroyed. */
  url: string
  /** Chrome identity being installed over CDP (userAgent.ts); see dispose(). */
  setup: Promise<void>
  /** Last time the tab was shown (or created), for the tab sleep. */
  lastActive: number
  /** Asleep: the page was swapped for about:blank to free memory; what to show and reload. */
  asleep: { url: string; title: string; favicon: string | null } | null
  groupId: string | null
  /** Secret of the scroll reports of this tab's page (scrollScript.ts). */
  scrollNonce: string
}

interface ClosedTab {
  url: string
  index: number
  pinned: boolean
}

export interface CreateTabOptions {
  active?: boolean
  /** Position in the strip; defaults to the end. Clamped to the unpinned group. */
  index?: number
  pinned?: boolean
  /** Tab group to put it in (session restore). By default a tab placed inside a group joins it. */
  groupId?: string | null
  /**
   * Give the page the keyboard focus when it becomes active (default). Off for a new tab: the
   * omnibox takes it, and a focused page would grab it back as it loads.
   */
  focusPage?: boolean
}

export interface TabManagerEvents {
  /** A tab was created; `webContents` is ready to be registered with the extensions system. */
  created: [webContents: WebContents]
  /** Active tab changed. `previous` is null on first activation. */
  activated: [previous: WebContents | null, next: WebContents]
  removed: [webContents: WebContents]
  /** Tab list or a tab's metadata changed; the renderer should re-render. */
  changed: []
  /** A page reported its favicon (favorites remember it for their tiles). */
  favicon: [pageUrl: string, favicon: string]
  /** The last tab was closed: the window should close, like Chrome. */
  empty: []
  /** The page scrolled or changed height; null: a new page, nothing known yet. */
  scroll: [id: TabId, scroll: PageScroll | null]
  /** Context menu requested inside a tab. */
  'context-menu': [webContents: WebContents, params: Electron.ContextMenuParams]
}

/**
 * One WebContentsView per tab, all in the window's session. Only the active view is visible.
 * Bounds come from the layout insets sent by the chrome renderer (`layout:update`).
 * Pinned tabs always come first in `order`.
 */
export class TabManager extends EventEmitter<TabManagerEvents> {
  /** Engine for omnibox searches (zak://settings); set once by index.ts. */
  static searchEngine: () => SearchEngine = () => 'google'

  private tabs = new Map<TabId, Tab>()
  private readonly groups = new Map<string, TabGroupInfo>()
  /** Split views: pairs of tabs shown side by side (splits.ts). */
  private readonly splits = new Map<string, TabSplitInfo>()
  private order: TabId[] = []
  private activeId: TabId | null = null
  /** Tabs whose page is on screen: the active one, and its partner in a split view. */
  private shown = new Set<TabId>()
  /** Tabs zoomed out for their split view (isolated zoom, see syncSplitZoom). */
  private readonly splitZoomed = new Set<TabId>()
  private insets: LayoutInsets = { left: 0, top: 0, right: 0, bottom: 0 }
  private closed: ClosedTab[] = []

  /** A page in HTML full screen (a video…): it covers the whole window, chrome UI hidden. */
  private fullScreenTab: TabId | null = null
  /** Whether we put the window in full screen for it (to leave it the same way). */
  private madeWindowFullScreen = false

  /** What "+", Cmd/Ctrl+T and "Tout fermer" open: zak://newtab (dark in private windows). */
  newTabUrl: string = NEW_TAB_URL

  /**
   * Awaited (at most HIDE_DELAY_MS) before the previous tab is hidden, so work that needs a visible
   * page can run first — automatic PiP: Chromium pauses muted videos in hidden pages.
   */
  beforeHide: ((previous: WebContents) => Promise<unknown>) | null = null

  /** Gives the keyboard focus back to the chrome UI (the omnibox of a new tab keeps it). */
  focusChrome: (() => void) | null = null

  /**
   * Tab sleep (CLAUDE.md §6.1): minutes of inactivity after which a background tab is unloaded,
   * or null when off. Set by index.ts from the settings.
   */
  static sleepAfterMinutes: () => number | null = () => null

  /** Zoom remembered for the site of a URL (ZoomController); set once by index.ts. */
  static siteZoom: (url: string) => number = () => 1

  constructor(
    private readonly window: BaseWindow,
    private readonly session: Session
  ) {
    super()
    window.on('resize', () => this.layout())
    const timer = setInterval(() => this.sleepIdleTabs(), 60_000)
    timer.unref()
    window.once('closed', () => clearInterval(timer))
  }

  /**
   * Unloads the background tabs left alone long enough: the page is replaced by about:blank (its
   * renderer and memory are freed) and comes back, reloaded, when the tab is shown again. Like
   * Chrome's Memory Saver: not a tab playing sound, a loading one, or a page that asks before
   * leaving (beforeunload cancels the navigation, so the tab stays awake).
   */
  sleepIdleTabs(now = Date.now()): void {
    const minutes = TabManager.sleepAfterMinutes()
    if (minutes === null) return
    for (const tab of this.tabs.values()) {
      const wc = tab.wc
      if (this.shown.has(tab.id) || tab.asleep || wc.isDestroyed()) continue
      if (now - tab.lastActive < minutes * 60_000) continue
      if (wc.isCurrentlyAudible() || wc.isLoading() || !/^https?:/.test(wc.getURL())) continue
      this.sleep(tab)
    }
  }

  private sleep(tab: Tab): void {
    const wc = tab.wc
    tab.asleep = { url: wc.getURL(), title: wc.getTitle(), favicon: tab.favicon }
    wc.loadURL('about:blank')
      .then(() => {
        if (wc.isDestroyed() || wc.getURL() !== 'about:blank') tab.asleep = null
        this.emit('changed')
      })
      .catch(() => {
        tab.asleep = null // the page refused to leave (beforeunload), or navigated meanwhile
      })
  }

  /** Reloads a sleeping tab where it was, without leaving about:blank in its history. */
  private wake(tab: Tab): void {
    const asleep = tab.asleep
    if (!asleep) return
    tab.asleep = null
    const wc = tab.wc
    const nav = wc.navigationHistory
    const blank = nav.getActiveIndex()
    const previous = nav.getEntryAtIndex(blank - 1)
    if (wc.getURL() === 'about:blank' && previous?.url === asleep.url) {
      wc.once('did-navigate', () => {
        if (!wc.isDestroyed() && nav.getEntryAtIndex(blank)?.url === 'about:blank') nav.removeEntryAtIndex(blank)
      })
      nav.goBack()
    } else void wc.loadURL(asleep.url).catch(() => {})
    tab.favicon = asleep.favicon
  }

  create(url: string = this.newTabUrl, opts: CreateTabOptions = {}): WebContents {
    const view = new WebContentsView({
      webPreferences: {
        session: this.session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
        // No custom preload: pages only get the electron-chrome-extensions preload,
        // which that lib registers on the session itself (CLAUDE.md §3).
      }
    })
    const wc = view.webContents
    const pinned = opts.pinned ?? false
    const tab: Tab = { id: wc.id, view, wc, favicon: null, pinned, url, setup: Promise.resolve(), lastActive: Date.now(), asleep: null, groupId: null, scrollNonce: randomBytes(12).toString('hex') }
    this.tabs.set(tab.id, tab)
    const [start, end] = this.groupRange(pinned)
    // Never between the two tabs of a split view (a link opened from its left page goes after both).
    const at = outsideSplits(this.order, this.splits, clamp(opts.index ?? end, start, end))
    this.order.splice(at, 0, tab.id)
    // A tab opened inside a group (a link next to its opener, a duplicate) joins it, like Chrome.
    if (opts.groupId !== undefined) tab.groupId = opts.groupId && this.groups.has(opts.groupId) ? opts.groupId : null
    else if (!pinned && opts.index !== undefined) tab.groupId = groupAt(this.order, this.tabs, at, null)

    view.setBorderRadius(PAGE_RADIUS)
    view.setVisible(false)
    this.window.contentView.addChildView(view)
    this.wireEvents(tab)
    this.emit('created', wc)

    // Client Hints must be in place before the first request goes out.
    // The CDP target only exists once something is loaded, hence about:blank first.
    // If something else navigates the tab meanwhile (the omnibox, an extension), it wins.
    let navigatedElsewhere = false
    const onStart = (details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>): void => {
      if (details.isMainFrame && details.url !== 'about:blank') navigatedElsewhere = true
    }
    wc.on('did-start-navigation', onStart)
    tab.setup = trackIdentitySetup(wc.loadURL('about:blank').then(() => manageIdentity(wc)))
    void tab.setup
      .then(() => {
        if (wc.isDestroyed()) return undefined
        wc.off('did-start-navigation', onStart)
        if (url !== 'about:blank' && !navigatedElsewhere) return wc.loadURL(url)
        return undefined
      })
      .catch(() => {
        /* navigation errors surface through did-fail-load; error pages come in Étape 6 */
      })

    if (opts.focusPage === false) this.keepFocusAway(tab)
    if (opts.active !== false || this.activeId === null) this.activate(tab.id, opts.focusPage ?? true)
    else this.emit('changed')
    return wc
  }

  activate(id: TabId, focusPage = true): void {
    const next = this.tabs.get(id)
    if (!next || id === this.activeId) return
    const previous = this.activeId !== null ? this.tabs.get(this.activeId) : undefined
    // Like Chrome, leaving a tab ends its full screen.
    if (previous && this.fullScreenTab === previous.id) {
      void previous.wc.executeJavaScript('document.fullscreenElement && document.exitFullscreen()', true).catch(() => {})
      this.leaveFullScreen(previous.id)
    }

    this.activeId = id
    // Showing a tab of a folded group unfolds it.
    const group = next.groupId ? this.groups.get(next.groupId) : undefined
    if (group?.collapsed) group.collapsed = false
    if (previous) previous.lastActive = Date.now()
    this.present()
    if (focusPage) next.wc.focus()
    this.emit('activated', previous?.wc ?? null, next.wc)
    this.emit('changed')
  }

  /**
   * Puts the active tab (and its partner in a split view) on screen, lays them out, and hides the
   * pages shown before that no longer are. Going from one page of a split view to the other hides
   * nothing (no automatic PiP: the video is still in sight).
   */
  private present(): void {
    const before = this.shown
    const active = this.activeId !== null ? this.tabs.get(this.activeId) : undefined
    const partnerId = active ? partnerOf(this.splits, active.id) : null
    const partner = partnerId !== null ? this.tabs.get(partnerId) : undefined
    const now = [partner, active].filter((tab): tab is Tab => tab !== undefined)
    this.shown = new Set(now.map((tab) => tab.id))
    for (const tab of now) {
      tab.lastActive = Date.now()
      if (before.has(tab.id)) continue
      this.wake(tab)
      tab.view.setVisible(true)
      // Re-adding an existing child view moves it on top, above the previous tab still visible below.
      this.window.contentView.addChildView(tab.view)
    }
    this.layout()
    for (const id of before) {
      const tab = this.tabs.get(id)
      if (tab && !this.shown.has(id)) void this.hideWhenLeft(tab)
    }
  }

  /** Ctrl+Tab / Ctrl+Shift+Tab, wrapping around. */
  activateRelative(delta: number): void {
    if (this.order.length === 0 || this.activeId === null) return
    const index = this.order.indexOf(this.activeId)
    const n = this.order.length
    this.activate(this.order[(((index + delta) % n) + n) % n]!)
  }

  /** Cmd/Ctrl+1..8 → that tab, Cmd/Ctrl+9 → last tab (like Chrome). */
  activateNumber(n: number): void {
    const id = n >= 9 ? this.order[this.order.length - 1] : this.order[n - 1]
    if (id !== undefined) this.activate(id)
  }

  private async hideWhenLeft(tab: Tab): Promise<void> {
    if (this.beforeHide && !tab.wc.isDestroyed()) {
      await Promise.race([this.beforeHide(tab.wc).catch(() => {}), delay(HIDE_DELAY_MS)])
    }
    // The user may have switched back meanwhile, or the tab may be gone.
    if (!this.shown.has(tab.id) && this.tabs.has(tab.id)) tab.view.setVisible(false)
  }

  close(id: TabId): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    const index = this.order.indexOf(id)
    const partner = partnerOf(this.splits, id)
    this.remember(tab, index)
    this.order.splice(index, 1)
    this.tabs.delete(id)
    this.shown.delete(id)

    if (this.activeId === id) {
      this.activeId = null
      // Not present() yet: the partner stays on screen (no automatic PiP), it becomes the active tab.
      this.dropEmptyGroups()
      repairSplits(this.order, this.tabs, this.splits)
      this.syncSplitZoom()
      // The other page of its split view takes the whole area.
      const neighbour = partner ?? this.order[Math.min(index, this.order.length - 1)]
      if (neighbour !== undefined) this.activate(neighbour)
    } else this.afterStripChange()

    this.dispose(tab)
    if (this.order.length === 0) this.emit('empty')
    else this.emit('changed')
  }

  /**
   * "Tout fermer" (broom, Cmd/Ctrl+Shift+W), à la Arc: closes every tab but the active one and the
   * pinned ones, without asking. They all go to the reopen stack.
   */
  closeAllButActive(): void {
    if (this.activeId !== null) this.closeOthers(this.activeId)
  }

  /** Window teardown: drop everything without filling the reopen stack. */
  closeAll(): void {
    // Reset state first: 'removed' listeners may read getState() while we iterate.
    const closing = this.order.map((id) => this.tabs.get(id)!)
    this.tabs.clear()
    this.order = []
    this.groups.clear()
    this.splits.clear()
    this.shown.clear()
    this.splitZoomed.clear()
    this.activeId = null
    for (const tab of closing) this.dispose(tab)
  }

  closeOthers(id: TabId): void {
    for (const other of [...this.order]) if (other !== id && !this.tabs.get(other)?.pinned) this.close(other)
  }

  closeToTheRight(id: TabId): void {
    const index = this.order.indexOf(id)
    for (const other of this.order.slice(index + 1)) this.close(other)
  }

  /** Cmd/Ctrl+Shift+T. Returns false when there is nothing to reopen. */
  reopenClosed(): boolean {
    const entry = this.closed.pop()
    if (!entry) return false
    this.create(entry.url, { active: true, index: entry.index, pinned: entry.pinned })
    return true
  }

  duplicate(id: TabId): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    this.create(tab.asleep?.url ?? (tab.wc.getURL() || tab.url), { active: true, index: this.order.indexOf(id) + 1, pinned: tab.pinned })
  }

  setPinned(id: TabId, pinned: boolean): void {
    const tab = this.tabs.get(id)
    if (!tab || tab.pinned === pinned) return
    this.order.splice(this.order.indexOf(id), 1)
    tab.pinned = pinned
    tab.groupId = null // pinned tabs are never in a group, nor in a split view
    // Pinning appends to the pinned group; unpinning puts the tab first among the others.
    const [start, end] = this.groupRange(pinned)
    this.order.splice(pinned ? end : start, 0, id)
    this.afterStripChange()
    this.emit('changed')
  }

  /** Drag & drop in the strip. The tab stays within its group (pinned / not pinned). */
  move(id: TabId, index: number): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    this.order.splice(this.order.indexOf(id), 1)
    const [start, end] = this.groupRange(tab.pinned)
    const at = outsideSplits(this.order, this.splits, clamp(index, start, end))
    this.order.splice(at, 0, id)
    // Dropped between two tabs of a group: joins it; away from its own group: leaves it.
    if (!tab.pinned) tab.groupId = groupAt(this.order, this.tabs, at, tab.groupId)
    // A page of a split view dragged away from the other one leaves the split view.
    this.afterStripChange()
    this.emit('changed')
  }

  // ── Tab groups ────────────────────────────────────────────────────────────────────────

  /** « Ajouter à un nouveau groupe »: the tabs gather where the first one is. Returns the group. */
  addToNewGroup(ids: TabId[], init: Partial<Omit<TabGroupInfo, 'id'>> = {}): string | null {
    const members = this.withPartners(ids).filter((id) => this.tabs.has(id) && !this.tabs.get(id)!.pinned)
    if (members.length === 0) return null
    const group: TabGroupInfo = { id: randomUUID(), name: init.name ?? '', color: init.color ?? nextColor(this.groups.values()), collapsed: false }
    this.groups.set(group.id, group)
    const before = [...this.order]
    const first = Math.min(...members.map((id) => this.order.indexOf(id)))
    const anchor = this.order[first]!
    this.order = this.order.filter((id) => !members.includes(id) || id === anchor)
    const inStripOrder = [...members].sort((a, b) => before.indexOf(a) - before.indexOf(b))
    this.order.splice(this.order.indexOf(anchor), 1, ...inStripOrder)
    for (const id of members) this.tabs.get(id)!.groupId = group.id
    this.afterStripChange()
    this.emit('changed')
    return group.id
  }

  /** Moves a tab (with the other page of its split view) to the end of an existing group. */
  addToGroup(id: TabId, groupId: string): void {
    const tab = this.tabs.get(id)
    if (!tab || tab.pinned || !this.groups.has(groupId) || tab.groupId === groupId) return
    this.moveAfterGroup(this.withPartners([id]), groupId, groupId)
  }

  /** « Retirer du groupe »: the tab (with the other page of its split view) goes right after the group. */
  removeFromGroup(id: TabId): void {
    const tab = this.tabs.get(id)
    if (!tab?.groupId) return
    this.moveAfterGroup(this.withPartners([id]), tab.groupId, null)
  }

  private moveAfterGroup(ids: TabId[], groupId: string, newGroup: string | null): void {
    this.order = this.order.filter((id) => !ids.includes(id))
    this.order.splice(endOfGroup(this.order, this.tabs, groupId, this.order.length), 0, ...ids)
    for (const id of ids) this.tabs.get(id)!.groupId = newGroup
    this.afterStripChange()
    this.emit('changed')
  }

  /** `ids` and the other page of their split views, in strip order. */
  private withPartners(ids: TabId[]): TabId[] {
    const all = new Set(ids.flatMap((id) => [id, partnerOf(this.splits, id)]).filter((id): id is TabId => id !== null))
    return this.order.filter((id) => all.has(id))
  }

  // ── Split view (à la Arc) ─────────────────────────────────────────────────────────────

  /**
   * Shows `otherId` next to `targetId` (a tab dropped on another, « Afficher côte à côte »): it
   * moves beside it, on the side it came from, and joins its group. A tab already in a split view
   * leaves it; the target must not be in one. Returns the split view, or null.
   */
  split(targetId: TabId, otherId: TabId, opts: { ratio?: number; activate?: boolean } = {}): string | null {
    const target = this.tabs.get(targetId)
    const other = this.tabs.get(otherId)
    if (!target || !other || targetId === otherId || target.pinned || other.pinned) return null
    const existing = splitOf(this.splits, targetId)
    if (existing) return existing.tabs.includes(otherId) ? existing.id : null
    const previous = splitOf(this.splits, otherId)
    if (previous) this.splits.delete(previous.id)

    const fromLeft = this.order.indexOf(otherId) < this.order.indexOf(targetId)
    this.order.splice(this.order.indexOf(otherId), 1)
    const at = this.order.indexOf(targetId)
    this.order.splice(fromLeft ? at : at + 1, 0, otherId)
    other.groupId = target.groupId
    const split: TabSplitInfo = { id: randomUUID(), tabs: fromLeft ? [otherId, targetId] : [targetId, otherId], ratio: clampRatio(opts.ratio ?? 0.5) }
    this.splits.set(split.id, split)
    this.afterStripChange()
    if (opts.activate !== false && this.activeId !== otherId) this.activate(otherId)
    else this.emit('changed')
    return split.id
  }

  /** « Séparer les onglets »: both tabs stay, the one in use takes the whole area. */
  unsplit(id: TabId): void {
    const split = splitOf(this.splits, id)
    if (!split) return
    this.splits.delete(split.id)
    this.syncSplitZoom()
    this.present()
    this.emit('changed')
  }

  /** « Inverser les côtés ». */
  swapSplit(id: TabId): void {
    const split = splitOf(this.splits, id)
    if (!split) return
    const [left, right] = split.tabs
    this.order.splice(this.order.indexOf(left), 1)
    this.order.splice(this.order.indexOf(right) + 1, 0, left)
    split.ratio = 1 - split.ratio
    this.afterStripChange()
    this.emit('changed')
  }

  /** The divider between the two pages was dragged. */
  setSplitRatio(splitId: string, ratio: number): void {
    const split = this.splits.get(splitId)
    if (!split) return
    split.ratio = clampRatio(ratio)
    this.layout()
    this.emit('changed')
  }

  /** The scroll indicator next to the page was dragged or clicked. */
  scrollTo(id: TabId, top: number, smooth: boolean): void {
    const wc = this.tabs.get(id)?.wc
    if (!wc || wc.isDestroyed() || !Number.isFinite(top)) return
    void wc.executeJavaScriptInIsolatedWorld(SCROLL_WORLD_ID, [{ code: scrollToScript(top, smooth) }]).catch(() => {})
  }

  /** The other page of `id`'s split view, or null. */
  splitPartner(id: TabId): TabId | null {
    return partnerOf(this.splits, id)
  }

  splitList(): TabSplitInfo[] {
    return [...this.splits.values()].map((s) => ({ ...s, tabs: [...s.tabs] as [TabId, TabId] }))
  }

  /** After tabs moved, closed or changed group: drop broken split views, refresh what's on screen. */
  private afterStripChange(): void {
    this.dropEmptyGroups()
    repairSplits(this.order, this.tabs, this.splits)
    this.syncSplitZoom()
    this.present()
  }

  /**
   * The pages of a split view are zoomed out (SPLIT_ZOOM of their site's zoom), each on its own:
   * isolated zoom, so other tabs of the same site and the remembered zoom don't change. Leaving the
   * split view gives the page its site's zoom back. ZoomController keeps it across navigations.
   */
  private syncSplitZoom(): void {
    const inSplit = new Set([...this.splits.values()].flatMap((s) => s.tabs))
    for (const id of inSplit) {
      const wc = this.tabs.get(id)?.wc
      if (this.splitZoomed.has(id) || !wc || wc.isDestroyed()) continue
      this.splitZoomed.add(id)
      wc.setZoomMode('isolated')
      wc.setZoomFactor(TabManager.siteZoom(wc.getURL()) * SPLIT_ZOOM)
    }
    for (const id of this.splitZoomed) {
      if (inSplit.has(id)) continue
      this.splitZoomed.delete(id)
      const wc = this.tabs.get(id)?.wc
      if (!wc || wc.isDestroyed()) continue
      // Back to the site's zoom (the default mode alone keeps the page's level when the site has none).
      wc.setZoomMode('default')
      wc.setZoomFactor(TabManager.siteZoom(wc.getURL()))
    }
  }

  updateGroup(groupId: string, changes: Partial<Omit<TabGroupInfo, 'id'>>): void {
    const group = this.groups.get(groupId)
    if (!group) return
    Object.assign(group, changes)
    // Folding the group of the active tab: show the closest tab outside it, like Chrome.
    const active = this.activeId !== null ? this.tabs.get(this.activeId) : undefined
    if (changes.collapsed && active?.groupId === groupId) {
      const index = this.order.indexOf(active.id)
      const outside = [...this.order.slice(index + 1), ...this.order.slice(0, index).reverse()].find((id) => this.tabs.get(id)!.groupId !== groupId)
      // Nothing outside the group: a new tab, like Chrome.
      if (outside === undefined) this.create()
      else this.activate(outside)
    }
    this.emit('changed')
  }

  /** « Dissocier »: the tabs stay, without the group. */
  ungroup(groupId: string): void {
    for (const tab of this.tabs.values()) if (tab.groupId === groupId) tab.groupId = null
    this.groups.delete(groupId)
    this.emit('changed')
  }

  closeGroup(groupId: string): void {
    for (const id of this.order.filter((id) => this.tabs.get(id)?.groupId === groupId)) this.close(id)
  }

  groupList(): TabGroupInfo[] {
    return [...this.groups.values()]
  }

  groupOf(id: TabId): string | null {
    return this.tabs.get(id)?.groupId ?? null
  }

  private dropEmptyGroups(): void {
    const used = usedGroups(this.tabs.values())
    for (const id of this.groups.keys()) if (!used.has(id)) this.groups.delete(id)
  }

  /** Restores a group saved with the session (WindowManager), before its tabs are created. */
  restoreGroup(group: TabGroupInfo): void {
    this.groups.set(group.id, { ...group })
  }

  toggleMute(id: TabId): void {
    const wc = this.tabs.get(id)?.wc
    if (!wc || wc.isDestroyed()) return
    wc.setAudioMuted(!wc.isAudioMuted())
    this.emit('changed')
  }

  navigate(id: TabId, input: string): void {
    const wc = this.tabs.get(id)?.wc
    if (!wc) return
    wc.loadURL(toUrl(input, TabManager.searchEngine())).catch(() => {})
    // Like Chrome, Enter in the omnibox moves focus to the page. Electron also derives the
    // extension-facing `sender.tab.active` from focus, and Dashlane only autofills active tabs.
    if (id === this.activeId) wc.focus()
  }

  get(id: TabId): WebContents | undefined {
    return this.tabs.get(id)?.wc
  }

  getActive(): WebContents | undefined {
    return this.activeId !== null ? this.get(this.activeId) : undefined
  }

  getActiveId(): TabId | null {
    return this.activeId
  }

  /** Title, URL and favicon of a tab, to turn it into a favorite. */
  snapshot(id: TabId): { title: string; url: string; favicon: string | null } | undefined {
    const tab = this.tabs.get(id)
    if (!tab || tab.wc.isDestroyed()) return undefined
    if (tab.asleep) return { ...tab.asleep, title: tab.asleep.title || tab.asleep.url }
    const url = tab.wc.getURL()
    return { title: tab.wc.getTitle() || url, url, favicon: tab.favicon }
  }

  isPinned(id: TabId): boolean {
    return this.tabs.get(id)?.pinned ?? false
  }

  indexOf(id: TabId): number {
    return this.order.indexOf(id)
  }

  /** The pages of every tab (asleep ones show about:blank). */
  webContentsList(): WebContents[] {
    return [...this.tabs.values()].map((t) => t.wc).filter((wc) => !wc.isDestroyed())
  }

  count(): number {
    return this.order.length
  }

  has(webContents: WebContents): boolean {
    return this.tabs.has(webContents.id)
  }

  private leaveFullScreen(id: TabId): void {
    if (this.fullScreenTab !== id) return
    this.fullScreenTab = null
    if (this.madeWindowFullScreen && !this.window.isDestroyed()) this.window.setFullScreen(false)
    this.madeWindowFullScreen = false
    this.layout()
  }

  /** Tells the chrome UI that something it shows changed (zoom…). */
  refresh(): void {
    this.emit('changed')
  }

  /** Where the page sits in the window (the chrome UI around it). */
  /** Where a tab's page sits in the window (content coordinates), null if it isn't shown. */
  pageBounds(id: TabId): Rect | null {
    const tab = this.tabs.get(id)
    return tab && this.shown.has(id) ? tab.view.getBounds() : null
  }

  getInsets(): LayoutInsets {
    return this.insets
  }

  setInsets(insets: LayoutInsets): void {
    this.insets = insets
    this.layout()
  }

  getState(): TabsState {
    return {
      activeId: this.activeId,
      tabs: this.order.map((id) => this.describe(this.tabs.get(id)!)),
      groups: this.groupList(),
      splits: this.splitList()
    }
  }

  /** [first index, one past last index] of the pinned or unpinned group in `order`. */
  private groupRange(pinned: boolean): [number, number] {
    const pinnedCount = this.order.filter((id) => this.tabs.get(id)?.pinned).length
    return pinned ? [0, pinnedCount] : [pinnedCount, this.order.length]
  }

  private remember(tab: Tab, index: number): void {
    const url = tab.asleep?.url ?? (tab.wc.isDestroyed() ? tab.url : tab.wc.getURL() || tab.url)
    if (isNewTabUrl(url)) return
    this.closed.push({ url, index, pinned: tab.pinned })
    if (this.closed.length > CLOSED_STACK_SIZE) this.closed.shift()
  }

  private dispose(tab: Tab): void {
    this.emit('removed', tab.wc)
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(tab.view)
    // Closing a page while a CDP command of its setup is in flight leaves the main process
    // spinning at 100 % CPU (Electron): wait for the setup (a few ms) before closing it.
    void tab.setup.then(() => {
      if (!tab.wc.isDestroyed()) tab.wc.close()
    })
  }

  private describe(tab: Tab): TabInfo {
    const wc = tab.wc
    const asleep = tab.asleep
    if (asleep) {
      return {
        id: tab.id,
        title: asleep.title || asleep.url,
        url: asleep.url,
        favicon: asleep.favicon,
        audible: false,
        muted: wc.isAudioMuted(),
        loading: false,
        pinned: tab.pinned,
        canGoBack: true,
        canGoForward: false,
        zoom: Math.round(wc.getZoomFactor() * 100),
        asleep: true,
        groupId: tab.groupId
      }
    }
    // An error page shows the address that failed, like Chrome.
    const failed = failedUrlOf(wc.getURL())
    const url = failed ?? wc.getURL()
    return {
      id: tab.id,
      // about:blank reports "about:blank" as its title.
      title: isNewTabUrl(url) ? t('Nouvel onglet') : failed ? hostOrUrl(failed) : wc.getTitle() || url,
      url: isNewTabUrl(url) ? '' : url,
      favicon: tab.favicon,
      audible: wc.isCurrentlyAudible(),
      muted: wc.isAudioMuted(),
      loading: wc.isLoading(),
      pinned: tab.pinned,
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      zoom: Math.round(wc.getZoomFactor() * 100),
      asleep: false,
      groupId: tab.groupId
    }
  }

  private layout(): void {
    const active = this.activeId !== null ? this.tabs.get(this.activeId) : undefined
    if (!active) return
    const { width, height } = this.window.getContentBounds()
    if (this.fullScreenTab === active.id) {
      active.view.setBounds({ x: 0, y: 0, width, height })
      active.view.setBorderRadius(0)
      return
    }
    const { left, top, right, bottom } = this.insets
    const area: Rect = { x: left, y: top, width: Math.max(0, width - left - right), height: Math.max(0, height - top - bottom) }
    const split = splitOf(this.splits, active.id)
    const places: [Tab | undefined, Rect][] = split
      ? split.tabs.map((id, i): [Tab | undefined, Rect] => [this.tabs.get(id), splitRects(area, split.ratio)[i]!])
      : [[active, area]]
    for (const [tab, rect] of places) {
      tab?.view.setBorderRadius(PAGE_RADIUS)
      tab?.view.setBounds(rect)
    }
  }

  /**
   * A page that loads takes the keyboard focus (Chromium focuses a new document's view). For a new
   * tab, the omnibox must keep it so that typing can start right away: until the page has loaded,
   * any focus it takes goes back to the chrome UI.
   */
  private keepFocusAway(tab: Tab): void {
    const wc = tab.wc
    const giveBack = (): void => {
      if (this.activeId === tab.id && !wc.isDestroyed()) this.focusChrome?.()
    }
    const timers: NodeJS.Timeout[] = []
    const stop = (): void => {
      timers.forEach(clearTimeout)
      if (!wc.isDestroyed()) {
        wc.off('focus', giveBack)
        wc.off('did-stop-loading', onLoaded)
        wc.off('input-event', onInput)
      }
    }
    // about:blank loads first (userAgent.ts): wait for the real page. Windows may hand the page
    // the focus a little after it loads, without a `focus` event: check again for a moment.
    const onLoaded = (): void => {
      if (wc.getURL() === 'about:blank') return
      for (const ms of [50, 300, 800, 1500]) {
        timers.push(
          setTimeout(() => {
            if (!wc.isDestroyed() && wc.isFocused()) giveBack()
          }, ms)
        )
      }
      timers.push(setTimeout(stop, 2000))
    }
    // The user clicked in the page: the focus is theirs to give.
    const onInput = (_e: Electron.Event, input: Electron.InputEvent): void => {
      if (input.type === 'mouseDown') stop()
    }
    wc.on('focus', giveBack)
    wc.on('did-stop-loading', onLoaded)
    wc.on('input-event', onInput)
    timers.push(setTimeout(stop, 10_000))
    wc.once('destroyed', stop)
  }

  private wireEvents(tab: Tab): void {
    const wc = tab.wc
    const changed = (): void => {
      this.emit('changed')
    }
    wc.on('page-title-updated', changed)
    wc.on('did-navigate', (_e, url) => {
      this.emit('scroll', tab.id, null)
      if (tab.asleep) return // about:blank of the tab sleep: the strip keeps the page's title and icon
      tab.url = url
      tab.favicon = null
      changed()
    })
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) tab.url = url
      changed()
    })
    // A page that can't load (DNS, refused, offline, certificate…) gets our error page (§6.7).
    wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3 /* ABORTED: stopped, or replaced by another navigation */) return
      if (isInternalUrl(url) || url === 'about:blank') return
      // ERR_BLOCKED_BY_CLIENT: the ad blocker, or the phishing protection (then: a warning).
      const threat = code === -20 ? blockedThreat(url) : null
      void wc.loadURL(errorPageUrl(url, code, description, threat ?? undefined)).catch(() => {})
    })
    wc.on('did-start-loading', changed)
    wc.on('did-stop-loading', changed)
    wc.on('audio-state-changed', changed)
    wc.on('page-favicon-updated', (_e, favicons) => {
      const favicon = favicons[0] ?? null
      tab.favicon = favicon && isInternalUrl(favicon) ? INTERNAL_FAVICON : favicon
      if (tab.favicon) this.emit('favicon', wc.getURL(), tab.favicon)
      changed()
    })
    wc.on('context-menu', (_e, params) => this.emit('context-menu', wc, params))
    // Clicking in the other page of a split view makes it the active tab (omnibox, ⌘W, find…).
    wc.on('focus', () => {
      if (this.shown.has(tab.id) && this.activeId !== tab.id) this.activate(tab.id, false)
    })
    wc.on('dom-ready', () => {
      void wc.insertCSS(SCROLLBAR_CSS, { cssOrigin: 'user' }).catch(() => {})
      void wc.executeJavaScriptInIsolatedWorld(SCROLL_WORLD_ID, [{ code: scrollScript(tab.scrollNonce) }]).catch(() => {})
    })
    wc.on('console-message', (event) => {
      const prefix = `${SCROLL_PREFIX}${tab.scrollNonce}:`
      if (!event.message.startsWith(prefix) || event.frame !== wc.mainFrame) return
      const [top, height, viewport] = event.message.slice(prefix.length).split(',').map(Number)
      if ([top, height, viewport].every((n) => Number.isFinite(n))) this.emit('scroll', tab.id, { top: top!, height: height!, viewport: viewport! })
    })
    // HTML full screen (§6.7): the page covers the sidebar and the bars.
    wc.on('enter-html-full-screen', () => {
      // From the other page of a split view: it becomes the active tab, on top of its partner.
      if (this.activeId !== tab.id) this.activate(tab.id)
      this.window.contentView.addChildView(tab.view)
      this.fullScreenTab = tab.id
      if (!this.window.isFullScreen()) {
        this.madeWindowFullScreen = true
        this.window.setFullScreen(true)
      }
      this.layout()
    })
    wc.on('leave-html-full-screen', () => this.leaveFullScreen(tab.id))
    // Pages (and extensions, e.g. Dashlane's login tab) can close themselves: drop the tab.
    wc.once('destroyed', () => this.close(tab.id))
    // OAuth popups (e.g. "Sign in with Google") must look like Chrome too.
    wc.on('did-create-window', (popup) => void trackIdentitySetup(manageIdentity(popup.webContents)))

    // Like chrome:// in Chrome, internal pages are reached from the omnibox or our menus only:
    // a web page can't navigate to them, frame them, redirect to them or open them.
    const fromInternal = (): boolean => isInternalUrl(wc.getURL())
    wc.on('will-frame-navigate', (details) => {
      if (isInternalUrl(details.url) && !(details.isMainFrame && fromInternal())) details.preventDefault()
    })
    wc.on('will-redirect', (details) => {
      if (isInternalUrl(details.url)) details.preventDefault()
    })

    wc.setWindowOpenHandler(({ url, disposition, features }) => {
      if (isInternalUrl(url) && !fromInternal()) return { action: 'deny' }
      // OAuth-style popups (explicit size or `popup` feature) get a real window in the same session.
      if (disposition === 'new-window' || /(^|,)\s*(popup|width|height)\b/.test(features)) {
        return { action: 'allow' }
      }
      // Like Chrome, links open right after the tab they come from.
      this.create(url, { active: disposition !== 'background-tab', index: this.order.indexOf(tab.id) + 1 })
      return { action: 'deny' }
    })
  }
}

const hostOrUrl = (url: string): string => {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

/** Reload, or for an error page, try the page that failed again. */
export function reloadPage(wc: WebContents): void {
  const failed = failedUrlOf(wc.getURL())
  if (failed) void wc.loadURL(failed).catch(() => {})
  else wc.reload()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
