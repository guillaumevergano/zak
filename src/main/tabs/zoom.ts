import type { WebContents } from 'electron'
import type { SitesStore } from '../store/sites'
import type { WindowManager } from '../windows/WindowManager'

/** Chrome's zoom steps. */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

/** Next step from `factor` in `direction` (+1 bigger, -1 smaller), clamped to the ends. */
export function nextZoom(factor: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((step) => step > factor + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]!
  return [...ZOOM_STEPS].reverse().find((step) => step < factor - 0.001) ?? ZOOM_STEPS[0]!
}

const hostOf = (url: string): string | null => {
  try {
    const { protocol, host } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? host : null
  } catch {
    return null
  }
}

/**
 * Cmd/Ctrl + / - / 0 (CLAUDE.md §6.7), remembered per host. Private windows apply the remembered
 * zoom but never save theirs.
 */
export class ZoomController {
  constructor(
    private readonly sites: SitesStore,
    private readonly windows: WindowManager
  ) {
    windows.on('tab-created', (wc) => {
      wc.on('did-navigate', (_e, url) => {
        const host = hostOf(url)
        wc.setZoomFactor(host ? this.sites.zoom(host) : 1)
        this.windows.fromTab(wc)?.tabs.refresh()
      })
    })
  }

  change(wc: WebContents, direction: 1 | -1 | 0): void {
    const factor = direction === 0 ? 1 : nextZoom(wc.getZoomFactor(), direction)
    wc.setZoomFactor(factor)
    const host = hostOf(wc.getURL())
    if (host && !this.windows.isPrivateTab(wc)) this.sites.setZoom(host, factor)
    // Same-host tabs follow in Chromium; refresh every window's badge.
    for (const handle of this.windows.all()) handle.tabs.refresh()
  }
}
