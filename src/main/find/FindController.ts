import type { TabId } from '@shared/types'
import type { BrowserWindowHandle, WindowManager } from '../windows/WindowManager'

const BAR_WIDTH = 400
const BAR_HEIGHT = 58
const MARGIN = 12

/**
 * Find in page (CLAUDE.md §6.7): Cmd/Ctrl+F opens a bar at the top right of the page, in the
 * overlay; results come from `found-in-page`. Cmd/Ctrl+G / Shift+G go to the next / previous match.
 */
export class FindController {
  /** Last searched text per window, offered again when the bar reopens. */
  private lastText = new WeakMap<BrowserWindowHandle, string>()

  constructor(private readonly windows: WindowManager) {
    windows.on('tab-created', (wc) => {
      wc.on('found-in-page', (_e, result) => {
        const handle = windows.fromTab(wc)
        if (!handle || handle.overlay.showing()?.kind !== 'find') return
        handle.overlay.send('find:result', { activeMatch: result.activeMatchOrdinal, matches: result.matches })
      })
    })
    windows.on('overlay-hidden', (handle, request) => {
      if (request.kind === 'find') handle.tabs.get(request.tabId)?.stopFindInPage('keepSelection')
    })
  }

  open(handle: BrowserWindowHandle): void {
    const tabId = handle.tabs.getActiveId()
    if (tabId === null) return
    const { width } = handle.window.getContentBounds()
    const { top, right } = handle.tabs.getInsets()
    void handle.overlay.open({
      kind: 'find',
      tabId,
      text: this.lastText.get(handle) ?? '',
      frame: { x: width - right - BAR_WIDTH - MARGIN, y: top + MARGIN / 2, width: BAR_WIDTH, height: BAR_HEIGHT }
    })
  }

  query(handle: BrowserWindowHandle, tabId: TabId, text: string, forward: boolean, findNext: boolean): void {
    const wc = handle.tabs.get(tabId)
    if (!wc) return
    this.lastText.set(handle, text)
    if (text === '') {
      wc.stopFindInPage('clearSelection')
      handle.overlay.send('find:result', { activeMatch: 0, matches: 0 })
      return
    }
    wc.findInPage(text, { forward, findNext })
  }

  /** Cmd/Ctrl+G: next match of the open bar, or reopen it. */
  next(handle: BrowserWindowHandle, forward: boolean): void {
    const showing = handle.overlay.showing()
    const text = this.lastText.get(handle)
    if (showing?.kind === 'find' && text) this.query(handle, showing.tabId, text, forward, true)
    else this.open(handle)
  }
}
