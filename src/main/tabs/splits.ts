import type { TabSplitInfo } from '@shared/types'
import type { Grouped } from './groups'

/**
 * Split view (CLAUDE.md §6.1): a pair of tabs shown side by side. Its two tabs stay next to each
 * other in the strip, in the same group, never pinned. This module only checks and reorders ids;
 * TabManager applies it.
 */

/** The split holding `id`, if any. */
export function splitOf(splits: Map<string, TabSplitInfo>, id: number): TabSplitInfo | undefined {
  for (const split of splits.values()) if (split.tabs.includes(id)) return split
  return undefined
}

/** The other tab of `id`'s split, or null. */
export function partnerOf(splits: Map<string, TabSplitInfo>, id: number): number | null {
  const split = splitOf(splits, id)
  if (!split) return null
  return split.tabs[0] === id ? split.tabs[1] : split.tabs[0]
}

/**
 * Where a tab inserted at `index` of `order` (which doesn't hold it) really goes: never between
 * the two tabs of a split, but right after them.
 */
export function outsideSplits(order: number[], splits: Map<string, TabSplitInfo>, index: number): number {
  const left = order[index - 1]
  const right = order[index]
  if (left === undefined || right === undefined) return index
  const split = splitOf(splits, left)
  return split && split.tabs.includes(right) ? index + 1 : index
}

/**
 * After the strip changed: drops the splits that no longer hold (a tab closed, pinned, moved away
 * or into another group) and puts each pair's tabs in strip order (a half dragged over the other
 * swaps the sides). Returns the ids of the splits dropped.
 */
export function repairSplits(order: number[], tabs: Map<number, Grouped>, splits: Map<string, TabSplitInfo>): string[] {
  const dropped: string[] = []
  for (const split of splits.values()) {
    const [a, b] = split.tabs.map((id) => tabs.get(id))
    const ia = order.indexOf(split.tabs[0])
    const ib = order.indexOf(split.tabs[1])
    const holds = a && b && !a.pinned && !b.pinned && a.groupId === b.groupId && ia !== -1 && ib !== -1 && Math.abs(ia - ib) === 1
    if (!holds) {
      splits.delete(split.id)
      dropped.push(split.id)
    } else if (ib < ia) split.tabs = [split.tabs[1], split.tabs[0]]
  }
  return dropped
}
