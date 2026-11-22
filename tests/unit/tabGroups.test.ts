import { describe, expect, it } from 'vitest'
import { endOfGroup, groupAt, nextColor, usedGroups, type Grouped } from '../../src/main/tabs/groups'

const strip = (spec: (string | null)[]): { order: number[]; tabs: Map<number, Grouped> } => {
  const tabs = new Map<number, Grouped>()
  spec.forEach((groupId, i) => tabs.set(i + 1, { id: i + 1, groupId, pinned: false }))
  return { order: spec.map((_, i) => i + 1), tabs }
}

describe('tab groups', () => {
  it('gives each new group the next unused color', () => {
    expect(nextColor([])).toBe('blue')
    expect(nextColor([{ id: 'a', name: '', color: 'blue', collapsed: false }])).toBe('pink')
  })

  it('finds where a group ends', () => {
    const { order, tabs } = strip([null, 'g', 'g', null])
    expect(endOfGroup(order, tabs, 'g', 99)).toBe(3)
    expect(endOfGroup(order, tabs, 'other', 99)).toBe(99)
  })

  it('joins the group a tab is dropped into, and leaves its own when dropped away', () => {
    // [a, g, X, g, b]: X between two tabs of g joins it.
    let { order, tabs } = strip([null, 'g', null, 'g', null])
    expect(groupAt(order, tabs, 2, null)).toBe('g')
    // X (in g) dropped at the very end, after b: leaves g.
    ;({ order, tabs } = strip([null, 'g', 'g', null, 'g']))
    expect(groupAt(order, tabs, 4, 'g')).toBeNull()
    // X (in g) at the edge of its group stays in it.
    ;({ order, tabs } = strip([null, 'g', 'g', null]))
    expect(groupAt(order, tabs, 2, 'g')).toBe('g')
    // An ungrouped tab next to a group (not inside) stays out.
    ;({ order, tabs } = strip(['g', null, null]))
    expect(groupAt(order, tabs, 1, null)).toBeNull()
  })

  it('lists the groups still used', () => {
    expect([...usedGroups(strip(['a', null, 'b', 'a']).tabs.values())].sort()).toEqual(['a', 'b'])
  })
})
