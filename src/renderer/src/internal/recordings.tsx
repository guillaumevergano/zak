import '../lib/lang'
import { StrictMode, useCallback, useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { formatDuration, type RecordingInfo, type RecordingsPageState } from '@shared/recordings'
import { callInternal } from './api'
import { SmallButton, Toggle } from './ui'
import '../styles.css'
import { locale, t } from '@shared/i18n'

const isMac = navigator.platform.startsWith('Mac')

const sizeOf = (bytes: number): string => {
  const [value, unit] = bytes >= 1e9 ? [bytes / 1e9, 'gigabyte'] : bytes >= 1e6 ? [bytes / 1e6, 'megabyte'] : [Math.max(1, bytes / 1e3), 'kilobyte']
  return new Intl.NumberFormat(locale(), { style: 'unit', unit, maximumFractionDigits: 1 }).format(value)
}

const dateOf = (time: number): string =>
  new Date(time).toLocaleString(locale(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * zak://recordings (CLAUDE.md §6.8): the screen recordings made with Zak, à la Loom: watch one,
 * share it by a link (the user's own Google Drive), copy the link again, stop sharing. Google
 * Drive is connected (and the sharing set up) here.
 */
function RecordingsPage(): JSX.Element {
  const [state, setState] = useState<RecordingsPageState | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const fail = (err: unknown): void => setError(String(err instanceof Error ? err.message : err).replace(/^Error: /, ''))

  const refresh = useCallback(() => {
    callInternal('recordings/state', null).then(setState).catch(fail)
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  // Uploads under way: follow them.
  const uploading = state?.recordings.some((r) => r.share.state === 'uploading') ?? false
  useEffect(() => {
    if (!uploading) return
    const timer = setInterval(refresh, 700)
    return () => clearInterval(timer)
  }, [uploading, refresh])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  const run = (promise: Promise<unknown>, done?: string): void => {
    setError(null)
    promise
      .then(() => {
        if (done) setNotice(done)
        refresh()
      })
      .catch(fail)
  }
  const setOptions = (patch: Parameters<typeof callInternal<'recordings/setOptions'>>[1]): void =>
    void callInternal('recordings/setOptions', patch).then(setState).catch(fail)

  const connect = (): void => {
    setConnecting(true)
    setError(null)
    callInternal('recordings/connect', null)
      .then(() => {
        setNotice(t('Google Drive est connecté.'))
        refresh()
      })
      .catch(fail)
      .finally(() => setConnecting(false))
  }

  return (
    <main className="mx-auto flex max-w-[1040px] flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="m-0 font-serif text-[34px] font-semibold text-cream-ink">{t('Enregistrements')}</h1>
        <button
          type="button"
          onClick={() => run(callInternal('recordings/record', null))}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-full border-0 bg-pink-button px-5 text-[14px] font-semibold text-white hover:bg-pink"
        >
          <span aria-hidden className="size-2.5 rounded-full bg-white" />
          {t('Nouvel enregistrement')}
          <kbd className="font-sans text-[12px] opacity-80">{isMac ? '⌘⇧E' : t('Ctrl+Maj+E')}</kbd>
        </button>
      </header>

      {(notice || error) && (
        <p role={error ? 'alert' : 'status'} className={`m-0 rounded-[12px] bg-white/70 px-4 py-3 text-[13px] ${error ? 'text-pink-button' : 'text-ink'}`}>
          {error ?? notice}
        </p>
      )}

      {state && <DriveCard state={state} connecting={connecting} onConnect={connect} setOptions={setOptions} run={run} />}

      <section aria-labelledby="list" className="flex flex-col gap-3">
        <h2 id="list" className="m-0 text-[17px] font-bold text-cream-ink">
          {t('Vos vidéos')} <span className="text-[13px] font-normal text-cream-sub">{state?.recordings.length || ''}</span>
        </h2>
        {state && state.recordings.length === 0 && (
          <p className="m-0 rounded-[16px] border border-dashed border-cream-edge px-6 py-10 text-center text-[14px] text-cream-sub">
            {t('Aucun enregistrement. Enregistrez votre écran avec votre caméra et votre micro, puis partagez la vidéo par un simple lien.')}
          </p>
        )}
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 p-0">
          {state?.recordings.map((rec) => (
            <RecordingCard key={rec.id} rec={rec} driveReady={state.drive.configured} run={run} />
          ))}
        </ul>
      </section>
    </main>
  )
}

function DriveCard(props: {
  state: RecordingsPageState
  connecting: boolean
  onConnect: () => void
  setOptions: (patch: { autoShare?: boolean; publicLink?: boolean; driveClientId?: string; driveClientSecret?: string }) => void
  run: (promise: Promise<unknown>, done?: string) => void
}): JSX.Element {
  const { drive } = props.state
  const [editingClient, setEditingClient] = useState(false)
  return (
    <section aria-labelledby="drive" className="glass-card flex flex-col gap-3 rounded-[18px] px-5 py-4" data-testid="drive-card">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-white" aria-hidden>
          <DriveLogo />
        </div>
        <div className="min-w-[220px] flex-1">
          <h2 id="drive" className="m-0 text-[15px] font-bold text-title">
            {t('Partage par Google Drive')}
          </h2>
          <p className="m-0 text-[13px] text-sub" data-testid="drive-status">
            {!drive.configured
              ? t('À configurer une fois : Zak a besoin d’un identifiant client Google (voir ci-dessous).')
              : drive.connected
                ? t('Connecté à {email}. Les vidéos partagées vont dans le dossier « Zak » de votre Drive.', { email: drive.email ?? t('votre compte') })
                : t('Connectez votre Google Drive : chaque vidéo partagée y est envoyée et son lien copié. Zak ne voit que les fichiers qu’il y a mis.')}
          </p>
        </div>
        {drive.configured &&
          (drive.connected ? (
            <SmallButton onClick={() => props.run(callInternal('recordings/disconnect', null), t('Google Drive est déconnecté.'))}>{t('Déconnecter')}</SmallButton>
          ) : (
            <SmallButton danger disabled={props.connecting} onClick={props.onConnect}>
              {props.connecting ? t('Connexion dans l’onglet ouvert…') : t('Connecter Google Drive')}
            </SmallButton>
          ))}
      </div>

      {drive.connected && (
        <div className="flex flex-col gap-2 border-t border-violet/10 pt-3">
          <OptionRow
            label={t('Partager automatiquement chaque enregistrement')}
            hint={t('Dès la fin d’un enregistrement, la vidéo part sur Drive et son lien est copié.')}
            on={props.state.autoShare}
            onChange={(autoShare) => props.setOptions({ autoShare })}
          />
          <OptionRow
            label={t('Toute personne ayant le lien peut regarder')}
            hint={t('Sinon, la vidéo reste privée dans votre Drive : vous choisissez avec qui la partager dans Drive.')}
            on={props.state.publicLink}
            onChange={(publicLink) => props.setOptions({ publicLink })}
          />
        </div>
      )}

      {(!drive.configured || drive.ownClient || editingClient) && (
        <ClientForm
          ownClient={drive.ownClient}
          onSave={(driveClientId, driveClientSecret) => {
            props.setOptions({ driveClientId, driveClientSecret })
            setEditingClient(false)
          }}
        />
      )}
      {drive.configured && !drive.ownClient && !editingClient && !drive.connected && (
        <button type="button" onClick={() => setEditingClient(true)} className="w-fit border-0 bg-transparent p-0 text-[12px] font-semibold text-violet">
          {t('Utiliser mon propre identifiant client Google')}
        </button>
      )}
    </section>
  )
}

function OptionRow(props: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void }): JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13.5px] font-semibold text-ink">{props.label}</p>
        <p className="m-0 text-[12.5px] text-sub">{props.hint}</p>
      </div>
      <Toggle label={props.label} on={props.on} onChange={props.onChange} />
    </div>
  )
}

/** A Google OAuth client of one's own (« Desktop app »), when the build has none (docs/DRIVE.md). */
function ClientForm(props: { ownClient: boolean; onSave: (id: string, secret: string) => void }): JSX.Element {
  const [id, setId] = useState('')
  const [secret, setSecret] = useState('')
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    props.onSave(id.trim(), secret.trim())
  }
  const field = 'h-9 min-w-0 flex-1 rounded-[10px] border border-cream-edge bg-white px-3 font-mono text-[12.5px] text-cream-ink outline-none focus:border-pink'
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-t border-violet/10 pt-3" aria-label={t('Identifiant client Google')}>
      <p className="m-0 text-[12.5px] text-sub">
        {props.ownClient
          ? t('Zak utilise votre propre identifiant client Google. Laissez vide et enregistrez pour revenir à celui de Zak.')
          : t('Dans console.cloud.google.com : un projet, l’API Google Drive activée, un écran de consentement, puis Identifiants → « ID client OAuth » de type « Application de bureau ». Collez ici l’ID client et le code secret.')}
      </p>
      <div className="flex flex-wrap gap-2">
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="1234-abcd.apps.googleusercontent.com" aria-label={t('ID client')} className={field} />
        <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="GOCSPX-…" aria-label={t('Code secret du client')} type="password" className={field} />
        <SmallButton submit>{t('Enregistrer')}</SmallButton>
      </div>
    </form>
  )
}

function RecordingCard({ rec, driveReady, run }: { rec: RecordingInfo; driveReady: boolean; run: (promise: Promise<unknown>, done?: string) => void }): JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const { share } = rec
  return (
    <li data-testid="recording" data-share={share.state} className="glass-card flex flex-col overflow-hidden rounded-[16px]">
      <button
        type="button"
        disabled={!rec.exists}
        onClick={() => run(callInternal('recordings/play', { id: rec.id }))}
        title={rec.exists ? t('Regarder') : t('Le fichier n’est plus là.')}
        className="group relative aspect-video w-full cursor-pointer overflow-hidden border-0 bg-frame p-0 disabled:cursor-default"
      >
        {rec.thumbnail && <img src={rec.thumbnail} alt="" className={`size-full object-cover ${rec.exists ? '' : 'opacity-40'}`} />}
        {rec.exists && (
          <span className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/25" aria-hidden>
            <span className="grid size-12 place-items-center rounded-full bg-white/90 text-[18px] text-frame opacity-0 transition-opacity group-hover:opacity-100">▶</span>
          </span>
        )}
        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">{formatDuration(rec.duration)}</span>
      </button>
      <div className="flex flex-col gap-2 px-3.5 py-3">
        <div className="min-w-0">
          <p className="m-0 truncate text-[13.5px] font-semibold text-cream-ink" title={rec.name}>
            {rec.name}
          </p>
          <p className="m-0 text-[12px] text-cream-sub">
            {dateOf(rec.createdAt)}
            {rec.exists ? ` · ${sizeOf(rec.size)}` : ` · ${t('Fichier supprimé')}`}
          </p>
        </div>

        {share.state === 'uploading' ? (
          <div className="flex h-8 items-center gap-2" role="status">
            <span className="text-[12px] font-semibold text-sub">{t('Envoi sur Google Drive…')}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
              <span className="block h-full rounded-full bg-pink" style={{ width: `${Math.round(share.progress * 100)}%` }} />
            </span>
            <span className="w-9 text-right font-mono text-[11px] text-sub">{Math.round(share.progress * 100)} %</span>
          </div>
        ) : share.state === 'done' && share.link ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <SmallButton onClick={() => run(callInternal('recordings/copyLink', { id: rec.id }), t('Lien copié.'))}>{t('Copier le lien')}</SmallButton>
            <a href={share.link} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold text-violet">
              {t('Ouvrir dans Drive')}
            </a>
            <span className="flex-1" />
            <SmallButton onClick={() => run(callInternal('recordings/unshare', { id: rec.id }), t('La vidéo n’est plus partagée.'))}>{t('Ne plus partager')}</SmallButton>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {share.state === 'error' && (
              <p className="m-0 text-[12px] text-pink-button" role="alert">
                {share.error}
              </p>
            )}
            <SmallButton danger disabled={!rec.exists || !driveReady} onClick={() => run(callInternal('recordings/share', { id: rec.id }))}>
              {share.state === 'error' ? t('Réessayer') : t('Partager un lien (Google Drive)')}
            </SmallButton>
          </div>
        )}

        <div className="flex items-center gap-1.5 border-t border-violet/10 pt-2">
          {rec.exists && (
            <SmallButton onClick={() => run(callInternal('recordings/reveal', { id: rec.id }))}>
              {isMac ? t('Afficher dans le Finder') : t('Afficher dans le dossier')}
            </SmallButton>
          )}
          <span className="flex-1" />
          {confirming ? (
            <>
              {rec.share.link && (
                <SmallButton danger onClick={() => run(callInternal('recordings/remove', { id: rec.id, fromDrive: true }))}>
                  {t('Retirer, et de Drive')}
                </SmallButton>
              )}
              <SmallButton onClick={() => run(callInternal('recordings/remove', { id: rec.id, fromDrive: false }))}>{t('Retirer de la liste')}</SmallButton>
              <SmallButton onClick={() => setConfirming(false)}>{t('Annuler')}</SmallButton>
            </>
          ) : (
            <SmallButton onClick={() => setConfirming(true)}>{t('Retirer')}</SmallButton>
          )}
        </div>
      </div>
    </li>
  )
}

const DriveLogo = (): JSX.Element => (
  <svg viewBox="0 0 87.3 78" width="26" height="24" aria-hidden>
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
    <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9 9 0 0 0 0 53h27.5z" fill="#00ac47" />
    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" fill="#ea4335" />
    <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
    <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
    <path d="M73.4 26.5 60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
  </svg>
)

document.title = t('Enregistrements')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RecordingsPage />
  </StrictMode>
)
