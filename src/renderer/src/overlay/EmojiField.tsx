import { lazy, Suspense, useRef, useState } from 'react'
import { getLang, t } from '@shared/i18n'
import { TileIcon } from '../components/Sidebar'

const api = window.zak

// The picker and its French dataset load only when it's opened.
const Picker = lazy(() => import('emoji-picker-react'))
const frenchEmojis = (): Promise<unknown> => import('emoji-picker-react/data/emojis-fr')

/**
 * A favorite's other icons: the site's own (fetched now, kept sharp) or an image of one's own.
 * `onSiteIcon` and `onImage` both clear the emoji.
 */
export interface IconSources {
  url: string
  image: string | null
  onSiteIcon: (favicon: string) => void
  onImage: (image: string) => void
}

/** Side of the own images kept: sharp on a tile, even on a Retina screen. */
const IMAGE_SIZE = 128

/** A picked file as a PNG data: URL of at most IMAGE_SIZE px (null: not an image). */
async function tileImage(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, IMAGE_SIZE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/**
 * Big icon button; opens the emoji picker inline. `null` = no emoji (the tile shows the favicon).
 * With `sources` (favorites), also « Icône du site » and « Mon image… ».
 */
export function EmojiField(props: {
  emoji: string | null
  favicon?: string | null
  allowNone: boolean
  onChange: (emoji: string | null) => void
  sources?: IconSources
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const { sources } = props

  const siteIcon = (): void => {
    if (!sources) return
    setOpen(false)
    setBusy(true)
    setMessage(null)
    void api
      .invoke('favorites:fetchIcon', sources.url)
      .then((icon) => (icon ? sources.onSiteIcon(icon) : setMessage(t('Aucune icône trouvée pour ce site.'))))
      .catch(() => setMessage(t('Aucune icône trouvée pour ce site.')))
      .finally(() => setBusy(false))
  }
  const pickImage = (picked: File | undefined): void => {
    if (!sources || !picked) return
    setOpen(false)
    setMessage(null)
    void tileImage(picked).then((image) => (image ? sources.onImage(image) : setMessage(t('Ce fichier n’est pas une image.'))))
  }
  const choice = 'rounded-[8px] border border-track bg-white px-2 py-1 text-[11.5px] font-semibold text-violet hover:border-violet/40 disabled:opacity-50'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="emoji-button"
          title={t('Choisir un emoji')}
          onClick={() => setOpen(!open)}
          className={`grid h-14 w-[70px] place-items-center rounded-[14px] border bg-white hover:border-violet/40 ${
            open ? 'border-pink' : 'border-track'
          }`}
        >
          <TileIcon favorite={{ emoji: props.emoji, favicon: props.favicon ?? null, image: sources?.image ?? null }} />
        </button>
        {sources ? (
          <div className="flex flex-col items-start gap-1.5 text-xs text-sub">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Icône du favori')}>
              <button type="button" className={choice} onClick={() => setOpen(!open)}>
                {t('Emoji')}
              </button>
              <button type="button" className={choice} disabled={busy || !sources.url.trim()} onClick={siteIcon}>
                {busy ? t('Recherche…') : t('Icône du site')}
              </button>
              <button type="button" className={choice} onClick={() => file.current?.click()}>
                {t('Mon image…')}
              </button>
            </div>
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              aria-label={t('Mon image…')}
              data-testid="favorite-image-input"
              hidden
              onChange={(e) => {
                pickImage(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {message && (
              <span role="status" className="text-pink-button">
                {message}
              </span>
            )}
          </div>
        ) : (
        <div className="flex flex-col items-start gap-0.5 text-xs text-sub">
          <span>{open ? t('Choisis un emoji ci-dessous') : t('Clique pour choisir un emoji')}</span>
          {props.allowNone && props.emoji && (
            <button type="button" onClick={() => props.onChange(null)} className="font-semibold text-violet hover:underline">
              {t("Utiliser l'icône du site")}
            </button>
          )}
        </div>
        )}
      </div>
      {open && (
        <Suspense fallback={<div className="h-[340px] rounded-xl bg-lavender/60" />}>
          <Picker
            width="100%"
            height={340}
            // French keywords for the search; the picker's own data is English.
            {...(getLang() === 'fr' ? { emojiData: frenchEmojis as never } : {})}
            labels={{
              searchPlaceholder: t('Rechercher'),
              searchLabel: t('Rechercher un emoji'),
              searchClear: t('Effacer'),
              searchResultsNone: t('Aucun résultat'),
              loading: t('Chargement…')
            }}
            previewConfig={{ showPreview: false }}
            skinTonesDisabled
            lazyLoadEmojis
            className="epr-zak"
            onEmojiClick={(data) => {
              props.onChange(data.emoji)
              setOpen(false)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
