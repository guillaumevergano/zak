import { useEffect, useRef, useState } from 'react'
import type { OverlayRequest } from '@shared/types'
import { formatColor, inkOn, type ColorFormat } from '@shared/colors'
import { t } from '@shared/i18n'

const api = window.zak

/** How long the thumbnail stays (the pointer over it holds it). */
const SHOWN_MS = 7000

/**
 * « Couleurs » (CLAUDE.md §6.8), in the page's bottom corner without taking the focus: the color
 * just picked (copied; its other formats, ★, the site's brand kit, every color), a brand kit being
 * read, or why it can't be done.
 */
export function ColorsToast({ request }: { request: Extract<OverlayRequest, { kind: 'colors-toast' }> }): JSX.Element {
  const { toast } = request
  const [hovered, setHovered] = useState(false)
  const [favorite, setFavorite] = useState(toast.mode === 'picked' && toast.color.favorite)
  const [copied, setCopied] = useState(toast.mode === 'picked' ? toast.copied : '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hide = (): void => void api.invoke('overlay:hide', 'colors-toast')

  useEffect(() => {
    if (hovered || toast.mode === 'scanning') return
    timer.current = setTimeout(hide, SHOWN_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [hovered, toast.mode])

  const card = 'fixed inset-1 flex flex-col gap-2.5 rounded-[16px] border border-title/12 bg-white p-3 text-ink shadow-[0_2px_8px_rgb(0_0_0/0.16)]'

  if (toast.mode === 'scanning') {
    return (
      <div role="status" data-testid="colors-toast" data-mode="scanning" className={`${card} flex-row items-center`}>
        <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-track border-t-pink motion-reduce:animate-none" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-title">{t('Analyse de la charte de {host}…', { host: toast.host })}</span>
      </div>
    )
  }

  if (toast.mode === 'error') {
    return (
      <div
        role="alert"
        data-testid="colors-toast"
        data-mode="error"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={card}
      >
        <div className="flex items-start gap-2">
          <p className="m-0 min-w-0 flex-1 text-[13px] text-ink">{toast.message}</p>
          <CloseButton onClick={hide} />
        </div>
        {toast.privacy && (
          <button
            type="button"
            onClick={() => void api.invoke('colors:privacy').then(hide)}
            className="h-8 rounded-xl border border-track px-3 text-[12.5px] font-semibold text-sub hover:bg-violet/8"
          >
            {t('Ouvrir les Réglages')}
          </button>
        )}
      </div>
    )
  }

  const { color } = toast
  const copy = (format: ColorFormat): void => {
    void api.invoke('colors:copy', color.hex, format)
    setCopied(formatColor(color.hex, format))
  }
  return (
    <div
      role="status"
      data-testid="colors-toast"
      data-mode="picked"
      data-hex={color.hex}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={card}
    >
      <div className="flex items-stretch gap-3">
        <div
          className="grid h-[64px] w-[84px] shrink-0 place-items-center rounded-[12px] border border-black/8 font-mono text-[11px]"
          style={{ background: color.hex, color: inkOn(color.hex) }}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="m-0 font-mono text-[15px] font-semibold text-title" data-testid="colors-toast-hex">
            {color.hex}
          </p>
          <p className="m-0 truncate text-[11.5px] text-sub" title={copied}>
            {t('Copiée : {value}', { value: copied })}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <CloseButton onClick={hide} />
          <button
            type="button"
            aria-pressed={favorite}
            aria-label={favorite ? t('Retirer des favoris') : t('Ajouter aux favoris')}
            title={favorite ? t('Retirer des favoris') : t('Ajouter aux favoris')}
            onClick={() => {
              void api.invoke('colors:setFavorite', color.id, !favorite)
              setFavorite(!favorite)
            }}
            className={`flex size-7 items-center justify-center rounded-lg text-[16px] hover:bg-violet/8 ${favorite ? 'text-pink' : 'text-sub'}`}
          >
            {favorite ? '★' : '☆'}
          </button>
        </div>
      </div>
      <div className="flex gap-1.5" role="group" aria-label={t('Copier en')}>
        {(['hex', 'rgb', 'hsl'] as const).map((format) => (
          <button
            key={format}
            type="button"
            onClick={() => copy(format)}
            title={formatColor(color.hex, format)}
            className={`h-7 flex-1 rounded-lg border text-[11.5px] font-semibold uppercase ${
              copied === formatColor(color.hex, format) ? 'border-violet/50 bg-violet/8 text-violet' : 'border-track text-sub hover:bg-violet/8'
            }`}
          >
            {format}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        {toast.canScan && (
          <button
            type="button"
            onClick={() => {
              hide()
              void api.invoke('tools:run', 'brand')
            }}
            className="h-8 flex-1 rounded-xl border border-track px-2 text-[12px] font-semibold text-sub hover:bg-violet/8"
          >
            {t('Charte du site')}
          </button>
        )}
        <button
          type="button"
          onClick={() => void api.invoke('colors:open').then(hide)}
          className="h-8 flex-1 rounded-xl border border-track px-2 text-[12px] font-semibold text-sub hover:bg-violet/8"
        >
          {t('Mes couleurs')}
        </button>
        <button
          type="button"
          onClick={() => {
            hide()
            void api.invoke('tools:run', 'colors')
          }}
          className="h-8 flex-1 rounded-xl border border-track px-2 text-[12px] font-semibold text-sub hover:bg-violet/8"
        >
          {t('Une autre')}
        </button>
      </div>
    </div>
  )
}

function CloseButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('Fermer')}
      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[15px] text-sub hover:bg-violet/8"
    >
      ✕
    </button>
  )
}
