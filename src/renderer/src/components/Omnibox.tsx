import { useEffect, useRef, useState } from 'react'
import type { OmniboxSuggestion, TabInfo } from '@shared/types'
import { useBrowserStore } from '../store/useBrowserStore'
import { exactFavorite, rectOf } from '../lib/favorites'
import { LockIcon, SearchIcon, StarIcon } from './Icons'

const api = window.zak

/**
 * Like Chrome: hide `https://` and a lone trailing slash when the field isn't being edited;
 * the host is emphasised, the rest is dimmed.
 */
function splitUrl(url: string): [host: string, rest: string] {
  const shown = url.replace(/^https:\/\//, '').replace(/^([^/?#]+)\/$/, '$1')
  const match = /^((?:[a-z][a-z0-9+.-]*:\/\/)?[^/?#]*)(.*)$/i.exec(shown)
  return match ? [match[1]!, match[2]!] : [shown, '']
}

/**
 * Address / search field (CLAUDE.md §6.7). Cmd/Ctrl+L focuses it. History and favorites
 * suggestions arrive with those features (Étapes 2 and 6).
 */
export function Omnibox({ tab }: { tab: TabInfo | undefined }): JSX.Element {
  const focusTick = useBrowserStore((s) => s.omniboxFocusTick)
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const url = tab?.url ?? ''
  const formRef = useRef<HTMLFormElement>(null)
  // Dropdown (shown in the overlay, CLAUDE.md §6.7). `selected` is what Enter opens.
  const [items, setItems] = useState<OmniboxSuggestion[]>([])
  const [selected, setSelected] = useState(0)
  const query = useRef(0)

  const hideSuggestions = (): void => {
    query.current++
    void api.invoke('overlay:hide', 'suggestions')
    setItems([])
    setSelected(0)
  }

  // Show / update the dropdown under the field.
  useEffect(() => {
    const form = formRef.current
    if (!form || !tab || items.length === 0 || !editing) return
    const r = form.getBoundingClientRect()
    void api.invoke('overlay:open', {
      kind: 'suggestions',
      tabId: tab.id,
      items,
      selected,
      frame: { x: r.left - 4, y: r.bottom + 4, width: r.width + 8, height: items.length * 36 + 20 }
    })
  }, [items, selected, editing, tab])

  const fetchSuggestions = (value: string): void => {
    const id = ++query.current
    if (value.trim() === '') {
      hideSuggestions()
      return
    }
    void api.invoke('omnibox:suggest', value).then((next) => {
      if (id !== query.current) return
      setItems(next)
      setSelected(0)
      if (next.length === 0) void api.invoke('overlay:hide', 'suggestions')
    })
  }

  // Navigation or tab switch while not typing: show the new URL.
  useEffect(() => {
    if (!editing) setText(url)
  }, [url, editing])

  // Switching tabs drops whatever was being typed.
  useEffect(() => {
    setEditing(false)
    setItems([])
    setText(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.id])

  useEffect(() => {
    if (focusTick === 0) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [focusTick])

  const secure = url.startsWith('https://')
  const insecure = url.startsWith('http://')

  return (
    <form
      ref={formRef}
      className="mx-1.5 flex h-[38px] min-w-0 flex-1 items-center gap-2.5 rounded-full border border-cream-edge bg-cream-2 px-4 focus-within:border-pink focus-within:shadow-[0_0_0_3px_rgb(255_0_130/0.14)]"
      onSubmit={(e) => {
        e.preventDefault()
        if (!tab || text.trim() === '') return
        const choice = items[selected]
        hideSuggestions()
        setEditing(false)
        // The page takes the focus (main): drop the field's focus ring too.
        inputRef.current?.blur()
        void api.invoke('tabs:navigate', tab.id, choice ? choice.url : text)
      }}
    >
      <span
        className="shrink-0 text-cream-sub"
        title={secure ? 'La connexion est sécurisée' : insecure ? "La connexion n'est pas sécurisée" : undefined}
      >
        {secure ? <LockIcon /> : <SearchIcon />}
      </span>
      {insecure && !editing && <span className="shrink-0 text-xs font-medium text-pink-button">Non sécurisé</span>}
      <div className="relative flex h-full min-w-0 flex-1 items-center">
      {!editing && text !== '' && <StyledUrl url={text} />}
      <input
        ref={inputRef}
        data-testid="omnibox"
        value={text}
        placeholder="Rechercher ou saisir une adresse"
        onChange={(e) => {
          setEditing(true)
          setText(e.target.value)
          fetchSuggestions(e.target.value)
        }}
        onFocus={(e) => {
          setEditing(true)
          // Select once React has put the full URL in the field.
          const input = e.target
          requestAnimationFrame(() => input.select())
        }}
        onBlur={() => {
          setEditing(false)
          setText(url)
          // A click on a suggestion lands in the overlay first: let it through.
          setTimeout(hideSuggestions, 150)
        }}
        onKeyDown={(e) => {
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length > 0) {
            e.preventDefault()
            const delta = e.key === 'ArrowDown' ? 1 : -1
            setSelected((i) => (i + delta + items.length) % items.length)
            return
          }
          if (e.key === 'Escape' && items.length > 0) {
            hideSuggestions()
            return
          }
          if (e.key !== 'Escape') return
          // Esc reverts what was typed, then hands the focus back to the page.
          if (text !== url) {
            setText(url)
            requestAnimationFrame(() => inputRef.current?.select())
          } else inputRef.current?.blur()
        }}
        className={`h-full w-full min-w-0 bg-transparent font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-[14px] placeholder:text-cream-sub ${
          editing || text === '' ? 'text-cream-ink' : 'text-transparent'
        }`}
        spellCheck={false}
        autoComplete="off"
      />
      </div>
      {tab && tab.zoom !== 100 && (
        <button
          type="button"
          data-testid="zoom-badge"
          title="Revenir à 100 % (⌘0)"
          onClick={() => void api.invoke('tabs:resetZoom', tab.id)}
          className="shrink-0 rounded-full bg-black/6 px-2 py-0.5 text-[11.5px] font-semibold text-cream-sub hover:bg-black/10 hover:text-cream-ink"
        >
          {tab.zoom} %
        </button>
      )}
      {tab && /^https?:/.test(url) && <FavoriteStar tab={tab} />}
    </form>
  )
}

/** ★ (CLAUDE.md §6.2): add the page to the sidebar, or edit its favorite. Pink when saved. */
function FavoriteStar({ tab }: { tab: TabInfo }): JSX.Element {
  const favorites = useBrowserStore((s) => s.sidebar?.favorites ?? [])
  const saved = exactFavorite(tab.url, favorites)
  return (
    <button
      type="button"
      data-testid="favorite-star"
      title={saved ? 'Modifier le favori' : 'Ajouter aux favoris de la barre latérale'}
      className={`-mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg hover:bg-black/6 ${
        saved ? 'text-pink' : 'text-cream-sub hover:text-cream-ink'
      }`}
      onClick={(e) =>
        void api.invoke('overlay:open', {
          kind: 'favorite-editor',
          anchor: rectOf(e.currentTarget),
          favoriteId: saved?.id ?? null,
          draft: saved
            ? { title: saved.title, url: saved.url, emoji: saved.emoji, folderId: saved.folderId, favicon: saved.favicon }
            : { title: tab.title, url: tab.url, emoji: null, folderId: null, favicon: tab.favicon }
        })
      }
    >
      <StarIcon filled={!!saved} />
    </button>
  )
}

/** The URL as shown at rest, drawn over the (transparent) input text. */
function StyledUrl({ url }: { url: string }): JSX.Element {
  const [host, rest] = splitUrl(url)
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center overflow-hidden font-mono text-[13px] whitespace-pre text-cream-sub">
      <span className="font-medium text-cream-ink">{host}</span>
      <span className="truncate">{rest}</span>
    </span>
  )
}
