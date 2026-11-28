import { useEffect, useRef, useState } from 'react'
import type { OverlayRequest } from '@shared/types'
import type { RecordingShare } from '@shared/recordings'
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
  const recording = request.recording
  const [share, setShare] = useState<RecordingShare | null>(recording?.share ?? null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hide = (): void => void api.invoke('overlay:hide', 'screenshot-done')

  // The recording's upload to Drive, as it goes.
  useEffect(() => {
    if (!recording) return
    return api.on('recordings:upload', (upload) => {
      if (upload.id === recording.id) setShare(upload.share)
    })
  }, [recording?.id])

  useEffect(() => {
    // Stays while it uploads (and a little longer once the link is copied).
    if (hovered || share?.state === 'uploading') return
    timer.current = setTimeout(hide, share?.state === 'done' || share?.state === 'error' ? SHOWN_MS * 2 : SHOWN_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [hovered, share?.state])

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
      {recording && share && <ShareRow id={recording.id} share={share} />}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => void api.invoke('tools:screenshotReveal').then(hide)}
          className="h-8 flex-1 whitespace-nowrap rounded-xl border border-track px-3 text-[12.5px] font-semibold text-sub hover:bg-violet/8"
        >
          {isMac ? t('Afficher dans le Finder') : t('Afficher dans le dossier')}
        </button>
        {recording && (
          <button
            type="button"
            onClick={() => void api.invoke('recordings:open').then(hide)}
            className="h-8 flex-1 whitespace-nowrap rounded-xl border border-track px-3 text-[12.5px] font-semibold text-sub hover:bg-violet/8"
          >
            {t('Mes enregistrements')}
          </button>
        )}
      </div>
    </div>
  )
}

/** A recording's Drive row: « Partager » (the link copied), its progress, the link once there. */
function ShareRow({ id, share }: { id: string; share: RecordingShare }): JSX.Element {
  if (share.state === 'uploading') {
    return (
      <div className="flex h-8 items-center gap-2" role="status" data-testid="recording-share" data-state="uploading">
        <span className="text-[12px] font-semibold text-sub">{t('Envoi sur Google Drive…')}</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
          <span className="block h-full rounded-full bg-pink transition-[width]" style={{ width: `${Math.round(share.progress * 100)}%` }} />
        </span>
        <span className="w-9 text-right font-mono text-[11px] text-sub">{Math.round(share.progress * 100)} %</span>
      </div>
    )
  }
  if (share.state === 'done') {
    return (
      <div className="flex h-8 items-center gap-2" data-testid="recording-share" data-state="done">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-title">✓ {t('Lien copié')}</span>
        <button
          type="button"
          onClick={() => void api.invoke('recordings:copyLink', id)}
          className="h-8 rounded-xl border border-track px-3 text-[12px] font-semibold text-sub hover:bg-violet/8"
        >
          {t('Copier le lien')}
        </button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1" data-testid="recording-share" data-state={share.state}>
      {share.state === 'error' && (
        <p className="m-0 line-clamp-2 text-[11.5px] text-pink-button" role="alert">
          {share.error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void api.invoke('recordings:share', id)}
        className="flex h-8 items-center justify-center gap-2 rounded-xl border-0 bg-violet px-3 text-[12.5px] font-semibold text-white hover:bg-title"
      >
        {share.state === 'error' ? t('Réessayer') : t('Partager un lien (Google Drive)')}
      </button>
    </div>
  )
}
