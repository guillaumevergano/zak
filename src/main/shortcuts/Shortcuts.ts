import type { WebContents } from 'electron'
import type { BrowserWindowHandle, WindowManager } from '../windows/WindowManager'

/**
 * Shortcuts the app menu can't own (CLAUDE.md §6.1): Ctrl+Tab / Ctrl+Shift+Tab (and Ctrl+PageDown /
 * PageUp), caught with `before-input-event` on the chrome UI and on every tab.
 * Everything else is a menu accelerator (menu/AppMenu.ts).
 */
export function installShortcuts(windows: WindowManager): void {
  const watch = (wc: WebContents, handle: () => BrowserWindowHandle | undefined): void => {
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !input.control || input.meta || input.alt) return
      const delta =
        input.key === 'Tab' ? (input.shift ? -1 : 1) : input.key === 'PageDown' ? 1 : input.key === 'PageUp' ? -1 : 0
      if (delta === 0) return
      const target = handle()
      if (!target) return
      event.preventDefault()
      target.tabs.activateRelative(delta)
    })
  }

  windows.on('window-created', (handle) => watch(handle.window.webContents, () => handle))
  windows.on('tab-created', (wc) => watch(wc, () => windows.fromTab(wc)))
}
