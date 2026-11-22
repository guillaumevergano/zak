import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { ImportedBookmarks, ImportedLink } from '../sidebar/bookmarksHtml'

/**
 * Import from the other Chromium browsers installed (Chrome, Edge, Brave, Arc, Vivaldi…): they
 * share the same profile files. Read straight from their profile folder, no export needed:
 * `Bookmarks` (JSON) and `History` (SQLite, copied first: the browser may hold it open).
 * Passwords are encrypted per browser (and on Windows, bound to it): they come from a CSV export.
 */
export interface BrowserProfile {
  /** Folder of the profile, e.g. …/Google/Chrome/Default. */
  path: string
  /** Name shown in that browser (« Personne 1 », « Travail »…). */
  name: string
}

export interface InstalledBrowser {
  id: string
  name: string
  profiles: BrowserProfile[]
}

interface KnownBrowser {
  id: string
  name: string
  /** User Data folder per platform, relative to the home folder (macOS, Linux) or LOCALAPPDATA (Windows). */
  darwin?: string
  win32?: string
  linux?: string
}

const KNOWN: KnownBrowser[] = [
  { id: 'chrome', name: 'Google Chrome', darwin: 'Library/Application Support/Google/Chrome', win32: 'Google/Chrome/User Data', linux: '.config/google-chrome' },
  { id: 'arc', name: 'Arc', darwin: 'Library/Application Support/Arc/User Data' },
  { id: 'edge', name: 'Microsoft Edge', darwin: 'Library/Application Support/Microsoft Edge', win32: 'Microsoft/Edge/User Data', linux: '.config/microsoft-edge' },
  { id: 'brave', name: 'Brave', darwin: 'Library/Application Support/BraveSoftware/Brave-Browser', win32: 'BraveSoftware/Brave-Browser/User Data', linux: '.config/BraveSoftware/Brave-Browser' },
  { id: 'vivaldi', name: 'Vivaldi', darwin: 'Library/Application Support/Vivaldi', win32: 'Vivaldi/User Data', linux: '.config/vivaldi' },
  { id: 'chromium', name: 'Chromium', darwin: 'Library/Application Support/Chromium', win32: 'Chromium/User Data', linux: '.config/chromium' }
]

/** The Chromium browsers found on this computer, with their profiles that have something to import. */
export function detectBrowsers(env: { platform: NodeJS.Platform; home: string; localAppData?: string }): InstalledBrowser[] {
  const found: InstalledBrowser[] = []
  for (const browser of KNOWN) {
    const relative = browser[env.platform as 'darwin' | 'win32' | 'linux']
    if (!relative) continue
    const base = env.platform === 'win32' ? env.localAppData : env.home
    if (!base) continue
    const userData = join(base, ...relative.split('/'))
    const profiles = listProfiles(userData)
    if (profiles.length > 0) found.push({ id: browser.id, name: browser.name, profiles })
  }
  return found
}

function listProfiles(userData: string): BrowserProfile[] {
  let names: Record<string, { name?: string }> = {}
  try {
    const state = JSON.parse(readFileSync(join(userData, 'Local State'), 'utf8')) as {
      profile?: { info_cache?: Record<string, { name?: string }> }
    }
    names = state.profile?.info_cache ?? {}
  } catch {
    /* no Local State: try the default profile alone */
  }
  const dirs = Object.keys(names).length > 0 ? Object.keys(names) : ['Default']
  return dirs
    .map((dir) => ({ path: join(userData, dir), name: names[dir]?.name || dir }))
    .filter((p) => !p.name.startsWith('__')) // Arc's internal profiles
    .filter((p) => existsSync(join(p.path, 'Bookmarks')) || existsSync(join(p.path, 'History')))
}

interface BookmarkNode {
  type?: 'url' | 'folder'
  name?: string
  url?: string
  children?: BookmarkNode[]
}

/**
 * Chromium's `Bookmarks` JSON → the sidebar's shape (one folder level, CLAUDE.md §6.2), like the
 * HTML import: the bookmarks bar is transparent (links at the root, its folders top level), « Other
 * bookmarks » and « Mobile bookmarks » become folders, deeper folders are flattened.
 */
export function parseChromiumBookmarks(json: string): ImportedBookmarks {
  const data = JSON.parse(json) as { roots?: Record<string, BookmarkNode> }
  const roots = data.roots ?? {}
  const result: ImportedBookmarks = { root: [], folders: [] }
  const links = (node: BookmarkNode): ImportedLink[] =>
    (node.children ?? []).flatMap((child) => {
      if (child.type === 'folder') return links(child)
      if (child.type === 'url' && child.url && /^https?:\/\//i.test(child.url)) {
        return [{ title: child.name?.trim() || child.url, url: child.url, icon: null }]
      }
      return []
    })
  const addFolder = (name: string, node: BookmarkNode): void => {
    const found = links(node)
    if (found.length > 0) result.folders.push({ name: name || 'Dossier', links: found })
  }

  for (const child of roots['bookmark_bar']?.children ?? []) {
    if (child.type === 'folder') addFolder(child.name ?? '', child)
    else result.root.push(...links({ children: [child] }))
  }
  if (roots['other']) addFolder(roots['other'].name || 'Autres favoris', roots['other'])
  if (roots['synced']) addFolder(roots['synced'].name || 'Favoris sur mobile', roots['synced'])
  return result
}

export interface ImportedVisit {
  url: string
  title: string | null
  /** Unix time, ms. */
  visitedAt: number
  visitCount: number
}

/** Chromium stores times as microseconds since 1601-01-01. */
export function chromiumTimeToMs(time: number): number {
  return Math.round(time / 1000 - 11_644_473_600_000)
}

/** The most recent pages of a profile's history (copied first: the browser may be running). */
export function readChromiumHistory(profilePath: string, limit = 20_000): ImportedVisit[] {
  const source = join(profilePath, 'History')
  if (!existsSync(source)) return []
  const dir = mkdtempSync(join(tmpdir(), 'zak-import-'))
  try {
    const copy = join(dir, 'History')
    copyFileSync(source, copy)
    const db = new Database(copy, { readonly: true, fileMustExist: true })
    try {
      const rows = db
        .prepare(
          `SELECT url, title, visit_count AS visitCount, last_visit_time AS time FROM urls
           WHERE hidden = 0 AND last_visit_time > 0 ORDER BY last_visit_time DESC LIMIT ?`
        )
        .all(limit) as { url: string; title: string; visitCount: number; time: number }[]
      return rows
        .filter((r) => /^https?:\/\//i.test(r.url))
        .map((r) => ({ url: r.url, title: r.title || null, visitedAt: chromiumTimeToMs(r.time), visitCount: Math.max(1, r.visitCount) }))
    } finally {
      db.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Reads a profile's bookmarks, or null when it has none. */
export function readChromiumBookmarks(profilePath: string): ImportedBookmarks | null {
  const file = join(profilePath, 'Bookmarks')
  if (!existsSync(file)) return null
  return parseChromiumBookmarks(readFileSync(file, 'utf8'))
}
