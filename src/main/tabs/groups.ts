import type { TabGroupColor, TabGroupInfo } from '@shared/types'

/** Chrome's group colors, in the order new groups take them. */
export const GROUP_COLORS: TabGroupColor[] = ['blue', 'pink', 'yellow', 'green', 'purple', 'cyan', 'orange', 'red', 'grey']

/**
 * Tab groups (like Chrome's): a name, a color, collapsible. The tabs of a group stay next to each
 * other in the strip, among the unpinned tabs. This module only reorders ids; TabManager applies it.
 */
export interface Grouped {
  id: number
  groupId: string | null
  pinned: boolean
}

/** The color for a new group: the first one no group uses yet. */
export function nextColor(groups: Iterable<TabGroupInfo>): TabGroupColor {
  const used = new Set([...groups].map((g) => g.color))
  return GROUP_COLORS.find((c) => !used.has(c)) ?? GROUP_COLORS[0]!
}

/** Position right after the last tab of `groupId` (or `fallback` when it has none). */
export function endOfGroup(order: number[], tabs: Map<number, Grouped>, groupId: string, fallback: number): number {
  let last = -1
  order.forEach((id, i) => {
    if (tabs.get(id)?.groupId === groupId) last = i
  })
  return last === -1 ? fallback : last + 1
}

/**
 * After a tab lands at `index` (drag & drop, new tab next to its opener): between two tabs of a
 * group it joins that group; outside of its group it leaves it. Returns its group.
 */
export function groupAt(order: number[], tabs: Map<number, Grouped>, index: number, current: string | null): string | null {
  const left = index > 0 ? tabs.get(order[index - 1]!)?.groupId ?? null : null
  const right = index < order.length - 1 ? tabs.get(order[index + 1]!)?.groupId ?? null : null
  if (left !== null && left === right) return left
  if (current !== null && (left === current || right === current)) return current
  return null
}

/** Groups still used by at least one tab. */
export function usedGroups(tabs: Iterable<Grouped>): Set<string> {
  const used = new Set<string>()
  for (const tab of tabs) if (tab.groupId) used.add(tab.groupId)
  return used
}
