import '../lib/lang'
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { DownloadAction, DownloadInfo } from '@shared/types'
import { callInternal } from './api'
import { SmallButton } from './ui'
import { downloadStatus, isActive } from '../lib/downloads'
import '../styles.css'
import { locale, t } from '@shared/i18n'

const PAGE_SIZE = 100

const dayLabel = (time: number): string => {
  const day = new Date(time)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  const same = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString()
  if (same(day, today)) return t("Aujourd'hui")
  if (same(day, yesterday)) return t('Hier')
  return day.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * zak://downloads (CLAUDE.md §6.7), like chrome://downloads: every download kept by date, with
 * search, open / show in folder / retry / remove, « Tout effacer » (the files stay on disk).
 * Cmd+Shift+J on macOS, Ctrl+J elsewhere. A private window lists its own downloads only.
 */
function DownloadsPage(): JSX.Element {
  const [query, setQuery] = useState('')
  const [downloads, setDownloads] = useState<DownloadInfo[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryRef = useRef(query)
  queryRef.current = query

  const fail = (err: unknown): void => setError(String(err))

  /** First page again (after a change, a search, or while downloads progress). */
  const refresh = useCallback(() => {
    callInternal('downloads/list', { query: queryRef.current, before: null })
      .then((page) => {
        // Keep the older pages already shown.
        setDownloads((current) => {
          const older = (current ?? []).filter((d) => page.length === PAGE_SIZE && d.startedAt < page[page.length - 1]!.startedAt)
          return [...page, ...older]
        })
        setMore((m) => m || page.length === PAGE_SIZE)
        setError(null)
      })
      .catch(fail)
  }, [])

  useEffect(() => {
    setDownloads(null)
    setMore(false)
    const timer = setTimeout(refresh, 120)
    return () => clearTimeout(timer)
  }, [query, refresh])

  // Live progress while something downloads; and fresh state when coming back to the tab.
  const running = downloads?.some(isActive) ?? false
  useEffect(() => {
    if (!running) return
    const timer = setInterval(refresh, 1000)
    return () => clearInterval(timer)
  }, [running, refresh])
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const loadMore = (): void => {
    const last = downloads?.[downloads.length - 1]
    if (!last) return
    callInternal('downloads/list', { query, before: last.startedAt })
      .then((page) => {
        setDownloads((current) => [...(current ?? []), ...page])
        setMore(page.length === PAGE_SIZE)
      })
      .catch(fail)
  }

  const act = (d: DownloadInfo, action: DownloadAction): void => {
    if (action === 'remove') setDownloads((current) => current?.filter((x) => x.id !== d.id) ?? null)
    callInternal('downloads/action', { id: d.id, action })
      // A retry starts a new download: give it a moment to appear.
      .then(() => setTimeout(refresh, action === 'retry' || action === 'keep' ? 300 : 0))
      .catch(fail)
  }

  const clear = (): void => {
    callInternal('downloads/clear', null).then(refresh).catch(fail)
  }

  const groups: { label: string; items: DownloadInfo[] }[] = []
  for (const d of downloads ?? []) {
    const label = dayLabel(d.startedAt)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(d)
    else groups.push({ label, items: [d] })
  }

  return (
    <main className="mx-auto flex max-w-[820px] flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="m-0 font-serif text-[34px] font-semibold text-cream-ink">{t('Téléchargements')}</h1>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Rechercher dans les téléchargements')}
          aria-label={t('Rechercher dans les téléchargements')}
          autoFocus
          className="h-10 w-[320px] max-w-full rounded-full border border-cream-edge bg-cream-2 px-4 text-[14px] text-cream-ink outline-none focus:border-pink"
        />
      </header>

      <section className="glass-card flex flex-wrap items-center gap-3 rounded-[16px] px-5 py-3">
        <span className="flex-1 text-[13.5px] text-ink">{t('Les fichiers restent sur votre ordinateur quand vous les retirez de la liste.')}</span>
        <SmallButton onClick={() => void callInternal('downloads/openFolder', null).catch(fail)}>{t('Ouvrir le dossier')}</SmallButton>
        <SmallButton danger disabled={!downloads?.some((d) => !isActive(d))} onClick={clear}>
          {t('Tout effacer')}
        </SmallButton>
      </section>

      {error && (
        <p role="alert" className="m-0 rounded-[12px] bg-white/70 px-4 py-3 text-[13px] text-pink-button">
          {error}
        </p>
      )}

      {downloads && downloads.length === 0 && (
        <p className="m-0 py-10 text-center text-[14px] text-cream-sub">
          {query ? t('Aucun résultat.') : t('Aucun téléchargement.')}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.label} aria-label={group.label} className="flex flex-col gap-2">
          <h2 className="m-0 mb-1 text-[13px] font-bold tracking-[0.5px] text-cream-sub uppercase first-letter:uppercase">
            {group.label}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="downloads-list">
            {group.items.map((d) => (
              <DownloadRow key={d.id} download={d} onAction={(action) => act(d, action)} />
            ))}
          </ul>
        </section>
      ))}

      {more && downloads && downloads.length > 0 && (
        <div className="flex justify-center">
          <SmallButton onClick={loadMore}>{t('Afficher plus')}</SmallButton>
        </div>
      )}
    </main>
  )
}

function DownloadRow({ download: d, onAction }: { download: DownloadInfo; onAction: (action: DownloadAction) => void }): JSX.Element {
  const active = isActive(d)
  const openable = d.state === 'completed' && d.exists !== false
  const percent = d.totalBytes > 0 ? Math.round((d.receivedBytes / d.totalBytes) * 100) : null
  const blocked = d.state === 'blocked'

  return (
    <li
      data-testid="download-entry"
      className={`group glass-card flex items-start gap-4 rounded-[14px] px-4 py-3 ${blocked ? 'ring-1 ring-pink-button/40' : ''}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {openable ? (
          <button
            type="button"
            onClick={() => onAction('open')}
            className="min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-[14px] font-semibold text-cream-ink hover:underline"
          >
            {d.filename}
          </button>
        ) : (
          <span
            className={`min-w-0 truncate text-[14px] font-semibold ${
              active ? 'text-cream-ink' : blocked ? 'text-pink-button' : 'text-cream-sub line-through'
            }`}
          >
            {d.filename}
          </span>
        )}
        <a href={d.url} title={d.url} className="min-w-0 truncate text-[12px] text-cream-sub no-underline hover:underline">
          {hostOf(d.url)}
        </a>
        {active && (
          <div className="my-1 h-1 overflow-hidden rounded-full bg-pink/15">
            <div className={`h-full rounded-full ${d.state === 'paused' ? 'bg-cream-sub' : 'bg-pink'}`} style={{ width: `${percent ?? 30}%` }} />
          </div>
        )}
        <span data-testid="download-entry-status" className={`text-[12.5px] ${blocked ? 'font-semibold text-pink-button' : 'text-cream-sub'}`}>
          {downloadStatus(d)}
        </span>
        <div className="mt-1 flex flex-wrap gap-2">
          {d.state === 'progressing' && <SmallButton onClick={() => onAction('pause')}>{t('Pause')}</SmallButton>}
          {d.state === 'paused' && <SmallButton onClick={() => onAction('resume')}>{t('Reprendre')}</SmallButton>}
          {active && <SmallButton onClick={() => onAction('cancel')}>{t('Annuler')}</SmallButton>}
          {openable && <SmallButton onClick={() => onAction('show')}>{t('Afficher dans le dossier')}</SmallButton>}
          {(d.state === 'cancelled' || d.state === 'interrupted' || (d.state === 'completed' && d.exists === false)) && (
            <SmallButton onClick={() => onAction('retry')}>{t('Réessayer')}</SmallButton>
          )}
          {blocked && (
            <SmallButton danger onClick={() => onAction('keep')}>
              {t('Télécharger quand même')}
            </SmallButton>
          )}
        </div>
      </div>
      <span className="shrink-0 pt-0.5 text-[12px] text-cream-dim tabular-nums">
        {new Date(d.startedAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}
      </span>
      {!active && (
        <button
          type="button"
          aria-label={t('Retirer {name} de la liste', { name: d.filename })}
          onClick={() => onAction('remove')}
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-cream-sub opacity-0 group-hover:opacity-100 hover:bg-black/8 focus:opacity-100"
        >
          ×
        </button>
      )}
    </li>
  )
}

document.title = t('Téléchargements')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DownloadsPage />
  </StrictMode>
)
