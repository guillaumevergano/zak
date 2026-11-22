import '../lib/lang'
import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ClearPeriod, HistoryEntry } from '@shared/types'
import { callInternal } from './api'
import { SmallButton } from './ui'
import '../styles.css'
import { locale, t } from '@shared/i18n'

const periods = (): { value: ClearPeriod; label: string }[] => [
  { value: 'hour', label: t('Dernière heure') },
  { value: 'day', label: t('Dernières 24 heures') },
  { value: 'week', label: t('7 derniers jours') },
  { value: 'month', label: t('4 dernières semaines') },
  { value: 'all', label: t('Toutes les périodes') }
]

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

/** zak://history (CLAUDE.md §6.7): search, per-entry removal, clearing by period. Cmd/Ctrl+Y. */
function HistoryPage(): JSX.Element {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [more, setMore] = useState(false)
  const [period, setPeriod] = useState<ClearPeriod>('hour')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((text: string, before: number | null, append: boolean) => {
    callInternal('history/search', { query: text, before })
      .then((page) => {
        setEntries((current) => (append && current ? [...current, ...page] : page))
        setMore(page.length === 100)
        setError(null)
      })
      .catch((err: unknown) => setError(String(err)))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => load(query, null, false), 120)
    return () => clearTimeout(timer)
  }, [query, load])

  const remove = (id: number): void => {
    setEntries((current) => current?.filter((e) => e.id !== id) ?? null)
    callInternal('history/remove', { ids: [id] }).catch((err: unknown) => setError(String(err)))
  }

  const clear = (): void => {
    callInternal('history/clear', { period })
      .then(() => load(query, null, false))
      .catch((err: unknown) => setError(String(err)))
  }

  const groups: { label: string; entries: HistoryEntry[] }[] = []
  for (const entry of entries ?? []) {
    const label = dayLabel(entry.visitedAt)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.entries.push(entry)
    else groups.push({ label, entries: [entry] })
  }

  return (
    <main className="mx-auto flex max-w-[820px] flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="m-0 font-serif text-[34px] font-semibold text-cream-ink">{t('Historique')}</h1>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Rechercher dans l'historique")}
          aria-label={t("Rechercher dans l'historique")}
          autoFocus
          className="h-10 w-[320px] max-w-full rounded-full border border-cream-edge bg-cream-2 px-4 text-[14px] text-cream-ink outline-none focus:border-pink"
        />
      </header>

      <section
        aria-label={t('Effacer les données de navigation')}
        className="glass-card flex flex-wrap items-center gap-3 rounded-[16px] px-5 py-3"
      >
        <span className="flex-1 text-[13.5px] font-semibold text-ink">{t("Effacer l'historique")}</span>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as ClearPeriod)}
          aria-label={t('Période')}
          className="rounded-[10px] border border-cream-edge bg-cream-2 px-2 py-1.5 text-[13px] text-cream-ink"
        >
          {periods().map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <SmallButton danger onClick={clear}>
          {t('Effacer')}
        </SmallButton>
      </section>

      {error && (
        <p role="alert" className="m-0 rounded-[12px] bg-white/70 px-4 py-3 text-[13px] text-pink-button">
          {error}
        </p>
      )}

      {entries && entries.length === 0 && (
        <p className="m-0 py-10 text-center text-[14px] text-cream-sub">
          {query ? t('Aucun résultat.') : t("L'historique est vide.")}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.label} aria-label={group.label} className="flex flex-col gap-1">
          <h2 className="m-0 mb-1 text-[13px] font-bold tracking-[0.5px] text-cream-sub uppercase first-letter:uppercase">
            {group.label}
          </h2>
          <ul className="m-0 flex list-none flex-col p-0" data-testid="history-list">
            {group.entries.map((entry) => (
              <li
                key={entry.id}
                data-testid="history-entry"
                className="group flex items-center gap-3 rounded-[10px] px-2 py-1.5 hover:bg-cream-2"
              >
                <span className="w-12 shrink-0 text-[12px] text-cream-dim tabular-nums">
                  {new Date(entry.visitedAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}
                </span>
                {entry.favicon ? (
                  <img src={entry.favicon} alt="" className="size-4 shrink-0 rounded" />
                ) : (
                  <span className="size-4 shrink-0 rounded bg-cream-edge" />
                )}
                <a
                  href={entry.url}
                  title={entry.url}
                  className="min-w-0 flex-1 truncate text-[13.5px] text-cream-ink no-underline hover:underline"
                >
                  {entry.title}
                </a>
                <span className="max-w-[200px] shrink-0 truncate text-[12px] text-cream-sub">{hostOf(entry.url)}</span>
                <button
                  type="button"
                  aria-label={t("Supprimer {title} de l'historique", { title: entry.title })}
                  onClick={() => remove(entry.id)}
                  className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-cream-sub opacity-0 group-hover:opacity-100 hover:bg-black/8 focus:opacity-100"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {more && entries && (
        <div className="flex justify-center">
          <SmallButton onClick={() => load(query, entries[entries.length - 1]!.visitedAt, true)}>{t('Afficher plus')}</SmallButton>
        </div>
      )}
    </main>
  )
}

document.title = t('Historique')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HistoryPage />
  </StrictMode>
)
