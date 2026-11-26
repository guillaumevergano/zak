import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { OverlayRequest } from '@shared/types'
import { getLang, t } from '@shared/i18n'
import { languageMenu, languageName } from '@shared/tools'

const api = window.zak

type State = { status: 'loading' } | { status: 'done'; text: string; source: string } | { status: 'error' }

/** A selection's translation, under it (CLAUDE.md §6.8). The language can be changed here. */
export function TranslationBubble({ request }: { request: Extract<OverlayRequest, { kind: 'translation' }> }): JSX.Element {
  const lang = getLang()
  const [target, setTarget] = useState(request.target)
  const [state, setState] = useState<State>(request.error ? { status: 'error' } : { status: 'loading' })
  const [copied, setCopied] = useState(false)
  const [attempt, setAttempt] = useState(request.error ? -1 : 0)
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (attempt < 0) return
    let live = true
    setState({ status: 'loading' })
    api
      .invoke('tools:translate', request.text, target)
      .then((result) => live && setState({ status: 'done', ...result }))
      .catch(() => live && setState({ status: 'error' }))
    return () => {
      live = false
    }
  }, [request.text, target, attempt])

  // The view is exactly the bubble's size: it follows the text's height.
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    const fit = (): void => void api.invoke('overlay:resize', el.offsetHeight + 12)
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const close = (): void => void api.invoke('overlay:close')
  const copy = (): void => {
    if (state.status !== 'done') return
    void navigator.clipboard.writeText(state.text).then(() => setCopied(true))
  }
  const { recent, others } = languageMenu([], lang)
  const source = state.status === 'done' && state.source ? languageName(state.source, lang) : null

  return (
    <div
      ref={card}
      role="dialog"
      aria-label={t('Traduction')}
      data-testid="translation-bubble"
      onKeyDown={(e) => e.key === 'Escape' && close()}
      className="fixed inset-x-1 top-1 flex flex-col gap-2 rounded-[16px] border border-title/12 bg-white p-3.5 text-ink shadow-[0_2px_8px_rgb(0_0_0/0.16)]"
    >
      <div className="flex items-center gap-2 text-[12px] text-sub">
        <span className="truncate">{source ? t('{language} →', { language: source }) : t('Traduire en')}</span>
        <select
          aria-label={t('Langue de la traduction')}
          value={target}
          onChange={(e) => {
            setCopied(false)
            setTarget(e.target.value)
          }}
          className="h-7 min-w-0 rounded-lg border border-track bg-white px-1.5 text-[12px] font-semibold text-title"
        >
          {[...recent, ...others].map((code) => (
            <option key={code} value={code}>
              {languageName(code, lang)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={close}
          aria-label={t('Fermer')}
          className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-lg text-[15px] text-sub hover:bg-violet/8"
        >
          ✕
        </button>
      </div>

      {state.status === 'loading' && (
        <p className="m-0 text-[14px] text-sub" aria-live="polite">
          {t('Traduction…')}
        </p>
      )}
      {state.status === 'error' && (
        <div className="flex items-center gap-2" role="alert">
          <p className="m-0 flex-1 text-[13.5px] text-pink-button">{t('La traduction n’a pas abouti. Vérifiez votre connexion.')}</p>
          <button type="button" onClick={() => setAttempt((n) => Math.max(n, 0) + 1)} className="h-8 shrink-0 rounded-xl border border-track px-3 text-[12.5px] font-semibold text-sub hover:bg-violet/8">
            {t('Réessayer')}
          </button>
        </div>
      )}
      {state.status === 'done' && (
        <>
          <p data-testid="translation-text" className="m-0 max-h-[280px] overflow-y-auto text-[14.5px] leading-snug whitespace-pre-wrap select-text">
            {state.text}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-sub/80">{t('Google Traduction')}</span>
            <button
              type="button"
              autoFocus
              onClick={copy}
              className="ml-auto h-8 rounded-xl border border-track px-3 text-[12.5px] font-semibold text-sub hover:bg-violet/8"
            >
              {copied ? t('Copié') : t('Copier')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
