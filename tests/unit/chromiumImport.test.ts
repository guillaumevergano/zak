import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chromiumTimeToMs, detectBrowsers, parseChromiumBookmarks, readChromiumHistory } from '../../src/main/import/chromium'
import { openMemoryDatabase } from '../../src/main/store/db'
import { HistoryStore } from '../../src/main/store/history'
import { BOOKMARKS, fakeChromeHome } from '../fixtures/chromeProfile'

describe('Chromium import', () => {
  it('flattens bookmarks to one folder level, the bar at the root', () => {
    const parsed = parseChromiumBookmarks(BOOKMARKS)
    expect(parsed.root.map((l) => l.title)).toEqual(['Gmail'])
    expect(parsed.folders).toEqual([
      { name: 'Travail', links: [expect.objectContaining({ title: 'Notion' }), expect.objectContaining({ title: 'Figma' })] },
      { name: 'Autres favoris', links: [expect.objectContaining({ url: 'https://fr.wikipedia.org/' })] }
    ])
  })

  it('converts Chromium times', () => {
    expect(chromiumTimeToMs((1_700_000_000_000 + 11_644_473_600_000) * 1000)).toBe(1_700_000_000_000)
  })

  it('finds the installed browsers and their profiles', () => {
    expect(detectBrowsers({ platform: 'darwin', home: fakeChromeHome() })).toEqual([
      { id: 'chrome', name: 'Google Chrome', profiles: [{ path: expect.stringMatching(/Chrome[/\\]Default$/), name: 'Personne 1' }] }
    ])
    const winHome = fakeChromeHome('win32')
    expect(detectBrowsers({ platform: 'win32', home: '/nowhere', localAppData: winHome })[0]?.name).toBe('Google Chrome')
    expect(detectBrowsers({ platform: 'darwin', home: mkdtempSync(join(tmpdir(), 'zak-empty-')) })).toEqual([])
  })

  it('reads the visible web pages of the history, then imports them once', () => {
    const [browser] = detectBrowsers({ platform: 'darwin', home: fakeChromeHome() })
    const visits = readChromiumHistory(browser!.profiles[0]!.path)
    expect(visits).toEqual([{ url: 'https://example.com/', title: 'Example', visitedAt: 1_700_000_000_000, visitCount: 3 }])

    const history = new HistoryStore(openMemoryDatabase())
    history.recordVisit('https://example.com/', 'Mine', 1_800_000_000_000)
    expect(history.importVisits(visits)).toBe(1)
    expect(history.importVisits(visits)).toBe(1)
    expect(history.search('')).toEqual([
      expect.objectContaining({ url: 'https://example.com/', title: 'Mine', visitedAt: 1_800_000_000_000, visitCount: 3 })
    ])
  })
})
