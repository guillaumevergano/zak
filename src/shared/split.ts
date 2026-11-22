import type { Rect } from './types'

/** Space between the two pages of a split view; the divider sits in it. */
export const SPLIT_GAP = 10
/** Margin around the pages of a split view, where the ring of the focused page is drawn. */
export const SPLIT_INSET = 3
export const SPLIT_MIN_RATIO = 0.2
export const SPLIT_MAX_RATIO = 0.8

export const clampRatio = (ratio: number): number =>
  Number.isFinite(ratio) ? Math.min(Math.max(ratio, SPLIT_MIN_RATIO), SPLIT_MAX_RATIO) : 0.5

/**
 * The two pages of a split view in `area` (the page slot): main places the views with it, the
 * chrome UI draws the focus ring and the divider with it, so both agree to the pixel.
 */
export function splitRects(area: Rect, ratio: number): [Rect, Rect] {
  const x = area.x + SPLIT_INSET
  const y = area.y + SPLIT_INSET
  const height = Math.max(0, area.height - 2 * SPLIT_INSET)
  const usable = Math.max(0, area.width - 2 * SPLIT_INSET - SPLIT_GAP)
  const left = Math.round(usable * clampRatio(ratio))
  return [
    { x, y, width: left, height },
    { x: x + left + SPLIT_GAP, y, width: usable - left, height }
  ]
}

/** Inverse of splitRects: the ratio that puts the divider's middle at `x` (same coordinates as `area`). */
export function ratioAt(area: Rect, x: number): number {
  const usable = area.width - 2 * SPLIT_INSET - SPLIT_GAP
  if (usable <= 0) return 0.5
  return clampRatio((x - area.x - SPLIT_INSET - SPLIT_GAP / 2) / usable)
}
