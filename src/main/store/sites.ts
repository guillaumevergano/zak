import type { PermissionKind, SitePermission } from '@shared/types'
import type { Db } from './db'

/** Per-site memory (CLAUDE.md §6.7): permission decisions by origin, zoom level by host. */
export class SitesStore {
  constructor(private readonly db: Db) {}

  permission(origin: string, permission: PermissionKind): boolean | undefined {
    const row = this.db
      .prepare('SELECT granted FROM site_permissions WHERE origin = ? AND permission = ?')
      .get(origin, permission) as { granted: number } | undefined
    return row ? row.granted === 1 : undefined
  }

  setPermission(origin: string, permission: PermissionKind, granted: boolean): void {
    this.db
      .prepare(
        `INSERT INTO site_permissions (origin, permission, granted) VALUES (?, ?, ?)
         ON CONFLICT(origin, permission) DO UPDATE SET granted = excluded.granted`
      )
      .run(origin, permission, granted ? 1 : 0)
  }

  removePermission(origin: string, permission: PermissionKind): void {
    this.db.prepare('DELETE FROM site_permissions WHERE origin = ? AND permission = ?').run(origin, permission)
  }

  permissions(): SitePermission[] {
    const rows = this.db.prepare('SELECT * FROM site_permissions ORDER BY origin, permission').all() as {
      origin: string
      permission: PermissionKind
      granted: number
    }[]
    return rows.map((r) => ({ origin: r.origin, permission: r.permission, granted: r.granted === 1 }))
  }

  /** Zoom factor of a host (1 = 100 %). Stored in the `level` column. */
  zoom(host: string): number {
    const row = this.db.prepare('SELECT level FROM site_zoom WHERE host = ?').get(host) as { level: number } | undefined
    return row?.level ?? 1
  }

  setZoom(host: string, level: number): void {
    if (level === 1) this.db.prepare('DELETE FROM site_zoom WHERE host = ?').run(host)
    else
      this.db
        .prepare('INSERT INTO site_zoom (host, level) VALUES (?, ?) ON CONFLICT(host) DO UPDATE SET level = excluded.level')
        .run(host, level)
  }
}
