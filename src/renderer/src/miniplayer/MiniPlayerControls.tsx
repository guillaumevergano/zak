import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { MiniPlayerAction, MiniPlayerState } from '@shared/types'
import { t } from '@shared/i18n'

const api = window.zak

/** How long the buttons stay once the pointer stops moving over the player. */
const IDLE_MS = 2200

/**
 * The buttons of Zak's floating player (`#miniplayer`, CLAUDE.md §6.4), over the video: ⏯ in the
 * middle, back to the tab and close at the top. They show while the pointer moves over it. Drag
 * anywhere else to move the player; double-click to go back to the tab.
 */
export function MiniPlayerControls(): JSX.Element {
  const [state, setState] = useState<MiniPlayerState | null>(null)
  const [shown, setShown] = useState(false)
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  useEffect(() => {
    const read = (): void => void api.invoke('miniplayer:state').then(setState)
    read()
    const timer = setInterval(read, 800)
    return () => clearInterval(timer)
  }, [])

  const wake = (): void => {
    setShown(true)
    if (idle.current) clearTimeout(idle.current)
    idle.current = setTimeout(() => setShown(false), IDLE_MS)
  }
  const act = (action: MiniPlayerAction): void =>
    void api.invoke('miniplayer:action', action).then(() => api.invoke('miniplayer:state').then(setState))

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || e.target !== e.currentTarget) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const { screenX, screenY } = e
    void api.invoke('miniplayer:position').then((position) => {
      if (position) drag.current = { x: screenX, y: screenY, left: position[0], top: position[1] }
    })
  }
  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    wake()
    const start = drag.current
    if (start) api.send('miniplayer:move', { x: start.left + e.screenX - start.x, y: start.top + e.screenY - start.y })
  }

  return (
    <div
      data-testid="miniplayer-controls"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => !drag.current && setShown(false)}
      onDoubleClick={(e) => e.target === e.currentTarget && act('back')}
      className={`fixed inset-0 cursor-grab select-none transition-opacity duration-200 active:cursor-grabbing ${
        shown ? 'opacity-100' : 'opacity-0'
      } bg-[linear-gradient(to_bottom,rgb(0_0_0/0.45),transparent_38%,transparent_62%,rgb(0_0_0/0.35))]`}
    >
      <div className="pointer-events-none absolute inset-x-2 top-2 flex justify-between">
        <PlayerButton label={state?.title ? t('Revenir à l’onglet « {title} »', { title: state.title }) : t('Revenir à l’onglet')} testId="miniplayer-back" onClick={() => act('back')}>
          <svg viewBox="0 0 16 16" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="2" y="3" width="12" height="10" rx="2" />
            <path d="M8.5 10.5 5.5 7.5M5.5 10V7.5H8" />
          </svg>
        </PlayerButton>
        <PlayerButton label={t('Fermer le lecteur')} testId="miniplayer-close" onClick={() => act('close')}>
          <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
        </PlayerButton>
      </div>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <PlayerButton big label={state?.playing ? t('Pause') : t('Lecture')} testId="miniplayer-play" onClick={() => act('toggle')}>
          {state?.playing ? (
            <svg viewBox="0 0 16 16" width={22} height={22} fill="currentColor" aria-hidden>
              <rect x="3.8" y="3" width="3" height="10" rx=".8" />
              <rect x="9.2" y="3" width="3" height="10" rx=".8" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width={22} height={22} fill="currentColor" aria-hidden>
              <path d="M5 3.4v9.2a.6.6 0 0 0 .9.5l7.3-4.6a.6.6 0 0 0 0-1L5.9 2.9a.6.6 0 0 0-.9.5Z" />
            </svg>
          )}
        </PlayerButton>
      </div>
    </div>
  )
}

function PlayerButton(props: { label: string; testId: string; big?: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      data-testid={props.testId}
      onClick={props.onClick}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`pointer-events-auto grid cursor-pointer place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 ${
        props.big ? 'size-14' : 'size-8'
      }`}
    >
      {props.children}
    </button>
  )
}
