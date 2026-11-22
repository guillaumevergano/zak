import { useEffect, useRef, useState } from 'react'
import type { FindResult, OverlayRequest } from '@shared/types'
import { BackIcon, CloseIcon, ForwardIcon } from '../components/Icons'
import { t } from '@shared/i18n'

const api = window.zak

/** Cmd/Ctrl+F bar at the top right of the page (CLAUDE.md §6.7), with the match counter. */
export function FindBar({ request }: { request: Extract<OverlayRequest, { kind: 'find' }> }): JSX.Element {
  const [text, setText] = useState(request.text)
  const [result, setResult] = useState<FindResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => api.on('find:result', setResult), [])
  useEffect(() => {
    inputRef.current?.select()
    if (request.text) void api.invoke('find:query', request.tabId, request.text, true, false)
  }, [request])

  const query = (value: string, forward = true, findNext = false): void =>
    void api.invoke('find:query', request.tabId, value, forward, findNext)

  return (
    <form
      data-testid="find-bar"
      className="fixed inset-x-1.5 top-1 bottom-2 flex items-center gap-1.5 rounded-[14px] border border-cream-edge bg-cream px-2.5 text-cream-ink shadow-[0_2px_6px_rgb(0_0_0/0.14)]"
      onSubmit={(e) => {
        e.preventDefault()
        query(text, true, true)
      }}
    >
      <input
        ref={inputRef}
        autoFocus
        value={text}
        aria-label={t('Rechercher dans la page')}
        placeholder={t('Rechercher dans la page')}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value)
          query(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault()
            query(text, false, true)
          } else if (e.key === 'Escape') void api.invoke('find:close')
        }}
        className="h-8 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-cream-sub"
      />
      <span data-testid="find-count" className="shrink-0 text-[12px] text-cream-sub tabular-nums">
        {text && result ? `${result.matches === 0 ? 0 : result.activeMatch}/${result.matches}` : ''}
      </span>
      <span className="mx-1 h-5 w-px bg-cream-edge" />
      <FindButton title={t('Précédent (⇧⌘G)')} onClick={() => query(text, false, true)}>
        <span className="block rotate-90">
          <BackIcon />
        </span>
      </FindButton>
      <FindButton title={t('Suivant (⌘G)')} onClick={() => query(text, true, true)}>
        <span className="block rotate-90">
          <ForwardIcon />
        </span>
      </FindButton>
      <FindButton title={t('Fermer (Échap)')} onClick={() => void api.invoke('find:close')}>
        <CloseIcon />
      </FindButton>
    </form>
  )
}

function FindButton(props: { title: string; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      onClick={props.onClick}
      className="grid size-7 shrink-0 place-items-center rounded-lg text-cream-sub hover:bg-black/6 hover:text-cream-ink"
    >
      {props.children}
    </button>
  )
}
