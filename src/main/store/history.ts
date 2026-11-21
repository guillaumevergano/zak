import type { ClearPeriod, HistoryEntry } from '@shared/types'
import type { Db } from './db'

interface HistoryRow {
  id: number
  url: string
  title: string | null
  favicon: string | null
  visited_at: number
  visit_count: number
}

const PERIOD_MS: Record<Exclude<ClearPeriod, 'all'>, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 28 * 86_400_000
}

/** Only real web pages are recorded: not internal pages, about:, data:, extensions… */
export function isRecordable(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

const toEntry = (r: HistoryRow): HistoryEntry => ({
  id: r.id,
  url: r.url,
  title: r.title || r.url,
  favicon: r.favicon,
  visitedAt: r.visited_at,
  visitCount: r.visit_count
})

/** LIKE pattern for a user query (%, _ and \ taken literally). */
const likePattern = (text: string): string => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

/**
 * Browsing history (CLAUDE.md §5, §6.7): one row per URL with its last visit and visit count.
 * Private windows never write here.
 */
export class HistoryStore {
  constructor(private readonly db: Db) {}

  recordVisit(url: string, title: string | null, now = Date.now()): void {
    if (!isRecordable(url)) return
    this.db
      .prepare(
        `INSERT INTO history (url, title, visited_at, visit_count) VALUES (?, ?, ?, 1)
         ON CONFLICT(url) DO UPDATE SET visited_at = excluded.visited_at, visit_count = visit_count + 1,
           title = COALESCE(excluded.title, history.title)`
      )
      .run(url, title || null, now)
  }

  setTitle(url: string, title: string): void {
    if (title) this.db.prepare('UPDATE history SET title = ? WHERE url = ?').run(title, url)
  }

  setFavicon(url: string, favicon: string): void {
    this.db.prepare('UPDATE history SET favicon = ? WHERE url = ?').run(favicon, url)
  }

  /** Newest first; `query` matches the title or the URL; `before` pages through older entries. */
  search(query: string, before: number | null = null, limit = 100): HistoryEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM history
         WHERE (? = '' OR title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')
           AND (? IS NULL OR visited_at < ?)
         ORDER BY visited_at DESC LIMIT ?`
      )
      .all(query.trim(), likePattern(query.trim()), likePattern(query.trim()), before, before, limit) as HistoryRow[]
    return rows.map(toEntry)
  }

  /**
   * Omnibox suggestions: entries whose URL (without scheme/www) starts with the text first, then
   * any title/URL match; frequent and recent pages first.
   */
  suggest(text: string, limit = 6): HistoryEntry[] {
    const query = text.trim().toLowerCase()
    if (query === '') return []
    const bare = query.replace(/^https?:\/\//, '').replace(/^www\./, '')
    const prefix = `${bare.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const rows = this.db
      .prepare(
        `SELECT *,
           (CASE WHEN url LIKE 'http://' || ? ESCAPE '\\' OR url LIKE 'https://' || ? ESCAPE '\\'
                  OR url LIKE 'http://www.' || ? ESCAPE '\\' OR url LIKE 'https://www.' || ? ESCAPE '\\'
                 THEN 1 ELSE 0 END) AS prefix_match
         FROM history
         WHERE url LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\'
         ORDER BY prefix_match DESC, visit_count * 1.0 / (1 + (? - visited_at) / 86400000.0) DESC
         LIMIT ?`
      )
      .all(prefix, prefix, prefix, prefix, likePattern(bare), likePattern(query), Date.now(), limit) as HistoryRow[]
    return rows.map(toEntry)
  }

  /** Most recent pages, one per host (new tab page « Récemment »). */
  recentByHost(limit = 4): HistoryEntry[] {
    const rows = this.db.prepare('SELECT * FROM history ORDER BY visited_at DESC LIMIT 200').all() as HistoryRow[]
    const seen = new Set<string>()
    const result: HistoryEntry[] = []
    for (const row of rows) {
      const host = new URL(row.url).host
      if (seen.has(host)) continue
      seen.add(host)
      result.push(toEntry(row))
      if (result.length === limit) break
    }
    return result
  }

  remove(ids: number[]): void {
    const del = this.db.prepare('DELETE FROM history WHERE id = ?')
    this.db.transaction(() => ids.forEach((id) => del.run(id)))()
  }

  clear(period: ClearPeriod, now = Date.now()): void {
    if (period === 'all') this.db.prepare('DELETE FROM history').run()
    else this.db.prepare('DELETE FROM history WHERE visited_at >= ?').run(now - PERIOD_MS[period])
  }
}
