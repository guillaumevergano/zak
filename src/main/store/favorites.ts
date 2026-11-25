import { randomUUID } from 'node:crypto'
import type { FavoriteInfo, FavoriteInput, FolderInfo, FolderInput } from '@shared/types'
import type { Db } from './db'

interface FavoriteRow {
  id: string
  title: string
  url: string
  emoji: string | null
  favicon: string | null
  folder_id: string | null
  position: number
  row: number
}

interface FolderRow {
  id: string
  name: string
  emoji: string | null
  position: number
  collapsed: number
}

/**
 * Sidebar favorites and folders (CLAUDE.md §6.2), persisted immediately. Positions are dense
 * (0..n-1) within each container: the root, or a folder. One folder level only. The root is also
 * cut in rows (`row`, dense from 0, never empty): positions follow the rows, then the order in a row.
 */
export class FavoritesStore {
  constructor(private readonly db: Db) {}

  folders(): FolderInfo[] {
    const rows = this.db.prepare('SELECT * FROM folders ORDER BY position').all() as FolderRow[]
    return rows.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, position: r.position, collapsed: r.collapsed === 1 }))
  }

  favorites(): FavoriteInfo[] {
    const rows = this.db
      .prepare('SELECT * FROM favorites ORDER BY folder_id IS NOT NULL, folder_id, row, position')
      .all() as FavoriteRow[]
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      emoji: r.emoji,
      favicon: r.favicon,
      folderId: r.folder_id,
      position: r.position,
      row: r.folder_id === null ? r.row : 0
    }))
  }

  /** Appends to the container (the root's last row), or inserts at `index` (in `row`, for the root). */
  addFavorite(input: FavoriteInput, index?: number, row?: number): string {
    const id = randomUUID()
    this.db.transaction(() => {
      const folderId = this.existingFolder(input.folderId)
      this.db
        .prepare(
          `INSERT INTO favorites (id, title, url, emoji, favicon, folder_id, position, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, input.title, input.url, input.emoji, input.favicon ?? null, folderId, this.favoriteCount(folderId), Date.now())
      this.placeFavorite(id, folderId, index ?? Number.MAX_SAFE_INTEGER, row)
    })()
    return id
  }

  /** Edits title, URL, emoji and folder (moving to another folder appends there). */
  updateFavorite(id: string, input: FavoriteInput): void {
    this.db.transaction(() => {
      const row = this.favoriteRow(id)
      if (!row) return
      this.db
        .prepare('UPDATE favorites SET title = ?, url = ?, emoji = ? WHERE id = ?')
        .run(input.title, input.url, input.emoji, id)
      const folderId = this.existingFolder(input.folderId)
      if (folderId !== row.folder_id) this.placeFavorite(id, folderId, Number.MAX_SAFE_INTEGER)
    })()
  }

  removeFavorite(id: string): void {
    this.db.transaction(() => {
      const row = this.favoriteRow(id)
      if (!row) return
      this.db.prepare('DELETE FROM favorites WHERE id = ?').run(id)
      this.renumberFavorites(row.folder_id)
    })()
  }

  /**
   * Drag & drop: to `folderId` (null = root) at `index`. In the root, `index` is within `row`; a row
   * past the last one starts a new line. Without a row: the last one.
   */
  moveFavorite(id: string, folderId: string | null, index: number, row?: number): void {
    this.db.transaction(() => this.placeFavorite(id, this.existingFolder(folderId), index, row))()
  }

  /** Remembers the favicon of pages whose URL starts with a favorite's origin. */
  updateFavicon(pageUrl: string, favicon: string): boolean {
    let origin: string
    try {
      origin = new URL(pageUrl).origin
    } catch {
      return false
    }
    if (!/^https?:/.test(origin)) return false
    const result = this.db
      .prepare(
        `UPDATE favorites SET favicon = ?
         WHERE (url = ? OR url LIKE ? || '/%') AND (favicon IS NULL OR favicon != ?)`
      )
      .run(favicon, origin, origin, favicon)
    return result.changes > 0
  }

  favorite(id: string): FavoriteInfo | undefined {
    return this.favorites().find((f) => f.id === id)
  }

  folder(id: string): FolderInfo | undefined {
    return this.folders().find((f) => f.id === id)
  }

  addFolder(input: FolderInput): string {
    const id = randomUUID()
    const count = (this.db.prepare('SELECT COUNT(*) AS n FROM folders').get() as { n: number }).n
    this.db
      .prepare('INSERT INTO folders (id, name, emoji, position, collapsed, created_at) VALUES (?, ?, ?, ?, 0, ?)')
      .run(id, input.name, input.emoji, count, Date.now())
    return id
  }

  updateFolder(id: string, input: FolderInput): void {
    this.db.prepare('UPDATE folders SET name = ?, emoji = ? WHERE id = ?').run(input.name, input.emoji, id)
  }

  setFolderCollapsed(id: string, collapsed: boolean): void {
    this.db.prepare('UPDATE folders SET collapsed = ? WHERE id = ?').run(collapsed ? 1 : 0, id)
  }

  /** Deleting a folder keeps its favorites: they go to the end of the root (§5: ON DELETE SET NULL). */
  removeFolder(id: string): void {
    this.db.transaction(() => {
      const base = this.favoriteCount(null)
      const inside = this.db.prepare('SELECT id FROM favorites WHERE folder_id = ? ORDER BY position').all(id) as {
        id: string
      }[]
      const lastRow = this.rootRows().length - 1
      const update = this.db.prepare('UPDATE favorites SET folder_id = NULL, position = ?, row = ? WHERE id = ?')
      inside.forEach((row, i) => update.run(base + i, Math.max(0, lastRow), row.id))
      this.db.prepare('DELETE FROM folders WHERE id = ?').run(id)
      this.renumberFolders()
    })()
  }

  moveFolder(id: string, index: number): void {
    this.db.transaction(() => {
      const ids = (this.db.prepare('SELECT id FROM folders ORDER BY position').all() as { id: string }[]).map((r) => r.id)
      const from = ids.indexOf(id)
      if (from < 0) return
      ids.splice(from, 1)
      ids.splice(clamp(index, 0, ids.length), 0, id)
      const update = this.db.prepare('UPDATE folders SET position = ? WHERE id = ?')
      ids.forEach((folderId, i) => update.run(i, folderId))
    })()
  }

  private placeFavorite(id: string, folderId: string | null, index: number, rowIndex?: number): void {
    const row = this.favoriteRow(id)
    if (!row) return
    if (folderId === null) {
      const rows = this.rootRows().map((ids) => ids.filter((other) => other !== id))
      const target = Math.max(0, Math.min(rowIndex ?? rows.length - 1, rows.length))
      if (target === rows.length) rows.push([])
      rows[target]!.splice(clamp(index, 0, rows[target]!.length), 0, id)
      this.db.prepare('UPDATE favorites SET folder_id = NULL WHERE id = ?').run(id)
      this.writeRoot(rows)
      if (row.folder_id !== null) this.renumberFavorites(row.folder_id)
      return
    }
    const ids = this.containerIds(folderId).filter((other) => other !== id)
    ids.splice(clamp(index, 0, ids.length), 0, id)
    this.db.prepare('UPDATE favorites SET folder_id = ?, row = 0 WHERE id = ?').run(folderId, id)
    const update = this.db.prepare('UPDATE favorites SET position = ? WHERE id = ?')
    ids.forEach((favoriteId, i) => update.run(i, favoriteId))
    if (row.folder_id !== folderId) this.renumberFavorites(row.folder_id)
  }

  /** The root favorites' ids, row by row. */
  private rootRows(): string[][] {
    const rows = this.db.prepare('SELECT id, row FROM favorites WHERE folder_id IS NULL ORDER BY row, position').all() as { id: string; row: number }[]
    const out: string[][] = []
    let last: number | null = null
    for (const r of rows) {
      if (r.row !== last) out.push([])
      last = r.row
      out[out.length - 1]!.push(r.id)
    }
    return out
  }

  /** Saves the root's rows: empty rows go, rows and positions are renumbered. */
  private writeRoot(rows: string[][]): void {
    const update = this.db.prepare('UPDATE favorites SET row = ?, position = ? WHERE id = ?')
    let position = 0
    rows.filter((ids) => ids.length > 0).forEach((ids, r) => ids.forEach((id) => update.run(r, position++, id)))
  }

  private renumberFavorites(folderId: string | null): void {
    if (folderId === null) return this.writeRoot(this.rootRows())
    const update = this.db.prepare('UPDATE favorites SET position = ? WHERE id = ?')
    this.containerIds(folderId).forEach((id, i) => update.run(i, id))
  }

  private renumberFolders(): void {
    const ids = this.db.prepare('SELECT id FROM folders ORDER BY position').all() as { id: string }[]
    const update = this.db.prepare('UPDATE folders SET position = ? WHERE id = ?')
    ids.forEach((row, i) => update.run(i, row.id))
  }

  private containerIds(folderId: string | null): string[] {
    const rows = (
      folderId === null
        ? this.db.prepare('SELECT id FROM favorites WHERE folder_id IS NULL ORDER BY row, position').all()
        : this.db.prepare('SELECT id FROM favorites WHERE folder_id = ? ORDER BY position').all(folderId)
    ) as { id: string }[]
    return rows.map((r) => r.id)
  }

  private favoriteCount(folderId: string | null): number {
    return this.containerIds(folderId).length
  }

  private favoriteRow(id: string): FavoriteRow | undefined {
    return this.db.prepare('SELECT * FROM favorites WHERE id = ?').get(id) as FavoriteRow | undefined
  }

  /** A folder id that no longer exists (deleted in another window) falls back to the root. */
  private existingFolder(folderId: string | null): string | null {
    if (folderId === null) return null
    return this.db.prepare('SELECT 1 FROM folders WHERE id = ?').get(folderId) ? folderId : null
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
