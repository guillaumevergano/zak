import { useEffect, useRef, useState } from 'react'
import type { OverlayRequest } from '@shared/types'
import { t } from '@shared/i18n'

const api = window.zak

/** How long the thumbnail stays (the pointer over it holds it). */
const SHOWN_MS = 6000

/**
 * The screenshot just taken, or the recording just made (CLAUDE.md §6.8), in the page's bottom corner: copied, saved, and
 * draggable into a message or the Finder. It goes away by itself.
 */
export function ScreenshotToast({ request }: { request: Extract<OverlayRequest, { kind: 'screenshot-done' }> }): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hide = (): void => void api.invoke('overlay:hide', 'screenshot-done')

  useEffect(() => {
    if (hovered) return
    timer.current = setTimeout(hide, SHOWN_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [hovered])

  const isMac = navigator.platform.startsWith('Mac')
  return (
    <div
      role="status"
      data-testid="screenshot-toast"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fixed inset-1 flex flex-col gap-2.5 rounded-[16px] border border-title/12 bg-white p-3 text-ink shadow-[0_2px_8px_rgb(0_0_0/0.16)]"
    >
      <img
        // A recording without a picture: an empty frame to drag.
        src={request.preview.length > 40 ? request.preview : undefined}
        alt={request.name}
        title={request.video ? t('Glissez la vidéo dans un message ou un dossier') : t('Glissez l’image dans un message ou un dossier')}
        draggable
        onDragStart={(e) => {
          e.preventDefault()
          api.send('tools:screenshotDrag', null)
        }}
        className="h-[130px] w-full cursor-grab rounded-[10px] bg-[#EBE2E2] object-contain"
      />
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[13px] font-semibold text-title">{request.video ? t('Enregistrement terminé') : t('Capture copiée')}</p>
          <p className="m-0 truncate text-[11.5px] text-sub" title={request.name}>
            {request.video ? t('Enregistré dans Téléchargements') : t('Enregistrée dans Téléchargements')}
          </p>
        </div>
        <button
          type="button"
          onClick={hide}
          aria-label={t('Fermer')}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[15px] text-sub hover:bg-violet/8"
        >
          ✕
        </button>
      </div>
      <button
        type="button"
        onClick={() => void api.invoke('tools:screenshotReveal').then(hide)}
        className="h-8 rounded-xl border border-track px-3 text-[12.5px] font-semibold text-sub hover:bg-violet/8"
      >
        {isMac ? t('Afficher dans le Finder') : t('Afficher dans le dossier')}
      </button>
    </div>
  )
}
