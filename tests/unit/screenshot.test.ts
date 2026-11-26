import { describe, expect, it } from 'vitest'
import { clampRegion, fullPageClip, MAX_DEVICE_PIXELS, screenshotName } from '../../src/main/tools/screenshot'

describe('screenshot', () => {
  it('names the file after the moment, without characters the Finder refuses', () => {
    expect(screenshotName('Capture', new Date(2026, 10, 6, 9, 5, 3))).toBe('Capture 2026-11-06 09.05.03.png')
  })

  it('takes the whole page, cut where Chromium can no longer draw it', () => {
    expect(fullPageClip({ cssContentSize: { width: 1200.4, height: 3000 } }, 2)).toEqual({ x: 0, y: 0, width: 1201, height: 3000, scale: 1 })
    expect(fullPageClip({ contentSize: { width: 800, height: 100_000 } }, 2).height).toBe(MAX_DEVICE_PIXELS / 2)
  })

  it('keeps a region inside the page, and ignores a click without a drag', () => {
    const page = { width: 800, height: 600 }
    expect(clampRegion({ x: 700.4, y: -10, width: 300, height: 100 }, page)).toEqual({ x: 700, y: 0, width: 100, height: 90 })
    expect(clampRegion({ x: 10, y: 10, width: 2, height: 2 }, page)).toBeNull()
  })
})
