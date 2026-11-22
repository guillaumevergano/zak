import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

/** A fake home folder with a Chrome profile (Bookmarks, History), for the import tests. */
export const BOOKMARKS = JSON.stringify({
  roots: {
    bookmark_bar: {
      children: [
        { type: 'url', name: 'Gmail', url: 'https://mail.google.com/' },
        {
          type: 'folder',
          name: 'Travail',
          children: [
            { type: 'url', name: 'Notion', url: 'https://notion.so/' },
            { type: 'folder', name: 'Profond', children: [{ type: 'url', name: 'Figma', url: 'https://figma.com/' }] }
          ]
        },
        { type: 'url', name: 'Script', url: 'javascript:alert(1)' }
      ]
    },
    other: { name: 'Autres favoris', children: [{ type: 'url', name: 'Wiki', url: 'https://fr.wikipedia.org/' }] },
    synced: { name: 'Favoris sur mobile', children: [] }
  }
})

/** A Chrome profile folder with Bookmarks and a History database. */
export function fakeChromeHome(platform: 'darwin' | 'win32' = 'darwin'): string {
  const home = mkdtempSync(join(tmpdir(), 'zak-import-home-'))
  const userData =
    platform === 'darwin' ? join(home, 'Library', 'Application Support', 'Google', 'Chrome') : join(home, 'Google', 'Chrome', 'User Data')
  const profile = join(userData, 'Default')
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(userData, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Personne 1' } } } }))
  writeFileSync(join(profile, 'Bookmarks'), BOOKMARKS)
  const db = new Database(join(profile, 'History'))
  db.exec('CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER, last_visit_time INTEGER, hidden INTEGER)')
  const insert = db.prepare('INSERT INTO urls (url, title, visit_count, last_visit_time, hidden) VALUES (?, ?, ?, ?, ?)')
  insert.run('https://example.com/', 'Example', 3, (1_700_000_000_000 + 11_644_473_600_000) * 1000, 0)
  insert.run('https://hidden.example/', 'Hidden', 1, 13_000_000_000_000_000, 1)
  insert.run('chrome://settings/', 'Réglages', 1, 13_000_000_000_000_000, 0)
  db.close()
  return home
}
