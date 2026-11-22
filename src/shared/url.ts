import { ERROR_PAGE_URL, NEWTAB_PAGE_URL } from './ipc'

/** Page opened by "+", Cmd/Ctrl+T and "Tout fermer": zak://newtab. */
export const NEW_TAB_URL = NEWTAB_PAGE_URL

/** Private windows open it dark (`?private=1`, like the chrome UI). */
export const PRIVATE_NEW_TAB_URL = `${NEW_TAB_URL}?private=1`

/** A tab showing nothing yet (about:blank while it starts) or the new tab page: the omnibox stays empty. */
export function isNewTabUrl(url: string): boolean {
  return url === '' || url === 'about:blank' || url === NEW_TAB_URL.slice(0, -1) || url.startsWith(NEW_TAB_URL)
}

/** Search engines offered on zak://settings; the query is appended, URL-encoded. */
export const SEARCH_ENGINES = {
  google: { label: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  brave: { label: 'Brave Search', url: 'https://search.brave.com/search?q=' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
  qwant: { label: 'Qwant', url: 'https://www.qwant.com/?q=' },
  ecosia: { label: 'Ecosia', url: 'https://www.ecosia.org/search?q=' }
} as const
export type SearchEngine = keyof typeof SEARCH_ENGINES

export const searchUrl = (query: string, engine: SearchEngine = 'google'): string =>
  SEARCH_ENGINES[engine].url + encodeURIComponent(query)

/** Does the omnibox text look like an address (rather than a search)? */
export function looksLikeUrl(input: string): boolean {
  return toUrl(input) !== searchUrl(input.trim())
}

/** Schemes typed without `//`. */
const OPAQUE_SCHEMES = /^(about|data|file|mailto|view-source|chrome-extension):/i

/**
 * Omnibox input → URL, like Chrome: a URL or something that looks like a host is loaded,
 * anything else is searched with `engine` (zak://settings, Google by default).
 */
export function toUrl(input: string, engine: SearchEngine = 'google'): string {
  const text = input.trim()
  if (text === '') return NEW_TAB_URL
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || OPAQUE_SCHEMES.test(text)) return text
  if (!/\s/.test(text)) {
    // localhost[:port][/path], IPv4[:port][/path], or host.tld[:port][/path]
    if (/^localhost(:\d+)?(\/.*)?$/i.test(text)) return `http://${text}`
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(text)) return `http://${text}`
    if (/^[^/?#:]+\.[a-z]{2,}\.?(:\d+)?([/?#].*)?$/i.test(text)) return `https://${text}`
  }
  return searchUrl(text, engine)
}

/** zak://error for a page that failed to load (CLAUDE.md §6.7). */
export function errorPageUrl(failedUrl: string, code: number, description: string, threat?: 'phishing' | 'malware'): string {
  const params = new URLSearchParams({ url: failedUrl, code: String(code), desc: description })
  if (threat) params.set('threat', threat)
  return `${ERROR_PAGE_URL}?${params.toString()}`
}

/** The URL an error page stands for (shown in the omnibox, loaded again by Reload), or null. */
export function failedUrlOf(url: string): string | null {
  if (!url.startsWith(ERROR_PAGE_URL)) return null
  return new URL(url).searchParams.get('url')
}
