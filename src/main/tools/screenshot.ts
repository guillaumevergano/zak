/** Pure parts of the screenshot tool (CLAUDE.md §6.8), kept apart from Electron for the unit tests. */

/** Chromium can't draw a bitmap taller (or wider) than this, in device pixels. */
export const MAX_DEVICE_PIXELS = 16384

/** `Capture 2026-11-26 14.32.05.png`: sorted by date in a folder, no `:` (forbidden in Finder names). */
export function screenshotName(prefix: string, date: Date, extension = 'png'): string {
  const two = (n: number): string => String(n).padStart(2, '0')
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
  const time = `${two(date.getHours())}.${two(date.getMinutes())}.${two(date.getSeconds())}`
  return `${prefix} ${day} ${time}.${extension}`
}

/** What CDP's Page.getLayoutMetrics answers (the parts used here). */
export interface LayoutMetrics {
  cssContentSize?: { width: number; height: number }
  contentSize?: { width: number; height: number }
}

/**
 * The whole page's clip for Page.captureScreenshot, in CSS pixels: as long as Chromium can draw it
 * at this pixel ratio (a very long page is cut there).
 */
export function fullPageClip(metrics: LayoutMetrics, ratio: number): { x: number; y: number; width: number; height: number; scale: number } {
  const size = metrics.cssContentSize ?? metrics.contentSize ?? { width: 0, height: 0 }
  const max = Math.floor(MAX_DEVICE_PIXELS / Math.max(ratio, 1))
  return { x: 0, y: 0, width: Math.min(Math.ceil(size.width), max), height: Math.min(Math.ceil(size.height), max), scale: 1 }
}

/** A region drawn on the page, kept inside it and in whole pixels; null when too small to mean anything. */
export function clampRegion(
  rect: { x: number; y: number; width: number; height: number },
  page: { width: number; height: number }
): { x: number; y: number; width: number; height: number } | null {
  const x = Math.round(Math.max(0, rect.x))
  const y = Math.round(Math.max(0, rect.y))
  const width = Math.round(Math.min(page.width, rect.x + rect.width)) - x
  const height = Math.round(Math.min(page.height, rect.y + rect.height)) - y
  return width >= 4 && height >= 4 ? { x, y, width, height } : null
}
