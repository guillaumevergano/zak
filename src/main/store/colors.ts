import { randomUUID } from 'node:crypto'
import {
  normalizeBrandData,
  normalizeHex,
  type BrandData,
  type BrandFolder,
  type BrandKit,
  type BrandKitSummary,
  type SavedColor
} from '@shared/colors'
import type { Db } from './db'

/** Colors picked and not kept as favorites: the oldest go beyond this. */
export const HISTORY_MAX = 200

interface ColorRow {
  id: string
  hex: string
  favorite: number
  name: string
  source_url: string | null
  source_title: string | null
  picked_at: number
}

interface KitRow {
  id: string
  url: string
  title: string
  host: string
  folder_id: string | null
  comment: string
  data: string
  preview: string | null
  created_at: number
  updated_at: number
}

const toColor = (row: ColorRow): SavedColor => ({
  id: row.id,
  hex: row.hex,
  favorite: row.favorite === 1,
  name: row.name,
  sourceUrl: row.source_url,
  sourceTitle: row.source_title,
  pickedAt: row.picked_at
})

const parseData = (json: string): BrandData => {
  try {
    return normalizeBrandData(JSON.parse(json))
  } catch {
    return normalizeBrandData(null)
  }
}

const toKit = (row: KitRow): BrandKit => ({
  id: row.id,
  url: row.url,
  title: row.title,
  host: row.host,
  folderId: row.folder_id,
  comment: row.comment,
  data: parseData(row.data),
  preview: row.preview,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

/** « Couleurs » (CLAUDE.md §6.8): the eyedropper's history and favorites, the brand kits and their folders. */
export class ColorsStore {
  constructor(private readonly db: Db) {}

  colors(): SavedColor[] {
    return (this.db.prepare('SELECT * FROM colors ORDER BY picked_at DESC').all() as ColorRow[]).map(toColor)
  }

  /** A color picked: at the top of the history (once per color), the oldest beyond HISTORY_MAX go. */
  pick(value: string, source: { url: string; title: string } | null = null, favorite = false): SavedColor {
    const hex = normalizeHex(value)
    if (!hex) throw new Error(`Not a color: ${value}`)
    const now = Date.now()
    const existing = this.db.prepare('SELECT * FROM colors WHERE hex = ?').get(hex) as ColorRow | undefined
    if (existing) {
      this.db
        .prepare('UPDATE colors SET picked_at = ?, favorite = MAX(favorite, ?), source_url = COALESCE(?, source_url), source_title = COALESCE(?, source_title) WHERE id = ?')
        .run(now, favorite ? 1 : 0, source?.url ?? null, source?.title ?? null, existing.id)
    } else {
      this.db
        .prepare('INSERT INTO colors (id, hex, favorite, name, source_url, source_title, picked_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), hex, favorite ? 1 : 0, '', source?.url ?? null, source?.title ?? null, now)
    }
    this.db
      .prepare('DELETE FROM colors WHERE favorite = 0 AND id NOT IN (SELECT id FROM colors WHERE favorite = 0 ORDER BY picked_at DESC LIMIT ?)')
      .run(HISTORY_MAX)
    return toColor(this.db.prepare('SELECT * FROM colors WHERE hex = ?').get(hex) as ColorRow)
  }

  setFavorite(id: string, favorite: boolean): void {
    this.db.prepare('UPDATE colors SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id)
  }

  rename(id: string, name: string): void {
    this.db.prepare('UPDATE colors SET name = ? WHERE id = ?').run(name.trim().slice(0, 80), id)
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM colors WHERE id = ?').run(id)
  }

  /** The history goes; favorites stay. */
  clearHistory(): void {
    this.db.prepare('DELETE FROM colors WHERE favorite = 0').run()
  }

  kits(): BrandKitSummary[] {
    const rows = this.db.prepare('SELECT * FROM brand_kits ORDER BY created_at DESC').all() as KitRow[]
    return rows.map((row) => {
      const kit = toKit(row)
      return {
        id: kit.id,
        url: kit.url,
        title: kit.title,
        host: kit.host,
        folderId: kit.folderId,
        comment: kit.comment,
        colors: kit.data.colors.slice(0, 8).map((c) => c.hex),
        fonts: kit.data.fonts.slice(0, 3).map((f) => f.family),
        logo: kit.data.logo ?? kit.data.icon,
        preview: kit.preview,
        createdAt: kit.createdAt,
        updatedAt: kit.updatedAt
      }
    })
  }

  kit(id: string): BrandKit | null {
    const row = this.db.prepare('SELECT * FROM brand_kits WHERE id = ?').get(id) as KitRow | undefined
    return row ? toKit(row) : null
  }

  addKit(kit: { url: string; title: string; host: string; data: BrandData; preview: string | null; folderId?: string | null }): BrandKit {
    const id = randomUUID()
    const now = Date.now()
    this.db
      .prepare('INSERT INTO brand_kits (id, url, title, host, folder_id, comment, data, preview, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, kit.url, kit.title.slice(0, 200) || kit.host, kit.host, this.folderOrNull(kit.folderId ?? null), '', JSON.stringify(kit.data), kit.preview, now, now)
    return this.kit(id)!
  }

  updateKit(id: string, patch: { title?: string; comment?: string; folderId?: string | null }): BrandKit | null {
    const kit = this.kit(id)
    if (!kit) return null
    const title = patch.title !== undefined ? patch.title.trim().slice(0, 200) || kit.host : kit.title
    const comment = patch.comment !== undefined ? patch.comment.slice(0, 20_000) : kit.comment
    const folderId = patch.folderId !== undefined ? this.folderOrNull(patch.folderId) : kit.folderId
    this.db
      .prepare('UPDATE brand_kits SET title = ?, comment = ?, folder_id = ?, updated_at = ? WHERE id = ?')
      .run(title, comment, folderId, Date.now(), id)
    return this.kit(id)
  }

  removeKit(id: string): void {
    this.db.prepare('DELETE FROM brand_kits WHERE id = ?').run(id)
  }

  folders(): BrandFolder[] {
    return this.db.prepare('SELECT id, name, emoji, position FROM brand_folders ORDER BY position, created_at').all() as BrandFolder[]
  }

  createFolder(name: string, emoji: string | null): BrandFolder {
    const id = randomUUID()
    const position = (this.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM brand_folders').get() as { next: number }).next
    this.db
      .prepare('INSERT INTO brand_folders (id, name, emoji, position, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, name.trim().slice(0, 80) || '…', emoji || null, position, Date.now())
    return this.folders().find((f) => f.id === id)!
  }

  updateFolder(id: string, name: string, emoji: string | null): void {
    this.db.prepare('UPDATE brand_folders SET name = ?, emoji = ? WHERE id = ?').run(name.trim().slice(0, 80) || '…', emoji || null, id)
  }

  /** The folder goes; its kits stay, out of any folder. */
  removeFolder(id: string): void {
    this.db.prepare('DELETE FROM brand_folders WHERE id = ?').run(id)
  }

  private folderOrNull(id: string | null): string | null {
    if (!id) return null
    return this.db.prepare('SELECT 1 FROM brand_folders WHERE id = ?').get(id) ? id : null
  }
}
