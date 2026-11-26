import { app, type BrowserWindow } from 'electron'

/**
 * e2e tests (ZAK_E2E) launch dozens of Zaks in a row: shown normally, each would come to the
 * front and take the keyboard away from whoever works on the computer meanwhile. In quiet mode
 * Zak has no Dock icon (macOS: an "accessory" app, never activated) and its windows open without
 * taking the focus; pages still render and get focus inside the window. ZAK_E2E_FOREGROUND=1
 * brings the old behavior back (to watch a test run).
 */
export const quiet = process.env['ZAK_E2E'] === '1' && process.env['ZAK_E2E_FOREGROUND'] !== '1'

/** Before app ready: keep the app out of the Dock and the app switcher. */
export function enterQuietMode(): void {
  if (quiet && process.platform === 'darwin') app.setActivationPolicy('accessory')
}

/** Shows a window (and brings it forward), unless in quiet mode: then shown without the focus. */
export function present(window: BrowserWindow, focus = false): void {
  if (quiet) {
    if (!window.isVisible()) window.showInactive()
    return
  }
  window.show()
  if (focus) window.focus()
}
