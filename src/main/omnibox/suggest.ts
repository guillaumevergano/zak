import type { OmniboxSuggestion } from '@shared/types'
import { looksLikeUrl, searchUrl, toUrl, type SearchEngine } from '@shared/url'
import type { FavoritesStore } from '../store/favorites'
import type { HistoryStore } from '../store/history'

const MAX = 7

/**
 * The omnibox dropdown (CLAUDE.md §6.7): first what Enter does (open the address or search),
 * then matching favorites and history entries, without duplicates.
 */
export function suggest(
  text: string,
  engine: SearchEngine,
  favorites: FavoritesStore,
  history: HistoryStore
): OmniboxSuggestion[] {
  const query = text.trim()
  if (query === '') return []
  const items: OmniboxSuggestion[] = []
  const seen = new Set<string>()
  const add = (item: OmniboxSuggestion): void => {
    if (seen.has(item.url) || items.length >= MAX) return
    seen.add(item.url)
    items.push(item)
  }

  // An address first when the text looks like one; a search is always offered.
  if (looksLikeUrl(query)) add({ kind: 'url', title: query, url: toUrl(query, engine), favicon: null, emoji: null })
  add({ kind: 'search', title: query, url: searchUrl(query, engine), favicon: null, emoji: null })

  const lower = query.toLowerCase()
  for (const f of favorites.favorites()) {
    if (f.title.toLowerCase().includes(lower) || f.url.toLowerCase().includes(lower)) {
      add({ kind: 'favorite', title: f.title, url: f.url, favicon: f.favicon, emoji: f.emoji })
    }
    if (items.length >= 4) break
  }
  for (const h of history.suggest(query, MAX)) add({ kind: 'history', title: h.title, url: h.url, favicon: h.favicon, emoji: null })
  return items
}
