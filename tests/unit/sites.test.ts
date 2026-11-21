import { describe, expect, it } from 'vitest'
import { openMemoryDatabase } from '../../src/main/store/db'
import { SitesStore } from '../../src/main/store/sites'

describe('SitesStore', () => {
  it('remembers permission decisions per origin', () => {
    const store = new SitesStore(openMemoryDatabase())
    expect(store.permission('https://a.test', 'camera')).toBeUndefined()
    store.setPermission('https://a.test', 'camera', true)
    store.setPermission('https://a.test', 'notifications', false)
    store.setPermission('https://a.test', 'camera', false)
    expect(store.permission('https://a.test', 'camera')).toBe(false)
    expect(store.permissions()).toHaveLength(2)
    store.removePermission('https://a.test', 'camera')
    expect(store.permissions()).toEqual([{ origin: 'https://a.test', permission: 'notifications', granted: false }])
  })

  it('remembers zoom per host, 1 meaning default', () => {
    const store = new SitesStore(openMemoryDatabase())
    expect(store.zoom('a.test')).toBe(1)
    store.setZoom('a.test', 1.5)
    expect(store.zoom('a.test')).toBe(1.5)
    store.setZoom('a.test', 1)
    expect(store.zoom('a.test')).toBe(1)
  })
})
