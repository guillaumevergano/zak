import { describe, expect, it } from 'vitest'
import { barToolOf, normalizeExtensionBar, orderExtensions, shownExtensions, toolBarId } from '../../src/shared/extensionBar'
import { DEFAULT_TOOLS, enabledTools } from '../../src/shared/tools'

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

  it("gives Zak's tools an id of their own, among the extensions", () => {
    expect(toolBarId('screenshot')).toBe('zak:screenshot')
    expect(barToolOf('zak:translate')).toBe('translate')
    expect(barToolOf('cjpalhdlnbpafiamejdnhcphjbkeiagm')).toBeNull()
    expect(enabledTools(DEFAULT_TOOLS)).toEqual(['screenshot', 'translate'])
    expect(enabledTools({ ...DEFAULT_TOOLS, screenshot: { enabled: false } })).toEqual(['translate'])
  })
})
