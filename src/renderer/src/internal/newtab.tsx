import '../lib/lang'
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { toUrl, type SearchEngine } from '@shared/url'
import type { HistoryEntry, NewtabHeadline, OmniboxSuggestion } from '@shared/types'
import { callInternal } from './api'
import { GlobeIcon, SearchIcon, SparkleIcon } from '../components/Icons'
import logo from '../assets/brand/zak-logo-color.svg'
import logoReverse from '../assets/brand/zak-logo-reverse.svg'
import '../styles.css'
import { t } from '@shared/i18n'

/** Private windows open it with `?private=1`: same dark theme as their chrome UI (CLAUDE.md §6.3). */
const isPrivate = new URLSearchParams(location.search).get('private') === '1'
if (isPrivate) document.body.classList.add('private')

const isMac = navigator.userAgent.includes('Mac')

/**
 * zak://newtab, what "+" and Cmd/Ctrl+T open (CLAUDE.md §7, docs/design/maquette-v2.png).
 * Private windows show neither the previous session nor the history.
 */
/**
 * Under the logo (setting « Sous le logo », src/main/newtab/headlines.ts): Zak's words, the user's,
 * a quote, a proverb, or something to learn from Wikipedia — a new one with each tab. Long lines
 * get a smaller font; Wikipedia's link to read more.
 */
function Headline(): JSX.Element {
  // undefined: still asking (keeps the place, nothing flashes); null: Zak's own words.
  const [headline, setHeadline] = useState<NewtabHeadline | null | undefined>(undefined)
  useEffect(() => {
    callInternal('newtab/headline', null)
      .then(setHeadline)
      .catch(() => setHeadline(null))
  }, [])
  if (headline === undefined) return <div aria-hidden className="h-[clamp(96px,11vw,140px)]" />
  // Nothing to show, but the page keeps its title for screen readers.
  if (headline?.kind === 'none') return <h1 className="sr-only">{t('Nouvel onglet')}</h1>
  const title = headline ? headline.title : t('Un peu d’espace.')
  const subtitle = headline ? headline.subtitle : t('Pour vos prochaines idées.')
  const long = title.length > 60
  const quoted = headline?.kind === 'quote'
  return (
    <div data-testid="newtab-headline" data-kind={headline?.kind ?? 'zak'} className="mt-4 flex max-w-[880px] flex-col items-center text-center">
      <h1
        className={`m-0 font-serif leading-[1.12] font-semibold tracking-[-0.02em] text-balance ${
          long ? 'text-[clamp(24px,3vw,36px)]' : 'text-[clamp(44px,7vw,84px)] leading-[1.05]'
        }`}
      >
        {quoted ? t('« {text} »', { text: title }) : title}
      </h1>
      {subtitle && <p className={`m-0 mt-2 text-blush ${long ? 'text-[clamp(15px,1.6vw,19px)]' : 'text-[clamp(18px,2.2vw,26px)]'}`}>{quoted ? `— ${subtitle}` : subtitle}</p>}
      {headline?.link && (
        <a href={headline.link} className="mt-2 text-[13px] text-cream-sub underline-offset-2 hover:text-cream-ink hover:underline">
          {t('En savoir plus sur Wikipédia')}
        </a>
      )}
    </div>
  )
}

function NewTabPage(): JSX.Element {
  const [text, setText] = useState('')
  const [engine, setEngine] = useState<SearchEngine>('google')
  const [canReopen, setCanReopen] = useState(false)
  const [recent, setRecent] = useState<HistoryEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  // Same dropdown as the omnibox: visited sites, favorites, a search.
  const [items, setItems] = useState<OmniboxSuggestion[]>([])
  const [selected, setSelected] = useState(0)
  const query = useRef(0)

  const suggest = (value: string): void => {
    const id = ++query.current
    if (value.trim() === '') {
      setItems([])
      return
    }
    callInternal('newtab/suggest', { text: value })
      .then((next) => {
        if (id !== query.current) return
        setItems(next)
        setSelected(0)
      })
      .catch(() => {})
  }

  const go = (url: string): void => {
    query.current++
    setItems([])
    location.assign(url)
  }

  useEffect(() => {
    callInternal('settings/get', null)
      .then((s) => setEngine(s.general.searchEngine))
      .catch(() => {})
    if (isPrivate) return
    callInternal('newtab/state', null)
      .then((state) => {
        setCanReopen(state.canReopenSession)
        setRecent(state.recent)
      })
      .catch(() => {})
  }, [])

  // ⌘K / Ctrl+K: back to the field (the omnibox has the focus when the tab opens).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() === 'k' && (isMac ? e.metaKey : e.ctrlKey)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main className="flex min-h-full flex-col items-center justify-center px-6 pt-[6vh] pb-[10vh] text-cream-ink">
      <Logo />
      <Headline />

      <div className="relative mt-10 w-full max-w-[680px]">
      <form
        className="flex h-[62px] w-full items-center gap-4 rounded-full border border-cream-edge bg-cream-2 pr-3 pl-6 focus-within:border-pink focus-within:shadow-[0_0_0_3px_rgb(255_0_130/0.12)]"
        onSubmit={(e) => {
          e.preventDefault()
          const choice = items[selected]
          if (choice) go(choice.url)
          else if (text.trim() !== '') go(toUrl(text, engine))
        }}
      >
        <span className="text-iris">
          <SparkleIcon size={24} />
        </span>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            suggest(e.target.value)
          }}
          onKeyDown={(e) => {
            if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length > 0) {
              e.preventDefault()
              const delta = e.key === 'ArrowDown' ? 1 : -1
              setSelected((i) => (i + delta + items.length) % items.length)
            } else if (e.key === 'Escape') {
              query.current++
              setItems([])
            }
          }}
          onBlur={() => setTimeout(() => setItems([]), 150)}
          role="combobox"
          aria-expanded={items.length > 0}
          aria-label={t('Où voulez-vous aller ?')}
          placeholder={t('Où voulez-vous aller ?')}
          spellCheck={false}
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-[19px] text-cream-ink outline-none placeholder:text-cream-sub"
        />
        <kbd className="rounded-[10px] border border-cream-edge bg-cream px-2.5 py-1.5 font-sans text-[14px] text-cream-sub">
          {isMac ? '⌘ K' : 'Ctrl K'}
        </kbd>
      </form>
      {items.length > 0 && <SuggestionList items={items} selected={selected} onPick={(item) => go(item.url)} />}
      </div>

      {canReopen && (
        <button
          type="button"
          onClick={() => {
            setCanReopen(false)
            void callInternal('newtab/reopenSession', null)
          }}
          className="mt-8 flex cursor-pointer items-center gap-2 rounded-full border-0 bg-transparent px-3 py-1.5 text-[16px] text-cream-ink hover:bg-cream-2"
        >
          <ClockIcon />
          {t('Reprendre la navigation')}
        </button>
      )}

      {recent.length > 0 && (
        <section aria-labelledby="recent-title" className="mt-14 w-full max-w-[1000px]">
          <h2 id="recent-title" className="m-0 mb-4 font-serif text-[24px] font-semibold">
            {t('Récemment')}
          </h2>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 p-0">
            {recent.map((entry) => (
              <li key={entry.id}>
                <a
                  href={entry.url}
                  data-testid="recent"
                  className="group flex items-center gap-4 rounded-[14px] border border-cream-edge bg-cream p-2.5 text-cream-ink no-underline hover:bg-cream-2"
                >
                  <span className="grid size-[52px] shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-[#e9d8e4] via-[#d9c4dc] to-[#b9a6d8]">
                    <RecentIcon favicon={entry.favicon} url={entry.url} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[16px] font-semibold">{entry.title}</span>
                    <span className="truncate text-[13.5px] text-iris-ring">{hostOf(entry.url)}</span>
                  </span>
                  <span className="pr-2 text-[18px] text-cream-sub group-hover:text-cream-ink" aria-hidden>
                    ↗
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

/** Dropdown under the field, styled like the omnibox's. */
function SuggestionList({
  items,
  selected,
  onPick
}: {
  items: OmniboxSuggestion[]
  selected: number
  onPick: (item: OmniboxSuggestion) => void
}): JSX.Element {
  return (
    <div
      role="listbox"
      aria-label={t('Suggestions')}
      data-testid="newtab-suggestions"
      className="absolute inset-x-0 top-[70px] z-10 flex flex-col rounded-[22px] border border-cream-edge bg-cream py-2 text-left shadow-[0_8px_28px_rgb(42_26_38/0.14)]"
    >
      {items.map((item, i) => (
        <div
          key={`${item.kind} ${item.url}`}
          role="option"
          aria-selected={i === selected}
          data-testid="newtab-suggestion"
          // mousedown: before the field loses the focus (which hides this list).
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(item)
          }}
          className={`mx-2 flex h-11 shrink-0 cursor-default items-center gap-3.5 rounded-[14px] px-4 ${
            i === selected ? 'bg-cream-2' : 'hover:bg-cream-2/60'
          }`}
        >
          <span className="grid w-5 shrink-0 place-items-center text-cream-sub">
            {item.kind === 'search' ? (
              <SearchIcon />
            ) : item.emoji ? (
              <span className="emoji text-[16px] leading-none">{item.emoji}</span>
            ) : item.favicon ? (
              <img src={item.favicon} alt="" className="size-4 rounded" />
            ) : (
              <GlobeIcon />
            )}
          </span>
          <span className="min-w-0 truncate text-[15px]">
            {item.kind === 'search' ? (
              <>
                {item.title} <span className="text-cream-sub">{t('— Rechercher')}</span>
              </>
            ) : (
              item.title
            )}
          </span>
          {(item.kind === 'history' || item.kind === 'favorite') && (
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-cream-sub">
              {item.url.replace(/^https?:\/\/(www\.)?/, '')}
            </span>
          )}
          {item.kind === 'favorite' && <span className="shrink-0 text-[12px] font-semibold text-iris">{t('Favori')}</span>}
        </div>
      ))}
    </div>
  )
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

function ClockIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6M3.5 3.5v3h3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 6.5V10l2.5 1.5" strokeLinecap="round" />
    </svg>
  )
}

/** The site's favicon, or its initial when there is none or it fails to load. */
function RecentIcon({ favicon, url }: { favicon: string | null; url: string }): JSX.Element {
  const [failed, setFailed] = useState(false)
  if (favicon && !failed) return <img src={favicon} alt="" onError={() => setFailed(true)} className="size-7 rounded-md" />
  return <span className="text-[20px] font-bold text-white/90">{hostOf(url).charAt(0).toUpperCase()}</span>
}

/** The Zak logo (docs/brand/): the reverse version on a dark page (dark theme, private window). */
function Logo(): JSX.Element {
  const img = (src: string): JSX.Element => (
    <img src={src} alt="Zak" width={240} height={114} draggable={false} data-testid="newtab-logo" className="block select-none" />
  )
  if (isPrivate) return img(logoReverse)
  return (
    <picture>
      <source srcSet={logoReverse} media="(prefers-color-scheme: dark)" />
      {img(logo)}
    </picture>
  )
}

document.title = t('Nouvel onglet')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NewTabPage />
  </StrictMode>
)
