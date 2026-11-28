import type { ExtensionBarSettings } from './types'
import type { ToolAction } from './tools'

/**
 * Zak's tools share the bar with Chrome extensions (CLAUDE.md §6.8): same order, same « hidden »
 * list, under an id no Chrome extension can have (theirs are 32 letters a–p).
 */
export const TOOL_BAR_PREFIX = 'zak:'
const BAR_ACTIONS: readonly ToolAction[] = ['screenshot', 'record', 'translate', 'colors', 'brand']
export const toolBarId = (action: ToolAction): string => `${TOOL_BAR_PREFIX}${action}`
export const barToolOf = (id: string): ToolAction | null => {
  const action = id.startsWith(TOOL_BAR_PREFIX) ? id.slice(TOOL_BAR_PREFIX.length) : ''
  return (BAR_ACTIONS as readonly string[]).includes(action) ? (action as ToolAction) : null
}

export const DEFAULT_EXTENSION_BAR: ExtensionBarSettings = { order: [], hidden: [] }

/** Items in the chosen order: the ones listed in `order` first, then the others as given. */
export function orderExtensions<T extends { id: string }>(items: T[], bar: ExtensionBarSettings): T[] {
  const rank = (id: string): number => {
    const i = bar.order.indexOf(id)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.id) - rank(b.item.id) || a.index - b.index)
    .map(({ item }) => item)
}

/** What the sidebar shows: ordered, without the hidden ones. */
export function shownExtensions<T extends { id: string }>(items: T[], bar: ExtensionBarSettings): T[] {
  return orderExtensions(items, bar).filter((item) => !bar.hidden.includes(item.id))
}

/** Drops duplicates and anything that is not a string. */
export function normalizeExtensionBar(raw: Partial<ExtensionBarSettings> | undefined): ExtensionBarSettings {
  const ids = (value: unknown): string[] =>
    Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v !== ''))] : []
  return { order: ids(raw?.order), hidden: ids(raw?.hidden) }
}
