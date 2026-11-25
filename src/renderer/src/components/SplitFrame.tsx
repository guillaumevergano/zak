import { useLayoutEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import { ratioAt, splitRects, SPLIT_GAP } from '@shared/split'
import type { Rect } from '@shared/types'
import { useBrowserStore } from '../store/useBrowserStore'
import { ScrollTrack } from './ScrollTrack'

const api = window.zak

/**
 * Split view (CLAUDE.md §6.1), drawn around the two pages that main lays over the page slot: a ring
 * around the page in use, and the divider between them (drag to share the width, double-click to
 * even it out). Same geometry as main (`splitRects`), so it lines up with the pages.
 */
export function SplitFrame(): JSX.Element {
  const activeId = useBrowserStore((s) => s.activeId)
  const split = useBrowserStore((s) => s.splits.find((x) => activeId !== null && x.tabs.includes(activeId)))
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  /** While the divider is dragged: the ratio shown, ahead of main's state. */
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const pending = useRef<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => setSize({ width: el.clientWidth, height: el.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    measure()
    return () => observer.disconnect()
  }, [])

  const area: Rect = { x: 0, y: 0, ...size }
  const ratio = dragRatio ?? split?.ratio ?? 0.5
  const [left, right] = splitRects(area, ratio)
  const focused = split && activeId === split.tabs[0] ? left : right

  // One IPC per frame at most while dragging.
  const send = (splitId: string, value: number): void => {
    if (pending.current === null) {
      requestAnimationFrame(() => {
        if (pending.current !== null) void api.invoke('tabs:setSplitRatio', splitId, pending.current)
        pending.current = null
      })
    }
    pending.current = value
  }

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      {split && size.width > 0 && (
        <>
          <div
            aria-hidden
            data-testid="split-focus"
            className="absolute rounded-[14px] border-2 border-iris-ring"
            style={{ left: focused.x - 2, top: focused.y - 2, width: focused.width + 4, height: focused.height + 4 }}
          />
          {/* The left page's scroll indicator, in the gap (the right page's is next to the sidebar). */}
          <ScrollTrack
            tabId={split.tabs[0]}
            testId="split-scroll"
            style={{ left: left.x + left.width + 1, top: left.y, width: 4, height: left.height, pointerEvents: 'auto', zIndex: 1 }}
          />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t('Séparation des deux onglets')}
            aria-valuenow={Math.round(ratio * 100)}
            aria-valuemin={20}
            aria-valuemax={80}
            data-testid="split-divider"
            title={t('Glisser pour redimensionner · double-clic pour égaliser')}
            className="group pointer-events-auto absolute grid cursor-col-resize place-items-center"
            style={{ left: left.x + left.width, top: left.y, width: SPLIT_GAP, height: left.height }}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.currentTarget.setPointerCapture(e.pointerId)
              setDragRatio(ratio)
            }}
            onPointerMove={(e) => {
              if (dragRatio === null || !ref.current) return
              const box = ref.current.getBoundingClientRect()
              const next = ratioAt(area, e.clientX - box.left)
              setDragRatio(next)
              send(split.id, next)
            }}
            onPointerUp={(e) => {
              if (dragRatio === null) return
              e.currentTarget.releasePointerCapture(e.pointerId)
              pending.current = null
              // Main answers with its state before the reply: no jump back at release.
              void api.invoke('tabs:setSplitRatio', split.id, dragRatio).finally(() => setDragRatio(null))
            }}
            onDoubleClick={() => void api.invoke('tabs:setSplitRatio', split.id, 0.5)}
          >
            <span
              className={`h-9 w-1 rounded-full transition-colors duration-150 ${
                dragRatio !== null ? 'bg-iris' : 'bg-transparent group-hover:bg-iris/70'
              }`}
            />
          </div>
        </>
      )}
    </div>
  )
}
