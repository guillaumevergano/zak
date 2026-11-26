import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { MediaAction, MediaState } from '@shared/media'
import { t } from '@shared/i18n'
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon, SpeakerIcon } from './Icons'

const api = window.zak

/**
 * What plays in the window (CLAUDE.md §6.2), at the bottom of the sidebar: cover art and title
 * (a click shows the tab), ⏮ ⏯ ⏭ and the volume. Folded sidebar: play / pause only.
 */
export function MediaCard({ collapsed }: { collapsed: boolean }): JSX.Element | null {
  const [media, setMedia] = useState<MediaState | null>(null)
  // While the slider is held, the page's volume (read every 1.5 s) must not pull it back.
  const [volume, setVolume] = useState<number | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    void api.invoke('media:getState').then(setMedia)
    return api.on('media:state', setMedia)
  }, [])
  useEffect(() => {
    if (!dragging.current) setVolume(media?.volume ?? null)
  }, [media?.volume])

  if (!media) return null
  const act = (action: MediaAction): void => void api.invoke('media:action', action)
  const toggle = (
    <ControlButton
      label={media.playing ? t('Pause') : t('Lecture')}
      testId="media-play"
      big
      onClick={() => act(media.playing ? 'pause' : 'play')}
    >
      {media.playing ? <PauseIcon /> : <PlayIcon />}
    </ControlButton>
  )

  if (collapsed) {
    return (
      <div data-testid="media-card" title={media.title} className="flex justify-center pb-1">
        {toggle}
      </div>
    )
  }

  const shownVolume = media.muted ? 0 : (volume ?? 1)
  return (
    <section data-testid="media-card" aria-label={t('En cours de lecture')} className="mx-3 mb-1 flex flex-col gap-2 rounded-[14px] bg-frame-2 p-2.5">
      <button
        type="button"
        onClick={() => act('show')}
        title={t('Afficher l’onglet')}
        className="flex min-w-0 items-center gap-2.5 rounded-[9px] text-left hover:bg-frame-3/60"
      >
        {media.artwork ? (
          <img src={media.artwork} alt="" className="size-10 shrink-0 rounded-[8px] bg-frame-3 object-cover" />
        ) : (
          <span className="size-10 shrink-0 rounded-[8px] bg-frame-3" aria-hidden />
        )}
        <span className="flex min-w-0 flex-col">
          <span data-testid="media-title" className="truncate text-[13px] font-semibold text-frame-text">
            {media.title}
          </span>
          <span className="truncate text-[11.5px] text-frame-sub">{media.subtitle}</span>
        </span>
      </button>
      <div className="flex items-center gap-1">
        {media.canPrevious && (
          <ControlButton label={t('Précédent')} testId="media-previous" onClick={() => act('previoustrack')}>
            <PreviousIcon />
          </ControlButton>
        )}
        {toggle}
        {media.canNext && (
          <ControlButton label={t('Suivant')} testId="media-next" onClick={() => act('nexttrack')}>
            <NextIcon />
          </ControlButton>
        )}
        <span className="ml-auto flex min-w-0 items-center gap-1.5">
          <ControlButton
            label={media.muted ? t('Réactiver le son') : t('Couper le son')}
            testId="media-mute"
            onClick={() => act(media.muted ? 'unmute' : 'mute')}
          >
            <SpeakerIcon muted={media.muted} />
          </ControlButton>
          {volume !== null && (
            <input
              type="range"
              aria-label={t('Volume')}
              data-testid="media-volume"
              min={0}
              max={100}
              value={Math.round(shownVolume * 100)}
              onPointerDown={() => (dragging.current = true)}
              onPointerUp={() => (dragging.current = false)}
              onChange={(e) => {
                const next = Number(e.target.value) / 100
                setVolume(next)
                void api.invoke('media:setVolume', next)
              }}
              className="w-[72px] min-w-0 accent-[#c67afb]"
            />
          )}
        </span>
      </div>
    </section>
  )
}

function ControlButton(props: { label: string; testId: string; big?: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      data-testid={props.testId}
      onClick={props.onClick}
      className={`grid shrink-0 place-items-center rounded-full text-frame-text hover:bg-frame-3 ${
        props.big ? 'size-9 bg-frame-3/70' : 'size-8'
      }`}
    >
      {props.children}
    </button>
  )
}
