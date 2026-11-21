import type { FavoriteInfo, Rect } from '@shared/types'

const trimSlash = (url: string): string => url.replace(/\/+$/, '')

/**
 * The favorite the page belongs to, for the highlighted tile: same origin, and the favorite's
 * URL is a prefix of the page's (the longest one wins). `https://mail.google.com/` matches the
 * whole inbox.
 */
export function matchFavorite(pageUrl: string, favorites: FavoriteInfo[]): FavoriteInfo | undefined {
  let page: URL
  try {
    page = new URL(pageUrl)
  } catch {
    return undefined
  }
  let best: FavoriteInfo | undefined
  for (const favorite of favorites) {
    let url: URL
    try {
      url = new URL(favorite.url)
    } catch {
      continue
    }
    if (url.origin !== page.origin) continue
    if (!trimSlash(page.href).startsWith(trimSlash(url.href))) continue
    if (!best || favorite.url.length > best.url.length) best = favorite
  }
  return best
}

/** The favorite saved for exactly this page (★ filled in the omnibox). */
export function exactFavorite(pageUrl: string, favorites: FavoriteInfo[]): FavoriteInfo | undefined {
  if (!pageUrl) return undefined
  const page = trimSlash(pageUrl)
  return favorites.find((f) => trimSlash(f.url) === page)
}

export function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}
