import { StrictMode, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type {
  BrowserSettings,
  ClearPeriod,
  DefaultBrowserStatus,
  ExtensionBarSettings,
  ExtensionInfo,
  GeneralSettings,
  ImportSource,
  PipSettings
} from '@shared/types'
import { orderExtensions } from '@shared/extensionBar'
import { EXTENSIONS_PAGE_URL, PASSWORDS_PAGE_URL } from '@shared/ipc'
import { PERMISSION_LABELS } from '../lib/permissions'
import { SEARCH_ENGINES, type SearchEngine } from '@shared/url'
import { callInternal } from './api'
import { SmallButton, Toggle } from './ui'
import '../styles.css'

/** zak://settings (CLAUDE.md §6.7). Every change is saved at once (no save button). */
function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<BrowserSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fail = (err: unknown): void => setError(String(err))

  useEffect(() => {
    callInternal('settings/get', null).then(setSettings).catch(fail)
  }, [])

  const update = (patch: Partial<BrowserSettings>): void => setSettings((s) => (s ? { ...s, ...patch } : s))

  const saveGeneral = (patch: Partial<GeneralSettings>): void => {
    if (settings) update({ general: { ...settings.general, ...patch } })
    callInternal('settings/setGeneral', patch)
      .then((general) => {
        update({ general })
        setError(null)
      })
      .catch(fail)
  }

  const savePip = (next: PipSettings): void => {
    update({ pip: next })
    callInternal('settings/setPip', next)
      .then((pip) => {
        update({ pip })
        setError(null)
      })
      .catch(fail)
  }

  if (!settings) {
    return (
      <main className="mx-auto max-w-[760px] px-6 py-10">
        {error && <p role="alert">{error}</p>}
      </main>
    )
  }
  const { general, pip } = settings

  return (
    <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="m-0 font-serif text-[34px] font-semibold text-cream-ink">Réglages</h1>
      </header>

      {error && (
        <p role="alert" className="m-0 rounded-[12px] bg-white/70 px-4 py-3 text-[13px] text-pink-button">
          {error}
        </p>
      )}

      <Section id="general" title="Général">
        <DefaultBrowser onError={fail} />
        <Row title="Moteur de recherche" detail="Utilisé par la barre d'adresse et la page Nouvel onglet.">
          <select
            aria-label="Moteur de recherche"
            value={general.searchEngine}
            onChange={(e) => saveGeneral({ searchEngine: e.target.value as SearchEngine })}
            className={selectClass}
          >
            {(Object.keys(SEARCH_ENGINES) as SearchEngine[]).map((key) => (
              <option key={key} value={key}>
                {SEARCH_ENGINES[key].label}
              </option>
            ))}
          </select>
        </Row>
        <Row title="Au démarrage">
          <select
            aria-label="Au démarrage"
            value={general.startup}
            onChange={(e) => saveGeneral({ startup: e.target.value as GeneralSettings['startup'] })}
            className={selectClass}
          >
            <option value="restore">Rouvrir les onglets de la dernière session</option>
            <option value="newtab">Ouvrir un nouvel onglet</option>
          </select>
        </Row>
        <Row title="Thème" detail="« Système » suit le mode clair ou sombre de l'ordinateur.">
          <div role="radiogroup" aria-label="Thème" className="flex rounded-[10px] border border-cream-edge bg-cream-2 p-0.5">
            {(
              [
                ['light', 'Clair'],
                ['dark', 'Sombre'],
                ['system', 'Système']
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={general.theme === value}
                onClick={() => saveGeneral({ theme: value })}
                className={`cursor-pointer rounded-[8px] border-0 px-3 py-1 text-[12.5px] font-semibold ${
                  general.theme === value ? 'bg-violet text-white' : 'bg-transparent text-sub hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
        <ImportFromBrowser onError={fail} />
        <ImportBookmarks onError={fail} />
        <Row
          title="Mettre en veille les onglets inactifs"
          detail="Libère la mémoire des onglets restés en arrière-plan. Ils se rechargent quand vous y revenez ; ceux qui jouent du son ou ont un formulaire en cours ne sont pas mis en veille."
        >
          <select
            aria-label="Mettre en veille les onglets inactifs"
            className={selectClass}
            value={general.sleepTabsAfter}
            onChange={(e) => saveGeneral({ sleepTabsAfter: Number(e.target.value) })}
          >
            <option value={0}>Jamais</option>
            <option value={15}>Après 15 minutes</option>
            <option value={30}>Après 30 minutes</option>
            <option value={60}>Après 1 heure</option>
            <option value={120}>Après 2 heures</option>
          </select>
        </Row>
        <Row title="Barre latérale réduite" detail="Icônes seules (⌘B).">
          <Toggle
            label="Barre latérale réduite"
            on={settings.sidebarCollapsed}
            onChange={(collapsed) => {
              update({ sidebarCollapsed: collapsed })
              callInternal('settings/setSidebarCollapsed', { collapsed }).catch(fail)
            }}
          />
        </Row>
      </Section>

      <ExtensionBar
        bar={settings.extensionBar}
        onChange={(extensionBar) => {
          update({ extensionBar })
          callInternal('settings/setExtensionBar', extensionBar)
            .then((saved) => update({ extensionBar: saved }))
            .catch(fail)
        }}
        onError={fail}
      />

      <Section id="downloads" title="Téléchargements">
        <Row title="Dossier de téléchargement" detail={general.downloadDir}>
          <SmallButton
            onClick={() =>
              callInternal('settings/chooseDownloadDir', null)
                .then((g) => update({ general: g }))
                .catch(fail)
            }
          >
            Modifier…
          </SmallButton>
        </Row>
      </Section>

      <Section
        id="pip"
        title="Lecteur vidéo flottant"
        intro="Quand vous quittez un onglet où une vidéo est en lecture, elle continue dans une petite fenêtre flottante, toujours au premier plan."
      >
        <Row title="Passer automatiquement en lecteur flottant" detail="Au changement d'onglet ou quand la fenêtre est réduite.">
          <Toggle label="Lecteur flottant automatique" on={pip.enabled} onChange={(enabled) => savePip({ ...pip, enabled })} />
        </Row>
        <Row title="Fermer le lecteur flottant au retour sur l'onglet">
          <Toggle label="Fermer au retour" on={pip.closeOnReturn} onChange={(closeOnReturn) => savePip({ ...pip, closeOnReturn })} />
        </Row>
        <Row title="Ignorer les vidéos muettes" detail="Par défaut, une vidéo sans le son passe aussi en lecteur flottant.">
          <Toggle label="Ignorer les vidéos muettes" on={pip.skipMuted} onChange={(skipMuted) => savePip({ ...pip, skipMuted })} />
        </Row>
        <ExcludedDomains domains={pip.excludedDomains} onChange={(excludedDomains) => savePip({ ...pip, excludedDomains })} />
      </Section>

      <Section id="passwords" title="Mots de passe">
        <Row title="Proposer d'enregistrer les mots de passe" detail="Après une connexion. Chiffrés avec le trousseau de votre ordinateur.">
          <Toggle label="Proposer d'enregistrer les mots de passe" on={general.savePasswords} onChange={(savePasswords) => saveGeneral({ savePasswords })} />
        </Row>
        <Row title="Mots de passe enregistrés" detail="Afficher, modifier, importer ou exporter (CSV de Chrome, Safari, Firefox, Bitwarden, 1Password…).">
          <a href={PASSWORDS_PAGE_URL} className="rounded-[10px] border border-cream-edge bg-cream-2 px-3 py-1 text-[12.5px] font-semibold text-violet no-underline hover:border-violet/40">
            Gérer
          </a>
        </Row>
      </Section>

      <Section id="security" title="Sécurité">
        <Row
          title="Protection contre les sites dangereux"
          detail="Avertit avant d'ouvrir un site d'hameçonnage ou de logiciels malveillants connu. Les listes (OpenPhish, PhishTank, URLhaus) sont vérifiées sur cet ordinateur : vos adresses ne sont envoyées à personne."
        >
          <Toggle label="Protection contre les sites dangereux" on={general.safeBrowsing} onChange={(safeBrowsing) => saveGeneral({ safeBrowsing })} />
        </Row>
      </Section>

      <Section id="permissions" title="Autorisations des sites" intro="Les réponses données aux demandes des sites, mémorisées par site.">
        {settings.permissions.length === 0 ? (
          <p className="m-0 border-t border-violet/10 py-3 text-[13px] text-sub">Aucune autorisation mémorisée.</p>
        ) : (
          <ul aria-label="Autorisations mémorisées" className="m-0 list-none p-0">
            {settings.permissions.map((p) => (
              <li key={`${p.origin} ${p.permission}`} className="flex items-center gap-3 border-t border-violet/10 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">{p.origin}</span>
                <span className="text-[13px] text-sub">{PERMISSION_LABELS[p.permission]}</span>
                <span className={`w-[70px] text-[12.5px] font-semibold ${p.granted ? 'text-violet' : 'text-pink-button'}`}>
                  {p.granted ? 'Autorisé' : 'Bloqué'}
                </span>
                <SmallButton
                  onClick={() =>
                    callInternal('settings/removePermission', { origin: p.origin, permission: p.permission })
                      .then((permissions) => update({ permissions }))
                      .catch(fail)
                  }
                >
                  Oublier
                </SmallButton>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ClearData onError={fail} />
    </main>
  )
}

const selectClass = 'max-w-[300px] rounded-[10px] border border-cream-edge bg-cream-2 px-2 py-1.5 text-[13px] text-cream-ink'

function Section(props: { id: string; title: string; intro?: string; children: ReactNode }): JSX.Element {
  return (
    <section aria-labelledby={`${props.id}-title`} className="glass-card flex flex-col rounded-[18px] px-5 py-4">
      <h2 id={`${props.id}-title`} className="m-0 text-[15px] font-bold text-title">
        {props.title}
      </h2>
      {props.intro && <p className="m-0 mt-1 mb-2 text-[13px] text-sub">{props.intro}</p>}
      {!props.intro && <div className="h-2" />}
      {props.children}
    </section>
  )
}

/** Which extension icons the sidebar shows, and in what order (top of the sidebar, left to right). */
function ExtensionBar(props: {
  bar: ExtensionBarSettings
  onChange: (bar: ExtensionBarSettings) => void
  onError: (err: unknown) => void
}): JSX.Element {
  const [extensions, setExtensions] = useState<ExtensionInfo[] | null>(null)
  const { onError } = props

  useEffect(() => {
    callInternal('settings/listExtensions', null)
      .then((list) => setExtensions(list.filter((e) => e.enabled)))
      .catch(onError)
    // Once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ordered = extensions ? orderExtensions(extensions, props.bar) : []
  const ids = ordered.map((e) => e.id)

  const move = (index: number, delta: number): void => {
    const next = [...ids]
    const [id] = next.splice(index, 1)
    next.splice(index + delta, 0, id!)
    props.onChange({ ...props.bar, order: next })
  }
  const setShown = (id: string, shown: boolean): void => {
    const hidden = props.bar.hidden.filter((h) => h !== id)
    props.onChange({ order: ids, hidden: shown ? hidden : [...hidden, id] })
  }

  return (
    <Section
      id="extension-bar"
      title="Extensions dans la barre latérale"
      intro="Choisis les icônes d'extensions affichées en haut de la barre latérale, et leur ordre (de gauche à droite)."
    >
      {extensions && extensions.length === 0 && (
        <p className="m-0 border-t border-violet/10 py-3 text-[13px] text-sub">
          Aucune extension active.{' '}
          <a href={EXTENSIONS_PAGE_URL} className="font-semibold text-violet">
            Gérer les extensions
          </a>
        </p>
      )}
      <ol className="m-0 flex list-none flex-col p-0" data-testid="extension-bar-list">
        {ordered.map((ext, index) => {
          const shown = !props.bar.hidden.includes(ext.id)
          return (
            <li
              key={ext.id}
              data-testid="extension-bar-item"
              data-extension-id={ext.id}
              className="flex items-center gap-3 border-t border-violet/10 py-2.5"
            >
              {ext.icon ? (
                <img src={ext.icon} alt="" className={`size-6 shrink-0 rounded ${shown ? '' : 'opacity-40'}`} />
              ) : (
                <span className="size-6 shrink-0 rounded bg-cream-edge" />
              )}
              <span className={`min-w-0 flex-1 truncate text-[13.5px] font-semibold ${shown ? 'text-ink' : 'text-sub'}`}>
                {ext.name}
              </span>
              <div className="flex shrink-0 gap-1">
                <ArrowButton label={`Monter ${ext.name}`} disabled={index === 0} onClick={() => move(index, -1)}>
                  ↑
                </ArrowButton>
                <ArrowButton
                  label={`Descendre ${ext.name}`}
                  disabled={index === ordered.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </ArrowButton>
              </div>
              <Toggle label={`Afficher ${ext.name} dans la barre latérale`} on={shown} onChange={(on) => setShown(ext.id, on)} />
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

function ArrowButton(props: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="grid size-7 cursor-pointer place-items-center rounded-[8px] border border-cream-edge bg-cream-2 text-[13px] text-violet hover:border-violet/40 disabled:cursor-default disabled:opacity-35 disabled:hover:border-cream-edge"
    >
      {props.children}
    </button>
  )
}

function ImportBookmarks({ onError }: { onError: (err: unknown) => void }): JSX.Element {
  const [result, setResult] = useState<string | null>(null)
  const run = (): void => {
    setResult(null)
    callInternal('settings/importBookmarks', null)
      .then((r) => {
        if (r)
          setResult(
            r.favorites === 0
              ? 'Rien de nouveau à importer.'
              : `${r.favorites} favori${r.favorites > 1 ? 's' : ''} importé${r.favorites > 1 ? 's' : ''}` +
                  (r.folders > 0 ? `, ${r.folders} dossier${r.folders > 1 ? 's' : ''}.` : '.')
          )
      })
      .catch(onError)
  }
  return (
    <Row
      title="Importer des favoris"
      detail={result ?? 'Depuis le fichier HTML exporté par Chrome, Arc, Firefox ou Safari.'}
    >
      <SmallButton onClick={run}>Choisir le fichier…</SmallButton>
    </Row>
  )
}

const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`

/** Favorites and history of Chrome, Edge, Brave, Arc… read from their profile on this computer. */
function ImportFromBrowser({ onError }: { onError: (err: unknown) => void }): JSX.Element | null {
  const [sources, setSources] = useState<ImportSource[] | null>(null)
  const [profile, setProfile] = useState('')
  const [bookmarks, setBookmarks] = useState(true)
  const [withHistory, setWithHistory] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    callInternal('settings/importSources', null)
      .then((found) => {
        setSources(found)
        setProfile(found[0]?.profiles[0]?.path ?? '')
      })
      .catch(() => setSources([]))
  }, [])

  if (!sources || sources.length === 0) return null
  const run = (): void => {
    setBusy(true)
    setResult(null)
    callInternal('settings/importFrom', { profile, bookmarks, history: withHistory })
      .then((r) => {
        const parts = [
          bookmarks && plural(r.favorites, 'favori'),
          bookmarks && r.folders > 0 && plural(r.folders, 'dossier'),
          withHistory && `${plural(r.pages, 'page')} d'historique`
        ].filter(Boolean)
        setResult(`Importé : ${parts.join(', ')}.`)
      })
      .catch(onError)
      .finally(() => setBusy(false))
  }
  return (
    <Row
      title="Importer depuis un autre navigateur"
      detail={result ?? 'Lu directement sur cet ordinateur. Les mots de passe s\'importent depuis un fichier CSV (section Mots de passe ci-dessous).'}
    >
      <div className="flex flex-col items-end gap-2">
        <select aria-label="Navigateur à importer" className={selectClass} value={profile} onChange={(e) => setProfile(e.target.value)}>
          {sources.map((s) =>
            s.profiles.map((p) => (
              <option key={p.path} value={p.path}>
                {s.profiles.length > 1 ? `${s.browser} — ${p.name}` : s.browser}
              </option>
            ))
          )}
        </select>
        <div className="flex items-center gap-3 text-[13px] text-ink">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={bookmarks} onChange={(e) => setBookmarks(e.target.checked)} /> Favoris
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={withHistory} onChange={(e) => setWithHistory(e.target.checked)} /> Historique
          </label>
          <SmallButton onClick={run} disabled={busy || (!bookmarks && !withHistory)}>
            {busy ? 'Import…' : 'Importer'}
          </SmallButton>
        </div>
      </div>
    </Row>
  )
}

/** « Navigateur par défaut »: the system confirms (macOS dialog, Windows settings), so re-check on return. */
function DefaultBrowser({ onError }: { onError: (err: unknown) => void }): JSX.Element {
  const [status, setStatus] = useState<DefaultBrowserStatus | null>(null)

  useEffect(() => {
    const refresh = (): void => void callInternal('settings/defaultBrowser', null).then(setStatus).catch(onError)
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
    // Once: `onError` is a new function at each render of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const detail =
    status === 'default'
      ? 'Les liens ouverts depuis les autres applications arrivent dans Zak.'
      : status === 'unavailable'
        ? "Disponible dans l'application installée, pas en mode développement."
        : 'Ouvrir dans Zak les liens cliqués dans les autres applications.'

  return (
    <Row title="Navigateur par défaut" detail={detail}>
      {status === 'other' && (
        <SmallButton onClick={() => void callInternal('settings/makeDefaultBrowser', null).then(setStatus).catch(onError)}>
          Définir par défaut
        </SmallButton>
      )}
      {status === 'default' && <span className="text-[12.5px] font-semibold text-violet">✓ Par défaut</span>}
    </Row>
  )
}

function ClearData({ onError }: { onError: (err: unknown) => void }): JSX.Element {
  const [period, setPeriod] = useState<ClearPeriod>('hour')
  const [history, setHistory] = useState(true)
  const [siteData, setSiteData] = useState(false)
  const [cache, setCache] = useState(true)
  const [done, setDone] = useState(false)

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    setDone(false)
    callInternal('settings/clearData', { period, history, siteData, cache })
      .then(() => setDone(true))
      .catch(onError)
  }

  const check = (label: string, on: boolean, set: (v: boolean) => void): JSX.Element => (
    <label className="flex items-center gap-2 text-[13.5px] text-ink">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="size-4 accent-violet" />
      {label}
    </label>
  )

  return (
    <Section id="clear" title="Effacer les données de navigation">
      <form onSubmit={submit} className="flex flex-col gap-3 border-t border-violet/10 pt-3">
        <label className="flex items-center gap-3 text-[13.5px] font-semibold text-ink">
          Période
          <select value={period} onChange={(e) => setPeriod(e.target.value as ClearPeriod)} className={selectClass}>
            <option value="hour">Dernière heure</option>
            <option value="day">Dernières 24 heures</option>
            <option value="week">7 derniers jours</option>
            <option value="month">4 dernières semaines</option>
            <option value="all">Toutes les périodes</option>
          </select>
        </label>
        {check('Historique de navigation', history, setHistory)}
        {check('Cookies et données de sites (toutes périodes, vous serez déconnecté)', siteData, setSiteData)}
        {check('Images et fichiers en cache (toutes périodes)', cache, setCache)}
        <div className="flex items-center gap-3">
          <SmallButton danger submit>
            Effacer les données
          </SmallButton>
          {done && <span className="text-[13px] text-sub">Données effacées.</span>}
        </div>
      </form>
    </Section>
  )
}

function Row(props: { title: string; detail?: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-4 border-t border-violet/10 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink">{props.title}</div>
        {props.detail && <div className="text-[12.5px] text-sub">{props.detail}</div>}
      </div>
      {props.children}
    </div>
  )
}

function ExcludedDomains(props: { domains: string[]; onChange: (domains: string[]) => void }): JSX.Element {
  const [draft, setDraft] = useState('')

  const add = (e: FormEvent): void => {
    e.preventDefault()
    if (draft.trim() === '') return
    // Main normalizes (URL → domain, www. removed) and drops what isn't a domain.
    props.onChange([...props.domains, draft])
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-2 border-t border-violet/10 pt-3">
      <div>
        <div className="text-[13.5px] font-semibold text-ink">Sites exclus</div>
        <div className="text-[12.5px] text-sub">Jamais de lecteur flottant sur ces sites (sous-domaines compris).</div>
      </div>
      {props.domains.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Sites exclus">
          {props.domains.map((domain) => (
            <li
              key={domain}
              className="flex items-center gap-1.5 rounded-full border border-cream-edge bg-cream-2 py-1 pr-1 pl-3 font-mono text-[12px] text-ink"
            >
              {domain}
              <button
                type="button"
                aria-label={`Retirer ${domain}`}
                onClick={() => props.onChange(props.domains.filter((d) => d !== domain))}
                className="grid size-5 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-sub hover:bg-violet/10 hover:text-ink"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="exemple.com"
          aria-label="Site à exclure"
          className="min-w-0 flex-1 rounded-[10px] border border-cream-edge bg-cream-2 px-3 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-pink"
        />
        <SmallButton submit>Ajouter</SmallButton>
      </form>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsPage />
  </StrictMode>
)
