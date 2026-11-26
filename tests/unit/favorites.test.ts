import { beforeEach, describe, expect, it } from 'vitest'
import { openMemoryDatabase } from '../../src/main/store/db'
import { FavoritesStore } from '../../src/main/store/favorites'

const fav = (title: string, folderId: string | null = null) => ({ title, url: `https://${title}.test/`, emoji: '⭐', folderId })

let store: FavoritesStore
const titles = (folderId: string | null): string[] =>
  store
    .favorites()
    .filter((f) => f.folderId === folderId)
    .map((f) => f.title)

beforeEach(() => {
  store = new FavoritesStore(openMemoryDatabase())
})

describe('FavoritesStore', () => {
  it('appends favorites and inserts at an index', () => {
    store.addFavorite(fav('a'))
    store.addFavorite(fav('b'))
    store.addFavorite(fav('c'), 1)
    expect(titles(null)).toEqual(['a', 'c', 'b'])
    expect(store.favorites().map((f) => f.position)).toEqual([0, 1, 2])
  })

  it('moves favorites within and across folders, keeping positions dense', () => {
    const folder = store.addFolder({ name: 'Travail', emoji: '💼' })
    const a = store.addFavorite(fav('a'))
    store.addFavorite(fav('b'))
    store.addFavorite(fav('x', folder))
    store.moveFavorite(a, folder, 0)
    expect(titles(null)).toEqual(['b'])
    expect(titles(folder)).toEqual(['a', 'x'])
    store.moveFavorite(a, folder, 5)
    expect(titles(folder)).toEqual(['x', 'a'])
    expect(store.favorites().find((f) => f.title === 'b')!.position).toBe(0)
  })

  it('keeps the favorites of a deleted folder at the end of the root', () => {
    const folder = store.addFolder({ name: 'À lire', emoji: null })
    store.addFavorite(fav('root'))
    store.addFavorite(fav('in1', folder))
    store.addFavorite(fav('in2', folder))
    store.removeFolder(folder)
    expect(store.folders()).toEqual([])
    expect(titles(null)).toEqual(['root', 'in1', 'in2'])
  })

  it('cuts the root into rows: a new line, moves between lines, empty lines go', () => {
    const rows = (): string[][] => {
      const out: string[][] = []
      for (const f of store.favorites().filter((x) => x.folderId === null)) (out[f.row] ??= []).push(f.title)
      return out
    }
    const a = store.addFavorite(fav('a'))
    const b = store.addFavorite(fav('b'))
    store.addFavorite(fav('c'))
    // Dropped under the last line: a new one.
    store.moveFavorite(b, null, 0, 1)
    expect(rows()).toEqual([['a', 'c'], ['b']])
    // A new favorite goes to the last line.
    store.addFavorite(fav('d'))
    expect(rows()).toEqual([['a', 'c'], ['b', 'd']])
    // Within a line, at an index.
    store.moveFavorite(a, null, 1, 1)
    expect(rows()).toEqual([['c'], ['b', 'a', 'd']])
    // The first line emptied: it goes, the others move up.
    const c = store.favorites().find((f) => f.title === 'c')!.id
    store.moveFavorite(c, null, 0, 1)
    expect(rows()).toEqual([['c', 'b', 'a', 'd']])
    expect(store.favorites().map((f) => f.position)).toEqual([0, 1, 2, 3])
  })

  it('reorders folders', () => {
    const f1 = store.addFolder({ name: '1', emoji: null })
    store.addFolder({ name: '2', emoji: null })
    store.addFolder({ name: '3', emoji: null })
    store.moveFolder(f1, 2)
    expect(store.folders().map((f) => f.name)).toEqual(['2', '3', '1'])
  })

  it('stores favicons for favorites of the same origin', () => {
    store.addFavorite({ title: 'site', url: 'https://site.test/app', emoji: null, folderId: null })
    store.addFavorite({ title: 'other', url: 'https://other.test/', emoji: null, folderId: null })
    expect(store.updateFavicon('https://site.test/app/inbox', 'https://site.test/icon.png')).toBe(true)
    expect(store.updateFavicon('https://site.test/x', 'https://site.test/icon.png')).toBe(false) // unchanged
    expect(store.favorites().map((f) => f.favicon)).toEqual(['https://site.test/icon.png', null])
  })

  it('updates a favorite and moves it when its folder changes', () => {
    const folder = store.addFolder({ name: 'F', emoji: null })
    const id = store.addFavorite(fav('a'))
    store.updateFavorite(id, { title: 'A', url: 'https://a.test/', emoji: '🅰️', folderId: folder })
    expect(store.favorite(id)).toMatchObject({ title: 'A', emoji: '🅰️', folderId: folder, position: 0 })
  })

  it('keeps an own image (raster data: URL only) and the site icon fetched, apart from site visits', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    const id = store.addFavorite({ ...fav('a'), emoji: null, image: png })
    expect(store.favorite(id)).toMatchObject({ image: png, emoji: null })

    // A visit to the site updates its icon, never the own image.
    store.updateFavicon('https://a.test/page', 'https://a.test/favicon.ico')
    expect(store.favorite(id)).toMatchObject({ image: png, favicon: 'https://a.test/favicon.ico' })

    // No SVG (it could carry script), nothing that isn't a data: URL.
    store.updateFavorite(id, { ...fav('a'), image: 'data:image/svg+xml;base64,PHN2Zz4=' })
    expect(store.favorite(id)?.image).toBeNull()
    store.updateFavorite(id, { ...fav('a'), image: 'https://a.test/me.png' })
    expect(store.favorite(id)?.image).toBeNull()

    // The site's icon fetched from the editor replaces the one known; omitted, it stays, and a
    // visit doesn't swap it for the page's small one.
    store.updateFavorite(id, { ...fav('a'), favicon: 'data:image/png;base64,AAAA' })
    expect(store.favorite(id)?.favicon).toBe('data:image/png;base64,AAAA')
    store.updateFavorite(id, fav('a'))
    expect(store.updateFavicon('https://a.test/', 'https://a.test/small.ico')).toBe(false)
    expect(store.favorite(id)?.favicon).toBe('data:image/png;base64,AAAA')
  })
})
