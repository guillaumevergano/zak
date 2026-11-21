import { describe, expect, it } from 'vitest'
import { normalizeExtensionBar, orderExtensions, shownExtensions } from '../../src/shared/extensionBar'

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
const ids = (list: { id: string }[]): string[] => list.map((i) => i.id)

describe('extension bar', () => {
  it('keeps the install order without settings', () => {
    expect(ids(shownExtensions(items, { order: [], hidden: [] }))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('puts the ordered ones first, then the new ones in install order', () => {
    expect(ids(orderExtensions(items, { order: ['c', 'a'], hidden: [] }))).toEqual(['c', 'a', 'b', 'd'])
  })

  it('ignores uninstalled ids and drops the hidden ones', () => {
    expect(ids(shownExtensions(items, { order: ['z', 'd', 'b'], hidden: ['b', 'y'] }))).toEqual(['d', 'a', 'c'])
  })

  it('cleans what was stored', () => {
    expect(normalizeExtensionBar(undefined)).toEqual({ order: [], hidden: [] })
    expect(normalizeExtensionBar({ order: ['a', 'a', 3 as unknown as string, ''], hidden: 'x' as unknown as string[] })).toEqual({
      order: ['a'],
      hidden: []
    })
  })
})
