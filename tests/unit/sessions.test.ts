import { describe, expect, it } from 'vitest'
import { openMemoryDatabase } from '../../src/main/store/db'
import { SessionStore } from '../../src/main/store/sessions'

describe('SessionStore', () => {
  it('saves and reloads windows with their tabs in order', () => {
    const store = new SessionStore(openMemoryDatabase())
    const a = { url: 'https://a.test/', title: 'A', pinned: true, active: false }
    const b = { url: 'https://b.test/', title: 'B', pinned: false, active: true }
    const c = { url: 'https://c.test/', title: 'C', pinned: false, active: true }
    store.save([[a, b], [c]])
    expect(store.load()).toEqual([[{ ...a, group: null, split: null }, { ...b, group: null, split: null }], [{ ...c, group: null, split: null }]])
    store.save([[c]])
    expect(store.load()).toEqual([[{ ...c, group: null, split: null }]])
  })

  it('keeps tab groups', () => {
    const store = new SessionStore(openMemoryDatabase())
    const group = { id: 'g1', name: 'Voyage', color: 'green' as const, collapsed: true }
    const tab = (url: string) => ({ url, title: url, pinned: false, active: false, group })
    store.save([[tab('https://a.test/'), tab('https://b.test/')]])
    const [[first, second]] = store.load() as [[ReturnType<typeof tab>, ReturnType<typeof tab>]]
    expect(first.group).toEqual(group)
    expect(second.group).toBe(first.group) // one object per group
  })

  it('keeps split views', () => {
    const store = new SessionStore(openMemoryDatabase())
    const split = { id: 's1', ratio: 0.4 }
    const tab = (url: string) => ({ url, title: url, pinned: false, active: false, split })
    store.save([[tab('https://a.test/'), tab('https://b.test/'), { url: 'https://c.test/', title: 'C', pinned: false, active: true }]])
    const [[a, b, c]] = store.load() as [[ReturnType<typeof tab>, ReturnType<typeof tab>, ReturnType<typeof tab>]]
    expect(a.split).toEqual(split)
    expect(b.split).toEqual(split)
    expect(c.split).toBeNull()
  })
})
