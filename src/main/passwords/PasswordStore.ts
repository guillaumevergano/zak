import { randomUUID } from 'node:crypto'
import type { SavedLogin } from '@shared/types'
import type { Db } from '../store/db'

/** Encrypts a password for the disk (safeStorage in the app, a fake in unit tests). */
export interface Cipher {
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

interface Row {
  id: string
  origin: string
  username: string
  password: Buffer
  created_at: number
  updated_at: number
  used_at: number | null
}

const toLogin = (r: Row): SavedLogin => ({
  id: r.id,
  origin: r.origin,
  username: r.username,
  updatedAt: r.updated_at,
  usedAt: r.used_at
})

/** The origin a password belongs to (scheme + host + port), or null for anything but http(s). */
export function loginOrigin(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null
  } catch {
    return null
  }
}

/**
 * Saved passwords, one per (site, username). Passwords are only kept encrypted (`Cipher`): the
 * plain text exists in memory just long enough to fill a form, copy or export it.
 */
export class PasswordStore {
  constructor(
    private readonly db: Db,
    private readonly cipher: Cipher
  ) {}

  list(): SavedLogin[] {
    return (this.db.prepare('SELECT * FROM passwords ORDER BY origin, username').all() as Row[]).map(toLogin)
  }

  forOrigin(origin: string): SavedLogin[] {
    return (
      this.db.prepare('SELECT * FROM passwords WHERE origin = ? ORDER BY used_at DESC, updated_at DESC').all(origin) as Row[]
    ).map(toLogin)
  }

  get(id: string): SavedLogin | undefined {
    const row = this.db.prepare('SELECT * FROM passwords WHERE id = ?').get(id) as Row | undefined
    return row && toLogin(row)
  }

  password(id: string): string | null {
    const row = this.db.prepare('SELECT password FROM passwords WHERE id = ?').get(id) as Pick<Row, 'password'> | undefined
    return row ? this.cipher.decrypt(row.password) : null
  }

  /** What saving these credentials would do: nothing (already saved), add, or update a password. */
  check(origin: string, username: string, password: string): 'saved' | 'new' | 'update' {
    const row = this.db.prepare('SELECT id FROM passwords WHERE origin = ? AND username = ?').get(origin, username) as
      | Pick<Row, 'id'>
      | undefined
    if (!row) return 'new'
    return this.password(row.id) === password ? 'saved' : 'update'
  }

  /** Adds the login, or changes its password. Returns its id. */
  save(origin: string, username: string, password: string, now = Date.now()): string {
    const existing = this.db.prepare('SELECT id FROM passwords WHERE origin = ? AND username = ?').get(origin, username) as
      | Pick<Row, 'id'>
      | undefined
    const encrypted = this.cipher.encrypt(password)
    if (existing) {
      this.db.prepare('UPDATE passwords SET password = ?, updated_at = ? WHERE id = ?').run(encrypted, now, existing.id)
      return existing.id
    }
    const id = randomUUID()
    this.db
      .prepare('INSERT INTO passwords (id, origin, username, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, origin, username, encrypted, now, now)
    this.db.prepare('DELETE FROM password_never WHERE origin = ?').run(origin)
    return id
  }

  update(id: string, changes: { username?: string; password?: string }, now = Date.now()): void {
    if (changes.username !== undefined) {
      this.db.prepare('UPDATE passwords SET username = ?, updated_at = ? WHERE id = ?').run(changes.username, now, id)
    }
    if (changes.password !== undefined) {
      this.db.prepare('UPDATE passwords SET password = ?, updated_at = ? WHERE id = ?').run(this.cipher.encrypt(changes.password), now, id)
    }
  }

  markUsed(id: string, now = Date.now()): void {
    this.db.prepare('UPDATE passwords SET used_at = ? WHERE id = ?').run(now, id)
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM passwords WHERE id = ?').run(id)
  }

  /** « Jamais pour ce site ». */
  never(origin: string): void {
    this.db.prepare('INSERT OR IGNORE INTO password_never (origin) VALUES (?)').run(origin)
  }

  isNever(origin: string): boolean {
    return this.db.prepare('SELECT 1 FROM password_never WHERE origin = ?').get(origin) !== undefined
  }

  /** Adds imported logins (CSV); an existing (site, username) gets the imported password. */
  importLogins(logins: { url: string; username: string; password: string }[]): number {
    let count = 0
    this.db.transaction(() => {
      for (const login of logins) {
        const origin = loginOrigin(login.url)
        if (!origin || login.password === '') continue
        this.save(origin, login.username, login.password)
        count++
      }
    })()
    return count
  }

  /** Every login with its password, for the CSV export. */
  exportLogins(): { origin: string; username: string; password: string }[] {
    return (this.db.prepare('SELECT * FROM passwords ORDER BY origin, username').all() as Row[]).map((r) => ({
      origin: r.origin,
      username: r.username,
      password: this.cipher.decrypt(r.password)
    }))
  }
}
