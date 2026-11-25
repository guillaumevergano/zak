/// <reference lib="dom" />
/**
 * Page scroll indicator (CLAUDE.md §7): the page's own vertical scrollbar is hidden (user CSS in
 * TabManager) and the chrome UI draws a thin one in the gutter next to the page. This script, run
 * in an isolated world (tabs get no preload, §3), reports the page's scroll position through
 * `console.debug('zakscroll:<nonce>:<top>,<height>,<viewport>')` (DevTools hides debug messages by
 * default), once per frame at most, when it changes. Same nonce scheme as the passwords script.
 */
export const SCROLL_WORLD_ID = 2002

export const SCROLL_PREFIX = 'zakscroll:'

export function scrollScript(nonce: string): string {
  return `(${install.toString()})(${JSON.stringify(nonce)})`
}

/** Scrolls the page to `top` (CSS px), in the same isolated world. */
export function scrollToScript(top: number, smooth: boolean): string {
  const behavior = smooth ? 'smooth' : 'instant'
  return `(document.scrollingElement || document.documentElement).scrollTo({ top: ${Math.max(0, Math.round(top))}, behavior: '${behavior}' })`
}

// ─── Below: page code (no imports, no closures over module scope) ──────────────────────────────

interface State {
  nonce: string
  last: string
  pending: boolean
  schedule: (force?: boolean) => void
}

function install(nonce: string): void {
  const g = globalThis as unknown as { __zakScroll?: State }
  if (g.__zakScroll) {
    g.__zakScroll.nonce = nonce
    g.__zakScroll.schedule(true)
    return
  }
  const state: State = { nonce, last: '', pending: false, schedule: () => {} }
  g.__zakScroll = state

  const measure = (): void => {
    state.pending = false
    const el = document.scrollingElement ?? document.documentElement
    // A page that doesn't scroll (overflow hidden, a modal open…): no indicator.
    const locked = getComputedStyle(el).overflowY === 'hidden' || getComputedStyle(document.body ?? el).overflowY === 'hidden'
    const viewport = Math.round(el.clientHeight)
    const height = locked ? viewport : Math.round(el.scrollHeight)
    const message = `${Math.round(el.scrollTop)},${height},${viewport}`
    if (message === state.last) return
    state.last = message
    console.debug(`zakscroll:${state.nonce}:${message}`)
  }
  state.schedule = (force) => {
    if (force) state.last = ''
    if (state.pending) return
    state.pending = true
    requestAnimationFrame(measure)
  }
  const schedule = (): void => state.schedule()
  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', schedule)
  const observer = new ResizeObserver(schedule)
  observer.observe(document.documentElement)
  if (document.body) observer.observe(document.body)
  schedule()
}
