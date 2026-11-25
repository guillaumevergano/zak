import type { ClearPeriod, DownloadInfo } from '@shared/types'
import type { Db } from './db'

interface DownloadRow {
  id: string
  url: string
  filename: string
  path: string
  state: DownloadInfo['state']
  received_bytes: number
  total_bytes: number
  started_at: number
  ended_at: number | null
}

const PERIOD_MS: Record<Exclude<ClearPeriod, 'all'>, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 28 * 86_400_000
}

const toInfo = (r: DownloadRow): DownloadInfo => ({
  id: r.id,
  url: r.url,
  filename: r.filename,
  path: r.path,
  state: r.state,
  receivedBytes: r.received_bytes,
  totalBytes: r.total_bytes,
  startedAt: r.started_at
})

/** LIKE pattern for a user query (%, _ and \ taken literally). */
const likePattern = (text: string): string => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

/**
 * Download history (zak://downloads, CLAUDE.md §6.7): one row per download, written when it starts
 * and when it ends. Private windows never write here. Removing a row never touches the file.
 */
export class DownloadsStore {
  constructor(private readonly db: Db) {}

  /** Downloads still running when the app last quit can't be resumed: they failed. */
  markUnfinishedInterrupted(): void {
    this.db.prepare(`UPDATE downloads SET state = 'interrupted' WHERE state IN ('progressing', 'paused')`).run()
  }

  save(info: DownloadInfo, endedAt: number | null = null): void {
    this.db
      .prepare(
        `INSERT INTO downloads (id, url, filename, path, state, received_bytes, total_bytes, started_at, ended_at)
         VALUES (@id, @url, @filename, @path, @state, @receivedBytes, @totalBytes, @startedAt, @endedAt)
         ON CONFLICT(id) DO UPDATE SET filename = excluded.filename, path = excluded.path, state = excluded.state,
           received_bytes = excluded.received_bytes, total_bytes = excluded.total_bytes, ended_at = excluded.ended_at`
      )
      .run({
        id: info.id,
        url: info.url,
        filename: info.filename,
        path: info.path,
        state: info.state,
        receivedBytes: info.receivedBytes,
        totalBytes: info.totalBytes,
        startedAt: info.startedAt,
        endedAt
      })
  }

  get(id: string): DownloadInfo | null {
    const row = this.db.prepare('SELECT * FROM downloads WHERE id = ?').get(id) as DownloadRow | undefined
    return row ? toInfo(row) : null
  }

  /** Newest first; `query` matches the file name or the address; `before` pages through older ones. */
  search(query: string, before: number | null = null, limit = 100): DownloadInfo[] {
    const text = query.trim()
    const rows = this.db
      .prepare(
        `SELECT * FROM downloads
         WHERE (? = '' OR filename LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')
           AND (? IS NULL OR started_at < ?)
         ORDER BY started_at DESC LIMIT ?`
      )
      .all(text, likePattern(text), likePattern(text), before, before, limit) as DownloadRow[]
    return rows.map(toInfo)
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM downloads WHERE id = ?').run(id)
  }

  /** Forgets the finished downloads of the period (those in progress stay listed). */
  clear(period: ClearPeriod, now = Date.now()): void {
    const since = period === 'all' ? 0 : now - PERIOD_MS[period]
    this.db.prepare(`DELETE FROM downloads WHERE started_at >= ? AND state NOT IN ('progressing', 'paused')`).run(since)
  }
}
