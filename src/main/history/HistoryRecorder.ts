import type { HistoryStore } from '../store/history'
import type { WindowManager } from '../windows/WindowManager'

/**
 * Records the pages visited in normal windows (CLAUDE.md §6.7). Private windows write nothing
 * (§6.3). Single-page apps (YouTube…) count their in-page navigations too.
 */
export function recordHistory(windows: WindowManager, history: HistoryStore): void {
  windows.on('tab-created', (wc, window) => {
    if (windows.fromWindow(window)?.private) return
    wc.on('did-navigate', (_e, url, httpCode) => {
      // Error responses are still visits in Chrome; failed loads never reach did-navigate.
      if (httpCode !== 204) history.recordVisit(url, wc.getTitle())
    })
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) history.recordVisit(url, wc.getTitle())
    })
    wc.on('page-title-updated', (_e, title) => history.setTitle(wc.getURL(), title))
  })
  // Already limited to normal windows by WindowManager.
  windows.on('tab-favicon', (pageUrl, favicon) => history.setFavicon(pageUrl, favicon))
}
