import type { Db } from './db'

/** A tab as saved for session restore (CLAUDE.md §5 `tab_sessions`). */
export interface SessionTab {
  url: string
  title: string
  pinned: boolean
  active: boolean
}

export type SessionWindow = SessionTab[]

/** The tabs of the normal windows, saved as they change and reopened at launch. */
export class SessionStore {
  constructor(private readonly db: Db) {}

  save(windows: SessionWindow[]): void {
    const insert = this.db.prepare(
      'INSERT INTO tab_sessions (window_id, tab_index, url, title, pinned, active) VALUES (?, ?, ?, ?, ?, ?)'
    )
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM tab_sessions').run()
      windows.forEach((tabs, w) =>
        tabs.forEach((t, i) => insert.run(String(w), i, t.url, t.title, t.pinned ? 1 : 0, t.active ? 1 : 0))
      )
    })()
  }

  load(): SessionWindow[] {
    const rows = this.db.prepare('SELECT * FROM tab_sessions ORDER BY CAST(window_id AS INTEGER), tab_index').all() as {
      window_id: string
      url: string
      title: string
      pinned: number
      active: number
    }[]
    const windows = new Map<string, SessionWindow>()
    for (const r of rows) {
      const tabs = windows.get(r.window_id) ?? []
      tabs.push({ url: r.url, title: r.title, pinned: r.pinned === 1, active: r.active === 1 })
      windows.set(r.window_id, tabs)
    }
    return [...windows.values()]
  }
}
