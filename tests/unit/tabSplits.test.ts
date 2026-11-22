import { describe, expect, it } from 'vitest'
import type { TabSplitInfo } from '../../src/shared/types'
import type { Grouped } from '../../src/main/tabs/groups'
import { outsideSplits, partnerOf, repairSplits } from '../../src/main/tabs/splits'
import { ratioAt, splitRects, SPLIT_GAP, SPLIT_INSET } from '../../src/shared/split'

const strip = (n: number, patch: Partial<Record<number, Partial<Grouped>>> = {}) => {
  const tabs = new Map<number, Grouped>()
  for (let id = 1; id <= n; id++) tabs.set(id, { id, groupId: null, pinned: false, ...patch[id] })
  return { order: [...tabs.keys()], tabs }
}
const splitsOf = (...pairs: [number, number][]) =>
  new Map<string, TabSplitInfo>(pairs.map(([a, b], i) => [`s${i}`, { id: `s${i}`, tabs: [a, b], ratio: 0.5 }]))

describe('split view', () => {
  it('finds the other tab of a split', () => {
    const splits = splitsOf([2, 3])
    expect(partnerOf(splits, 2)).toBe(3)
    expect(partnerOf(splits, 3)).toBe(2)
    expect(partnerOf(splits, 1)).toBeNull()
  })

  it('never inserts a tab between the two tabs of a split', () => {
    const { order } = strip(4)
    const splits = splitsOf([2, 3])
    expect(outsideSplits(order, splits, 2)).toBe(3)
    expect(outsideSplits(order, splits, 1)).toBe(1)
    expect(outsideSplits(order, splits, 3)).toBe(3)
  })

  it('keeps a split whose tabs are still side by side, in strip order', () => {
    const { order, tabs } = strip(4)
    const splits = splitsOf([3, 2]) // the left one was dragged past the right one
    expect(repairSplits(order, tabs, splits)).toEqual([])
    expect(splits.get('s0')!.tabs).toEqual([2, 3])
  })

  it('drops a split when a tab is closed, moved away, pinned or in another group', () => {
    let { order, tabs } = strip(4)
    expect(repairSplits([1, 2, 4], tabs, splitsOf([2, 3]))).toEqual(['s0']) // 3 closed
    expect(repairSplits([2, 1, 3, 4], tabs, splitsOf([2, 3]))).toEqual(['s0']) // 2 dragged away
    ;({ order, tabs } = strip(4, { 2: { pinned: true } }))
    expect(repairSplits(order, tabs, splitsOf([2, 3]))).toEqual(['s0'])
    ;({ order, tabs } = strip(4, { 3: { groupId: 'g' } }))
    expect(repairSplits(order, tabs, splitsOf([2, 3]))).toEqual(['s0'])
  })

  it('lays out two pages with a gap, and finds the ratio back from the divider', () => {
    const area = { x: 100, y: 50, width: 1000 + 2 * SPLIT_INSET + SPLIT_GAP, height: 600 }
    const [left, right] = splitRects(area, 0.3)
    expect(left).toEqual({ x: 100 + SPLIT_INSET, y: 50 + SPLIT_INSET, width: 300, height: 600 - 2 * SPLIT_INSET })
    expect(right.x).toBe(left.x + 300 + SPLIT_GAP)
    expect(right.width).toBe(700)
    expect(ratioAt(area, left.x + left.width + SPLIT_GAP / 2)).toBeCloseTo(0.3)
    expect(splitRects(area, 0.95)[0].width).toBe(800) // clamped to 80 %
  })
})
