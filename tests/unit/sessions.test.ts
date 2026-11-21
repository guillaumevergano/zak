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
    expect(store.load()).toEqual([[a, b], [c]])
    store.save([[c]])
    expect(store.load()).toEqual([[c]])
  })
})
