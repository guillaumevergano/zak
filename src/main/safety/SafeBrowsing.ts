import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, webContents } from 'electron'
import { NEW_TAB_URL, failedUrlOf } from '@shared/url'
import { Blocklist, findThreat, type Threat } from './blocklist'

/**
 * Phishing and malware protection (Electron has no Google Safe Browsing). The lists are downloaded
 * every 12 hours and checked on the machine; a dangerous page is replaced by a warning
 * (zak://error?threat=…), which lets the user go on anyway for this session.
 */
const LISTS: Record<Threat, string[]> = {
  phishing: [
    'https://malware-filter.gitlab.io/malware-filter/phishing-filter.txt',
    'https://malware-filter.pages.dev/phishing-filter.txt'
  ],
  malware: [
    'https://malware-filter.gitlab.io/malware-filter/urlhaus-filter.txt',
    'https://malware-filter.pages.dev/urlhaus-filter.txt'
  ]
}
// Tests serve their own lists: {"phishing": "http://127.0.0.1:…/p.txt", "malware": …}.
const testLists = process.env['ZAK_SAFE_BROWSING_LISTS']
if (testLists) {
  const urls = JSON.parse(testLists) as Partial<Record<Threat, string>>
  for (const threat of Object.keys(LISTS) as Threat[]) LISTS[threat] = urls[threat] ? [urls[threat]] : []
}
const REFRESH_MS = 12 * 60 * 60 * 1000

/** Main-frame URLs just cancelled by the guard, so the tab knows why its load failed. */
const blocked = new Map<string, Threat>()

/** Why a page failed with ERR_BLOCKED_BY_CLIENT, if it was a threat (consumed once). */
export function blockedThreat(url: string): Threat | null {
  const threat = blocked.get(url) ?? null
  blocked.delete(url)
  return threat
}

export class SafeBrowsing {
  private lists: Partial<Record<Threat, Blocklist>> = {}
  /** Hosts the user chose to open despite the warning, until the app quits (like Chrome). */
  private allowed = new Set<string>()
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly isEnabled: () => boolean) {}

  /** Loads the cached lists, then keeps them fresh. */
  async start(): Promise<void> {
    await Promise.all((Object.keys(LISTS) as Threat[]).map((threat) => this.load(threat)))
    this.timer = setInterval(() => {
      for (const threat of Object.keys(LISTS) as Threat[]) void this.load(threat, true)
    }, REFRESH_MS)
    this.timer.unref()
  }

  /** The threat behind a page about to load, or null (protection off, safe, or allowed). */
  check(url: string): Threat | null {
    if (!this.isEnabled()) return null
    const threat = findThreat(this.lists, url)
    if (!threat) return null
    try {
      if (this.allowed.has(new URL(url).hostname)) return null
    } catch {
      return null
    }
    return threat
  }

  /**
   * The webRequest guard: cancels a dangerous page or frame (the tab then shows the warning, see
   * blockedThreat). True when cancelled.
   */
  guard(details: { url: string; resourceType: string }): boolean {
    if (details.resourceType !== 'mainFrame' && details.resourceType !== 'subFrame') return false
    const threat = this.check(details.url)
    if (!threat) return false
    if (details.resourceType === 'mainFrame') {
      blocked.set(details.url, threat)
      if (blocked.size > 50) blocked.delete(blocked.keys().next().value!)
    }
    return true
  }

  /** "Continuer quand même" on the warning page. */
  allow(url: string): void {
    try {
      this.allowed.add(new URL(url).hostname)
    } catch {
      /* not a URL: nothing to allow */
    }
  }

  private async load(threat: Threat, refresh = false): Promise<void> {
    const dir = join(app.getPath('userData'), 'safe-browsing')
    const file = join(dir, `${threat}.txt`)
    let text: string | null = null
    let age = Infinity
    try {
      age = Date.now() - (await stat(file)).mtimeMs
      if (!refresh || age < REFRESH_MS) text = await readFile(file, 'utf8')
    } catch {
      /* not downloaded yet */
    }
    if (text && !this.lists[threat]) this.lists[threat] = Blocklist.parse(text)
    if (age < REFRESH_MS) return

    const fresh = await download(LISTS[threat])
    if (!fresh) return // offline: keep the cached list
    this.lists[threat] = Blocklist.parse(fresh)
    try {
      await mkdir(dir, { recursive: true })
      await writeFile(file, fresh)
    } catch (err) {
      console.warn('[safe-browsing] cache not written:', err)
    }
  }
}

async function download(mirrors: string[]): Promise<string | null> {
  for (const url of mirrors) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
      if (response.ok) {
        const text = await response.text()
        if (text.startsWith('!')) return text // a real list, not a captive portal page
      }
    } catch {
      /* next mirror */
    }
  }
  console.warn('[safe-browsing] lists unreachable, keeping the cached ones')
  return null
}

/**
 * « Retour en lieu sûr » on the warning `page`: back to the last entry that is neither the
 * dangerous page nor a warning (history.back() would land on the blocked load and warn again), or
 * a new tab when there is none.
 */
export function leaveDangerousPage(page: string): void {
  const wc = webContents.getAllWebContents().find((w) => w.getURL() === page)
  if (!wc) return
  const dangerous = failedUrlOf(page)
  const nav = wc.navigationHistory
  const entries = nav.getAllEntries()
  for (let i = nav.getActiveIndex() - 1; i >= 0; i--) {
    const url = entries[i]?.url ?? ''
    if (url !== dangerous && failedUrlOf(url) === null) return nav.goToIndex(i)
  }
  void wc.loadURL(NEW_TAB_URL).catch(() => {})
}
