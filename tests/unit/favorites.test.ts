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
})
