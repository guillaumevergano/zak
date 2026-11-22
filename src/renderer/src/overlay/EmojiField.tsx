import { lazy, Suspense, useState } from 'react'
import { getLang, t } from '@shared/i18n'
import { TileIcon } from '../components/Sidebar'

// The picker and its French dataset load only when it's opened.
const Picker = lazy(() => import('emoji-picker-react'))
const frenchEmojis = (): Promise<unknown> => import('emoji-picker-react/data/emojis-fr')

/** Big emoji button; opens the picker inline. `null` = no emoji (the tile shows the favicon). */
export function EmojiField(props: {
  emoji: string | null
  favicon?: string | null
  allowNone: boolean
  onChange: (emoji: string | null) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)

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
          <TileIcon favorite={{ emoji: props.emoji, favicon: props.favicon ?? null }} />
        </button>
        <div className="flex flex-col items-start gap-0.5 text-xs text-sub">
          <span>{open ? t('Choisis un emoji ci-dessous') : t('Clique pour choisir un emoji')}</span>
          {props.allowNone && props.emoji && (
            <button type="button" onClick={() => props.onChange(null)} className="font-semibold text-violet hover:underline">
              {t("Utiliser l'icône du site")}
            </button>
          )}
        </div>
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
