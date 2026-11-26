import '../lib/lang'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { DefaultBrowserStatus, GeneralSettings, ImportSource } from '@shared/types'
import { NEWTAB_PAGE_URL } from '@shared/ipc'
import { LANGUAGES, LANG_CODES, plural, t } from '@shared/i18n'
import logo from '../assets/brand/zak-logo-color.svg'
import logoReverse from '../assets/brand/zak-logo-reverse.svg'
import { callInternal } from './api'
import '../styles.css'

type State = { sources: ImportSource[]; defaultBrowser: DefaultBrowserStatus; language: GeneralSettings['language'] }

const buttonClass =
  'h-10 cursor-pointer rounded-full border-0 px-5 text-[14px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-pink-soft disabled:cursor-default disabled:opacity-50'
const primary = `${buttonClass} bg-pink-button text-white hover:bg-pink`
const secondary = `${buttonClass} border border-cream-edge bg-cream-2 text-cream-ink hover:border-violet/40`

/**
 * zak://welcome, opened once at the first launch (no previous session): bring in what the user
 * had in their old browser, make Zak the default, pick the language. Every step can be skipped.
 */
function WelcomePage(): JSX.Element {
  const [state, setState] = useState<State | null>(null)
  const [profile, setProfile] = useState('')
  const [imported, setImported] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [languageChanged, setLanguageChanged] = useState(false)

  useEffect(() => {
    document.title = t('Bienvenue dans Zak')
    callInternal('welcome/state', null)
      .then((s) => {
        setState(s)
        setProfile(s.sources[0]?.profiles[0]?.path ?? '')
      })
      .catch((err: unknown) => setError(String(err)))
  }, [])

  const importNow = (): void => {
    setBusy(true)
    callInternal('welcome/importFrom', { profile })
      .then((r) => setImported(t('{favorites} et {pages} importés.', { favorites: plural(r.favorites, '{n} favori', '{n} favoris'), pages: plural(r.pages, '{n} page d’historique', '{n} pages d’historique') })))
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setBusy(false))
  }

  const makeDefault = (): void => {
    callInternal('welcome/makeDefaultBrowser', null)
      .then((defaultBrowser) => setState((s) => (s ? { ...s, defaultBrowser } : s)))
      .catch((err: unknown) => setError(String(err)))
  }

  return (
    <main className="mx-auto flex min-h-full max-w-[680px] flex-col justify-center gap-8 px-6 py-12 text-cream-ink" data-testid="welcome">
      <header className="flex flex-col items-start gap-4">
        <picture>
          <source srcSet={logoReverse} media="(prefers-color-scheme: dark)" />
          <img src={logo} alt="Zak" width={168} height={80} />
        </picture>
        <h1 className="m-0 font-serif text-[40px] leading-tight font-semibold">{t('Bienvenue dans Zak.')}</h1>
        <p className="m-0 text-[16px] text-cream-sub">{t('Quelques petites choses pour être chez vous. Tout se change plus tard dans les Réglages.')}</p>
      </header>

      {error && (
        <p role="alert" className="m-0 rounded-[12px] bg-white/70 px-4 py-3 text-[13px] text-pink-button">
          {error}
        </p>
      )}

      {state && state.sources.length > 0 && (
        <Step number={1} title={t('Récupérez vos favoris et votre historique')}>
          {imported ? (
            <p className="m-0 text-[14px]" role="status">
              ✓ {imported}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label={t('Navigateur à importer')}
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                className="h-10 max-w-[320px] rounded-[12px] border border-cream-edge bg-cream-2 px-3 text-[14px] text-cream-ink"
              >
                {state.sources.map((s) =>
                  s.profiles.map((p) => (
                    <option key={p.path} value={p.path}>
                      {s.profiles.length > 1 ? `${s.browser} — ${p.name}` : s.browser}
                    </option>
                  ))
                )}
              </select>
              <button type="button" className={secondary} disabled={busy} onClick={importNow}>
                {busy ? t('Import…') : t('Importer')}
              </button>
            </div>
          )}
          <p className="m-0 text-[12.5px] text-cream-dim">
            {t('Vos mots de passe s’importent depuis un fichier CSV, dans Réglages → Mots de passe.')}
          </p>
        </Step>
      )}

      {state && state.defaultBrowser !== 'unavailable' && (
        <Step number={state.sources.length > 0 ? 2 : 1} title={t('Faites de Zak votre navigateur par défaut')}>
          {state.defaultBrowser === 'default' ? (
            <p className="m-0 text-[14px]" role="status">
              ✓ {t('Les liens ouverts depuis les autres applications arrivent dans Zak.')}
            </p>
          ) : (
            <div>
              <button type="button" className={secondary} onClick={makeDefault}>
                {t('Définir par défaut')}
              </button>
            </div>
          )}
        </Step>
      )}

      {state && (
        <Step number={(state.sources.length > 0 ? 1 : 0) + (state.defaultBrowser !== 'unavailable' ? 1 : 0) + 1} title={t('Langue')}>
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label={t('Langue')}
              value={state.language}
              onChange={(e) => {
                const language = e.target.value as GeneralSettings['language']
                setState({ ...state, language })
                setLanguageChanged(true)
                void callInternal('welcome/setLanguage', { language }).catch((err: unknown) => setError(String(err)))
              }}
              className="h-10 rounded-[12px] border border-cream-edge bg-cream-2 px-3 text-[14px] text-cream-ink"
            >
              <option value="system">{t('Celle du système')}</option>
              {LANG_CODES.map((code) => (
                <option key={code} value={code} lang={code}>
                  {LANGUAGES[code]}
                </option>
              ))}
            </select>
            {languageChanged && <span className="text-[13px] text-cream-sub">{t('Appliquée au prochain lancement de Zak.')}</span>}
          </div>
        </Step>
      )}

      <div>
        <a href={NEWTAB_PAGE_URL} className={`${primary} inline-flex items-center no-underline`}>
          {t('Commencer')}
        </a>
      </div>
    </main>
  )
}

function Step(props: { number: number; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="glass-card flex flex-col gap-3 rounded-[18px] p-5">
      <h2 className="m-0 flex items-center gap-3 text-[16px] font-semibold">
        <span className="grid size-7 place-items-center rounded-full bg-frame text-[13px] text-frame-text">{props.number}</span>
        {props.title}
      </h2>
      {props.children}
    </section>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WelcomePage />
  </StrictMode>
)
