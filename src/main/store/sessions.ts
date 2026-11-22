import type { TabGroupColor, TabGroupInfo } from '@shared/types'
import type { Db } from './db'

/** A tab as saved for session restore (CLAUDE.md §5 `tab_sessions`). */
export interface SessionTab {
  url: string
  title: string
  pinned: boolean
  active: boolean
  /** Its tab group, if any (the same object for every tab of the group). */
  group?: TabGroupInfo | null
}

export type SessionWindow = SessionTab[]

interface Row {
  window_id: string
  url: string
  title: string
  pinned: number
  active: number
  group_id: string | null
  group_name: string | null
  group_color: string | null
  group_collapsed: number | null
}

/** The tabs of the normal windows, saved as they change and reopened at launch. */
export class SessionStore {
  constructor(private readonly db: Db) {}

  save(windows: SessionWindow[]): void {
    const insert = this.db.prepare(
      `INSERT INTO tab_sessions (window_id, tab_index, url, title, pinned, active, group_id, group_name, group_color, group_collapsed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM tab_sessions').run()
      windows.forEach((tabs, w) =>
        tabs.forEach((t, i) => {
          const g = t.group ?? null
          insert.run(String(w), i, t.url, t.title, t.pinned ? 1 : 0, t.active ? 1 : 0, g?.id ?? null, g?.name ?? null, g?.color ?? null, g ? (g.collapsed ? 1 : 0) : null)
        })
      )
    })()
  }

  load(): SessionWindow[] {
    const rows = this.db.prepare('SELECT * FROM tab_sessions ORDER BY CAST(window_id AS INTEGER), tab_index').all() as Row[]
    const windows = new Map<string, SessionWindow>()
    const groups = new Map<string, TabGroupInfo>()
    for (const r of rows) {
      const tabs = windows.get(r.window_id) ?? []
      let group: TabGroupInfo | null = null
      if (r.group_id) {
        group = groups.get(r.group_id) ?? {
          id: r.group_id,
          name: r.group_name ?? '',
          color: (r.group_color ?? 'grey') as TabGroupColor,
          collapsed: r.group_collapsed === 1
        }
        groups.set(r.group_id, group)
      }
      tabs.push({ url: r.url, title: r.title, pinned: r.pinned === 1, active: r.active === 1, group })
      windows.set(r.window_id, tabs)
    }
    return [...windows.values()]
  }
}
