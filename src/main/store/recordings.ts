import { randomUUID } from 'node:crypto'
import type { Db } from './db'

export interface RecordingRow {
  id: string
  path: string
  name: string
  createdAt: number
  duration: number
  thumbnail: string | null
  driveId: string | null
  link: string | null
}

interface Row {
  id: string
  path: string
  name: string
  created_at: number
  duration: number
  thumbnail: string | null
  drive_id: string | null
  link: string | null
}

const toRecording = (row: Row): RecordingRow => ({
  id: row.id,
  path: row.path,
  name: row.name,
  createdAt: row.created_at,
  duration: row.duration,
  thumbnail: row.thumbnail,
  driveId: row.drive_id,
  link: row.link
})

/** Screen recordings made with Zak (CLAUDE.md §6.8), and their link once shared on Drive. */
export class RecordingsStore {
  constructor(private readonly db: Db) {}

  list(): RecordingRow[] {
    return (this.db.prepare('SELECT * FROM recordings ORDER BY created_at DESC').all() as Row[]).map(toRecording)
  }

  get(id: string): RecordingRow | null {
    const row = this.db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as Row | undefined
    return row ? toRecording(row) : null
  }

  add(path: string, name: string, duration: number, thumbnail: string | null): RecordingRow {
    const id = randomUUID()
    this.db
      .prepare('INSERT INTO recordings (id, path, name, created_at, duration, thumbnail) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, path, name, Date.now(), Math.max(0, Math.round(duration)), thumbnail)
    return this.get(id)!
  }

  setShared(id: string, driveId: string | null, link: string | null): void {
    this.db.prepare('UPDATE recordings SET drive_id = ?, link = ? WHERE id = ?').run(driveId, link, id)
  }

  /** Off the list (the file itself stays where it is). */
  remove(id: string): void {
    this.db.prepare('DELETE FROM recordings WHERE id = ?').run(id)
  }
}
