import { StrictMode, useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { SavedLogin } from '@shared/types'
import { callInternal } from './api'
import { SmallButton } from './ui'
import '../styles.css'

const hostOf = (origin: string): string => origin.replace(/^https?:\/\//, '').replace(/^www\./, '')

const inputClass =
  'h-9 min-w-0 rounded-[10px] border border-cream-edge bg-cream-2 px-3 text-[13.5px] text-cream-ink outline-none focus:border-pink'

/**
 * zak://passwords: the saved passwords (src/main/passwords/). Showing or copying one asks for
 * Touch ID on a Mac; import and export use the CSV format of every browser.
 */
function PasswordsPage(): JSX.Element {
  const [logins, setLogins] = useState<SavedLogin[] | null>(null)
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fail = (err: unknown): void => setError(String(err instanceof Error ? err.message : err))

  useEffect(() => {
    callInternal('passwords/list', null).then(setLogins).catch(fail)
  }, [])

  const reveal = async (id: string): Promise<string | null> => {
    if (shown[id] !== undefined) return shown[id]!
    const password = await callInternal('passwords/reveal', { id })
    if (password === null) setNotice('Déverrouillage refusé.')
    return password
  }
  const toggle = (id: string): void => {
    if (shown[id] !== undefined) {
      setShown(({ [id]: _hidden, ...rest }) => rest)
      return
    }
    reveal(id)
      .then((password) => password !== null && setShown((s) => ({ ...s, [id]: password })))
      .catch(fail)
  }
  const copy = (id: string): void => {
    reveal(id)
      .then(async (password) => {
        if (password === null) return
        await navigator.clipboard.writeText(password)
        setNotice('Mot de passe copié.')
      })
      .catch(fail)
  }
  const remove = (login: SavedLogin): void => {
    callInternal('passwords/remove', { id: login.id })
      .then((list) => {
        setLogins(list)
        setNotice(`Mot de passe de ${hostOf(login.origin)} supprimé.`)
      })
      .catch(fail)
  }

  const q = query.trim().toLowerCase()
  const visible = (logins ?? []).filter((l) => !q || l.origin.toLowerCase().includes(q) || l.username.toLowerCase().includes(q))

  return (
    <main className="mx-auto flex max-w-[820px] flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="m-0 font-serif text-[34px] font-semibold text-cream-ink">Mots de passe</h1>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un site ou un identifiant"
          aria-label="Rechercher un mot de passe"
          autoFocus
          className="h-10 w-[320px] max-w-full rounded-full border border-cream-edge bg-cream-2 px-4 text-[14px] text-cream-ink outline-none focus:border-pink"
        />
      </header>

      <section className="glass-card flex flex-wrap items-center gap-3 rounded-[16px] px-5 py-3">
        <span className="min-w-[220px] flex-1 text-[13px] text-sub">
          Chiffrés avec le trousseau de votre ordinateur. Zak les propose sous les champs de connexion des sites.
        </span>
        <SmallButton onClick={() => setAdding(true)}>Ajouter</SmallButton>
        <SmallButton
          onClick={() =>
            callInternal('passwords/import', null)
              .then(async (r) => {
                if (!r) return
                setLogins(await callInternal('passwords/list', null))
                setNotice(`${r.count} mot${r.count > 1 ? 's' : ''} de passe importé${r.count > 1 ? 's' : ''}.`)
              })
              .catch(fail)
          }
        >
          Importer (CSV)
        </SmallButton>
        <SmallButton
          onClick={() =>
            callInternal('passwords/export', null)
              .then((r) => r && setNotice(`${r.count} mot${r.count > 1 ? 's' : ''} de passe exporté${r.count > 1 ? 's' : ''}. Ce fichier n'est pas chiffré : supprimez-le après usage.`))
              .catch(fail)
          }
        >
          Exporter
        </SmallButton>
      </section>

      {(notice || error) && (
        <p role={error ? 'alert' : 'status'} className={`m-0 rounded-[12px] bg-white/70 px-4 py-3 text-[13px] ${error ? 'text-pink-button' : 'text-ink'}`}>
          {error ?? notice}
        </p>
      )}

      {adding && (
        <LoginForm
          title="Nouveau mot de passe"
          onCancel={() => setAdding(false)}
          onSave={(url, username, password) =>
            callInternal('passwords/add', { url, username, password })
              .then((list) => {
                setLogins(list)
                setAdding(false)
                setError(null)
              })
              .catch(fail)
          }
        />
      )}

      {logins && visible.length === 0 && (
        <p className="m-0 py-10 text-center text-[14px] text-cream-sub">
          {q ? 'Aucun résultat.' : 'Aucun mot de passe enregistré. Zak vous proposera de les enregistrer quand vous vous connecterez à un site.'}
        </p>
      )}

      <ul className="m-0 flex list-none flex-col p-0" aria-label="Mots de passe enregistrés">
        {visible.map((login) =>
          editing === login.id ? (
            <li key={login.id}>
              <LoginForm
                title={hostOf(login.origin)}
                initial={{ url: login.origin, username: login.username, password: shown[login.id] ?? '' }}
                fixedUrl
                onCancel={() => setEditing(null)}
                onSave={(_url, username, password) =>
                  callInternal('passwords/update', { id: login.id, username, ...(password ? { password } : {}) })
                    .then((list) => {
                      setLogins(list)
                      setEditing(null)
                      setShown(({ [login.id]: _old, ...rest }) => rest)
                    })
                    .catch(fail)
                }
              />
            </li>
          ) : (
            <li
              key={login.id}
              data-testid="password-row"
              className="group flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-cream-2"
            >
              <span className="w-[34%] min-w-0 truncate text-[14px] font-semibold text-cream-ink" title={login.origin}>
                {hostOf(login.origin)}
              </span>
              <span className="w-[28%] min-w-0 truncate text-[13.5px] text-cream-sub">{login.username || '—'}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-cream-ink" data-testid="password-value">
                {shown[login.id] ?? '••••••••'}
              </span>
              <span className="flex shrink-0 gap-1">
                <IconButton label={shown[login.id] !== undefined ? 'Masquer' : 'Afficher'} onClick={() => toggle(login.id)}>
                  {shown[login.id] !== undefined ? '🙈' : '👁'}
                </IconButton>
                <IconButton label="Copier le mot de passe" onClick={() => copy(login.id)}>
                  ⧉
                </IconButton>
                <IconButton label="Modifier" onClick={() => setEditing(login.id)}>
                  ✎
                </IconButton>
                <IconButton label="Supprimer" onClick={() => remove(login)}>
                  ✕
                </IconButton>
              </span>
            </li>
          )
        )}
      </ul>
    </main>
  )
}

function IconButton(props: { label: string; onClick: () => void; children: string }): JSX.Element {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      className="grid size-8 cursor-pointer place-items-center rounded-[8px] border-0 bg-transparent text-[14px] text-cream-sub hover:bg-cream-edge hover:text-cream-ink"
    >
      {props.children}
    </button>
  )
}

function LoginForm(props: {
  title: string
  initial?: { url: string; username: string; password: string }
  fixedUrl?: boolean
  onSave: (url: string, username: string, password: string) => void
  onCancel: () => void
}): JSX.Element {
  const [url, setUrl] = useState(props.initial?.url ?? '')
  const [username, setUsername] = useState(props.initial?.username ?? '')
  const [password, setPassword] = useState(props.initial?.password ?? '')
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    props.onSave(url, username, password)
  }
  return (
    <form onSubmit={submit} className="glass-card flex flex-col gap-3 rounded-[16px] p-4" aria-label={props.title}>
      <strong className="text-[14px] text-ink">{props.title}</strong>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
        {!props.fixedUrl && (
          <input required aria-label="Site" placeholder="Site (exemple.com)" value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} />
        )}
        <input aria-label="Identifiant" placeholder="Identifiant" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
        <input
          aria-label="Mot de passe"
          placeholder={props.fixedUrl ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe'}
          type="password"
          required={!props.fixedUrl}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex justify-end gap-2">
        <SmallButton onClick={props.onCancel}>Annuler</SmallButton>
        <SmallButton submit danger>
          Enregistrer
        </SmallButton>
      </div>
    </form>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PasswordsPage />
  </StrictMode>
)
