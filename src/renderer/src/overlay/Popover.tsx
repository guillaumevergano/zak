import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Rect } from '@shared/types'
import { t } from '@shared/i18n'

const WIDTH = 320
const MARGIN = 12

/** A light glass card placed under its anchor (or above when there's no room), kept on screen. */
export function Popover({ anchor, children }: { anchor: Rect; children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const place = (): void => {
      const el = ref.current
      if (!el) return
      const height = el.offsetHeight
      const left = Math.min(Math.max(anchor.x + anchor.width / 2 - WIDTH / 2, MARGIN), window.innerWidth - WIDTH - MARGIN)
      const below = anchor.y + anchor.height + 8
      const top =
        below + height <= window.innerHeight - MARGIN
          ? below
          : Math.max(MARGIN, Math.min(anchor.y - height - 8, window.innerHeight - height - MARGIN))
      setPos({ left, top })
    }
    place()
    const observer = new ResizeObserver(place)
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [anchor])

  return (
    <div
      ref={ref}
      role="dialog"
      style={{ width: WIDTH, left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
      className="fixed flex flex-col gap-3 rounded-2xl border border-title/12 bg-white/97 p-4 text-ink shadow-[0_18px_50px_rgb(59_35_112/0.28)]"
    >
      {children}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-bold tracking-[1px] text-sub uppercase">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'h-9 rounded-xl border-[1.5px] border-track bg-white px-3 text-[14px] text-ink outline-none focus:border-pink focus:shadow-[0_0_0_3px_rgb(255_0_130/0.15)]'

export function Actions(props: { onCancel: () => void; onDelete?: () => void; submitLabel: string }): JSX.Element {
  return (
    <div className="mt-1 flex items-center gap-2">
      {props.onDelete && (
        <button type="button" onClick={props.onDelete} className="h-9 rounded-xl px-3 font-semibold text-[#A3004F] hover:bg-pink/8">
          {t('Supprimer')}
        </button>
      )}
      <span className="flex-1" />
      <button type="button" onClick={props.onCancel} className="h-9 rounded-xl px-3 font-semibold text-sub hover:bg-violet/8">
        {t('Annuler')}
      </button>
      <button
        type="submit"
        className="h-9 rounded-xl bg-pink-button px-4 font-bold text-white shadow-[0_6px_16px_rgb(255_0_130/0.3)] hover:bg-pink"
      >
        {props.submitLabel}
      </button>
    </div>
  )
}
