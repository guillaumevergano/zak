import { beforeEach, describe, expect, it } from 'vitest'
import { openMemoryDatabase } from '../../src/main/store/db'
import { HistoryStore } from '../../src/main/store/history'

let store: HistoryStore
beforeEach(() => {
  store = new HistoryStore(openMemoryDatabase())
})

describe('HistoryStore', () => {
  it('keeps one row per URL with its visit count and last title', () => {
    store.recordVisit('https://a.test/', 'A', 1000)
    store.recordVisit('https://a.test/', null, 2000)
    store.setTitle('https://a.test/', 'A bis')
    const [entry] = store.search('')
    expect(entry).toMatchObject({ url: 'https://a.test/', title: 'A bis', visitCount: 2, visitedAt: 2000 })
  })

  it('ignores internal and non-web pages', () => {
    store.recordVisit('zak://settings/', 'Réglages')
    store.recordVisit('about:blank', '')
    store.recordVisit('chrome-extension://x/options.html', 'Options')
    expect(store.search('')).toEqual([])
  })

  it('searches titles and URLs, newest first, with paging', () => {
    store.recordVisit('https://cuisine.test/tarte', 'Tarte aux pommes', 1000)
    store.recordVisit('https://news.test/', 'Actualités', 2000)
    store.recordVisit('https://cuisine.test/soupe', 'Soupe 100%', 3000)
    expect(store.search('cuisine').map((e) => e.title)).toEqual(['Soupe 100%', 'Tarte aux pommes'])
    expect(store.search('100%').map((e) => e.title)).toEqual(['Soupe 100%'])
    expect(store.search('', 3000).map((e) => e.visitedAt)).toEqual([2000, 1000])
  })

  it('suggests URL prefix matches first, then frequent pages', () => {
    const now = Date.now()
    store.recordVisit('https://www.youtube.com/', 'YouTube', now)
    store.recordVisit('https://example.com/you', 'About you', now)
    store.recordVisit('https://example.com/you', 'About you', now)
    expect(store.suggest('you').map((e) => e.url)).toEqual(['https://www.youtube.com/', 'https://example.com/you'])
    expect(store.suggest('')).toEqual([])
  })

  it('lists recent pages once per host', () => {
    store.recordVisit('https://a.test/1', 'a1', 1)
    store.recordVisit('https://a.test/2', 'a2', 2)
    store.recordVisit('https://b.test/', 'b', 3)
    expect(store.recentByHost().map((e) => e.title)).toEqual(['b', 'a2'])
  })

  it('removes entries and clears by period', () => {
    const now = 100 * 86_400_000
    store.recordVisit('https://old.test/', 'old', now - 2 * 86_400_000)
    store.recordVisit('https://new.test/', 'new', now - 1000)
    store.clear('day', now)
    expect(store.search('').map((e) => e.title)).toEqual(['old'])
    store.remove(store.search('').map((e) => e.id))
    expect(store.search('')).toEqual([])
  })
})
