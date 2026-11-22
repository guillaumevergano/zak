import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { TabId } from '@shared/types'
import { useBrowserStore } from '../store/useBrowserStore'

const api = window.zak
const MIN_THUMB = 28

/**
 * The thin scroll indicator of a page (CLAUDE.md §7), drawn next to it: the page's own scrollbar is
 * hidden. A few pixels of mauve that follow the scroll; wider on hover; drag it, or click the
 * track to jump there.
 */
export function ScrollTrack({ tabId, style, testId }: { tabId: TabId | null; style: CSSProperties; testId: string }): JSX.Element {
  const scroll = useBrowserStore((s) => (tabId === null ? undefined : s.scrolls[tabId]))
  const ref = useRef<HTMLDivElement>(null)
  const [track, setTrack] = useState(0)
  const [drag, setDrag] = useState<{ y: number; from: number; top: number } | null>(null)
  const pending = useRef<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => setTrack(el.clientHeight))
    observer.observe(el)
    setTrack(el.clientHeight)
    return () => observer.disconnect()
  }, [])

  const scrollable = tabId !== null && scroll !== undefined && scroll.height > scroll.viewport + 1 && track > 0
  const range = scroll ? scroll.height - scroll.viewport : 0
  const thumb = scroll ? Math.max(MIN_THUMB, Math.round((track * scroll.viewport) / Math.max(scroll.height, 1))) : 0
  const top = drag?.top ?? scroll?.top ?? 0
  const y = range > 0 ? Math.round((track - thumb) * Math.min(1, Math.max(0, top / range))) : 0

  // One IPC per frame at most while dragging.
  const send = (value: number): void => {
    if (pending.current === null) {
      requestAnimationFrame(() => {
        if (pending.current !== null && tabId !== null) void api.invoke('tabs:scrollTo', tabId, pending.current, false)
        pending.current = null
      })
    }
    pending.current = value
  }

  return (
    <div
      ref={ref}
      data-testid={testId}
      style={style}
      className={`group/track absolute ${scrollable ? 'cursor-default' : 'pointer-events-none'}`}
      onPointerDown={(e) => {
        // Click on the track: the page goes there (the click point at the middle of the screen).
        if (!scrollable || e.button !== 0 || !scroll || tabId === null) return
        const box = e.currentTarget.getBoundingClientRect()
        const at = ((e.clientY - box.top) / track) * scroll.height - scroll.viewport / 2
        void api.invoke('tabs:scrollTo', tabId, Math.min(Math.max(at, 0), range), true)
      }}
    >
      {scrollable && (
        <div
          data-testid={`${testId}-thumb`}
          className="absolute inset-x-0 flex justify-center"
          style={{ height: thumb, transform: `translateY(${y}px)` }}
          onPointerDown={(e) => {
            if (e.button !== 0 || !scroll) return
            e.stopPropagation()
            e.currentTarget.setPointerCapture(e.pointerId)
            setDrag({ y: e.clientY, from: scroll.top, top: scroll.top })
          }}
          onPointerMove={(e) => {
            if (!drag) return
            const next = Math.min(Math.max(drag.from + ((e.clientY - drag.y) * range) / Math.max(track - thumb, 1), 0), range)
            setDrag({ ...drag, top: next })
            send(next)
          }}
          onPointerUp={(e) => {
            if (!drag || tabId === null) return
            e.currentTarget.releasePointerCapture(e.pointerId)
            pending.current = null
            void api.invoke('tabs:scrollTo', tabId, drag.top, false).finally(() => setDrag(null))
          }}
        >
          <span
            className={`h-full rounded-full transition-[width,background-color] ${
              drag ? 'w-1.5 bg-iris' : 'w-1 bg-iris/55 group-hover/track:w-1.5 group-hover/track:bg-iris/85'
            }`}
          />
        </div>
      )}
    </div>
  )
}
