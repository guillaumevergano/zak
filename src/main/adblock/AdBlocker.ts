import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, type Session, type WebContents } from 'electron'
import { ElectronBlocker, adsAndTrackingLists } from '@ghostery/adblocker-electron'
import { parse } from 'tldts-experimental'

/**
 * Built-in ad/tracker blocker (EasyList, EasyPrivacy, uBO lists) on top of the Ghostery engine.
 *
 * Why not an extension: Electron does not enforce `declarativeNetRequest` (uBO Lite and every MV3
 * blocker load but block nothing), and MV2 background pages don't receive the
 * electron-chrome-extensions APIs (classic uBO crashes). See docs/EXTENSIONS.md.
 *
 * - Network: `session.webRequest.onBeforeRequest/onHeadersReceived` on persist:main and private sessions. Electron gives
 *   those precedence over an extension's chrome.webRequest handlers for the same events.
 * - Cosmetic (hiding empty ad slots): Ghostery's own integration needs a page preload, which pages
 *   must not get (CLAUDE.md §3). Instead main reads the page's classes/ids from an isolated world
 *   and inserts the matching hide rules with `webContents.insertCSS`. Scriptlets are not injected.
 */
let blockerReady: Promise<ElectronBlocker | null> | null = null
/** Sessions the blocker is attached to (main + open private windows). Weak: closed sessions drop out. */
const blockedSessions = new WeakSet<Session>()

/** Attaches the blocker to a session. The engine is built (or read from cache) once, then shared. */
export async function enableAdBlocker(session: Session): Promise<void> {
  const blocker = await (blockerReady ??= loadBlocker())
  if (!blocker || blockedSessions.has(session)) return

  // Same wiring as Ghostery's BlockingContext, minus its page preload.
  session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => blocker.onBeforeRequest(details, cb))
  session.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, cb) => blocker.onHeadersReceived(details, cb))

  if (!cosmeticListening) {
    cosmeticListening = true
    app.on('web-contents-created', (_e, wc) => {
      if (blockedSessions.has(wc.session)) new CosmeticInjector(wc, blocker).attach()
    })
  }
  blockedSessions.add(session)
}

let cosmeticListening = false

async function loadBlocker(): Promise<ElectronBlocker | null> {
  try {
    return await ElectronBlocker.fromLists(fetch, FILTER_LISTS, { loadCosmeticFilters: true }, {
      // The cache is reused as-is, whatever the lists: key it on them so a change rebuilds it.
      path: join(app.getPath('userData'), `adblock-engine-${listsHash()}.bin`),
      read: (path) => readFile(path),
      write: (path, buffer) => writeFile(path, buffer)
    })
  } catch (err) {
    // Lists unreachable on first launch (offline): browse without blocking rather than fail.
    console.warn('[adblock] disabled:', err)
    return null
  }
}

/** Ghostery's ads + tracking lists, plus the French regional lists (uBO's defaults for France). */
const FILTER_LISTS = [
  ...adsAndTrackingLists,
  'https://easylist-downloads.adblockplus.org/liste_fr.txt',
  'https://filters.adtidy.org/extension/ublock/filters/16.txt' // AdGuard Français
]

function listsHash(): string {
  return createHash('sha1').update(FILTER_LISTS.join('\n')).digest('hex').slice(0, 8)
}

/** Isolated world used to read the DOM without exposing anything to page scripts. */
const ISOLATED_WORLD_ID = 1999

const COLLECT_DOM = `(() => {
  const classes = new Set(), ids = new Set(), hrefs = new Set()
  for (const el of document.querySelectorAll('[id],[class],a[href]')) {
    if (el.id) ids.add(el.id)
    for (const c of el.classList) classes.add(c)
    if (el.tagName === 'A') { const h = el.getAttribute('href'); if (h) hrefs.add(h) }
  }
  return { classes: [...classes].slice(0, 10000), ids: [...ids].slice(0, 10000), hrefs: [...hrefs].slice(0, 2000) }
})()`

interface DomInfo {
  classes: string[]
  ids: string[]
  hrefs: string[]
}

class CosmeticInjector {
  private cssKey: string | null = null
  private lateTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly wc: WebContents,
    private readonly blocker: ElectronBlocker
  ) {}

  attach(): void {
    const wc = this.wc
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) this.cssKey = null // CSS is dropped on navigation
    })
    wc.on('dom-ready', () => void this.inject())
    wc.on('did-stop-loading', () => {
      void this.inject()
      // Ad slots are often created by scripts after load.
      if (this.lateTimer) clearTimeout(this.lateTimer)
      this.lateTimer = setTimeout(() => void this.inject(), 2500)
    })
    wc.on('did-navigate-in-page', (_e, _url, isMainFrame) => {
      if (isMainFrame) void this.inject()
    })
    wc.once('destroyed', () => {
      if (this.lateTimer) clearTimeout(this.lateTimer)
    })
  }

  private async inject(): Promise<void> {
    const wc = this.wc
    if (wc.isDestroyed()) return
    const url = wc.getURL()
    if (!/^https?:/.test(url)) return
    const { hostname, domain } = parse(url)

    let dom: DomInfo | undefined
    try {
      dom = await wc.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD_ID, [{ code: COLLECT_DOM }])
    } catch {
      // Page navigated away or not scriptable: hostname rules are still applied.
    }
    if (wc.isDestroyed() || wc.getURL() !== url) return

    const { active, styles } = this.blocker.getCosmeticsFilters({
      url,
      hostname: hostname ?? '',
      domain: domain ?? '',
      classes: dom?.classes,
      ids: dom?.ids,
      hrefs: dom?.hrefs,
      getBaseRules: true,
      getRulesFromHostname: true,
      getRulesFromDOM: dom !== undefined,
      getInjectionRules: false,
      getExtendedRules: false
    })
    if (!active || !styles) return

    const previous = this.cssKey
    try {
      this.cssKey = await wc.insertCSS(styles, { cssOrigin: 'user' })
      if (previous) await wc.removeInsertedCSS(previous)
    } catch {
      /* destroyed or navigated meanwhile */
    }
  }
}
