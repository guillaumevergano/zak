import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Rect } from '@shared/types'
import type { ScreenshotMode } from '@shared/tools'
import { t } from '@shared/i18n'

const api = window.zak

type Point = { x: number; y: number }

const rectOf = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y)
})

/**
 * The capture mode (CLAUDE.md §6.8): the view covers the page exactly, which dims. Drag to take a
 * region, or pick the visible part or the whole page; Esc cancels.
 */
export function ScreenshotPicker(): JSX.Element {
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)
  const taking = useRef(false)

  const take = (mode: ScreenshotMode, rect?: Rect): void => {
    if (taking.current) return
    taking.current = true
    void api.invoke('tools:screenshot', mode, rect)
  }
  const cancel = (): void => void api.invoke('overlay:close')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel()
      else if (e.key === 'Enter') take('visible')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const point = (e: ReactPointerEvent): Point => ({ x: e.clientX, y: e.clientY })
  const region = start && end ? rectOf(start, end) : null
  const drawn = region !== null && region.width >= 4 && region.height >= 4

  return (
    <div
      data-testid="screenshot-picker"
      className="fixed inset-0 cursor-crosshair touch-none select-none"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setStart(point(e))
        setEnd(point(e))
      }}
      onPointerMove={(e) => start && setEnd(point(e))}
      onPointerUp={() => {
        if (drawn) take('region', region)
        else {
          setStart(null)
          setEnd(null)
        }
      }}
    >
      {drawn ? (
        // The region stays clear; the rest of the page dims around it.
        <div
          className="pointer-events-none absolute rounded-[2px] border border-white shadow-[0_0_0_100vmax_rgb(20_10_20/0.38)]"
          style={{ left: region.x, top: region.y, width: region.width, height: region.height }}
        >
          <span className="absolute right-0 -bottom-7 rounded-md bg-[#2A1A26]/85 px-1.5 py-0.5 font-mono text-[11px] text-white">
            {Math.round(region.width)} × {Math.round(region.height)}
          </span>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-[rgb(20_10_20/0.28)]" />
      )}

      {!start && (
        <div
          role="toolbar"
          aria-label={t('Capture d’écran')}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-4 left-1/2 flex -translate-x-1/2 cursor-default items-center gap-1.5 rounded-[14px] border border-title/12 bg-white p-1.5 pl-3.5 text-[13px] text-ink shadow-[0_2px_10px_rgb(0_0_0/0.2)]"
        >
          <span className="mr-1 whitespace-nowrap text-sub">{t('Tracez une zone, ou :')}</span>
          <ToolbarButton onClick={() => take('visible')}>{t('Page visible')}</ToolbarButton>
          <ToolbarButton onClick={() => take('full')}>{t('Page entière')}</ToolbarButton>
          <ToolbarButton onClick={cancel}>{t('Annuler')}</ToolbarButton>
        </div>
      )}
    </div>
  )
}

function ToolbarButton(props: { onClick: () => void; children: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="h-8 whitespace-nowrap rounded-[10px] border border-track bg-white px-3 text-[12.5px] font-semibold text-title hover:bg-violet/8"
    >
      {props.children}
    </button>
  )
}
