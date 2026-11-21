import { useBrowserStore } from '../store/useBrowserStore'
import { rectOf } from '../lib/favorites'
import { DownloadIcon } from './Icons'

const api = window.zak

/** End of the toolbar. Shown once something was downloaded (CLAUDE.md §6.7): a ring for the progress, a badge for the count. */
export function DownloadsButton(): JSX.Element | null {
  const downloads = useBrowserStore((s) => s.downloads)
  if (downloads.length === 0) return null
  const active = downloads.filter((d) => d.state === 'progressing' || d.state === 'paused')
  const total = active.reduce((sum, d) => sum + d.totalBytes, 0)
  const received = active.reduce((sum, d) => sum + d.receivedBytes, 0)
  const progress = total > 0 ? received / total : 0

  return (
    <button
      data-testid="downloads-button"
      title="Téléchargements"
      onClick={(e) => void api.invoke('overlay:open', { kind: 'downloads', anchor: rectOf(e.currentTarget) })}
      className="relative grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] text-cream-ink hover:bg-black/6"
    >
      {active.length > 0 && (
        <svg viewBox="0 0 34 34" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="17" cy="17" r="14" fill="none" stroke="rgb(255 0 130 / 0.15)" strokeWidth="2.5" />
          <circle
            cx="17"
            cy="17"
            r="14"
            fill="none"
            stroke="var(--color-pink)"
            strokeWidth="2.5"
            strokeDasharray={`${Math.max(progress, 0.04) * 88} 88`}
            strokeLinecap="round"
          />
        </svg>
      )}
      <DownloadIcon />
      {active.length > 0 && (
        <span
          data-testid="downloads-badge"
          className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-pink-button px-1 text-[10px] font-bold text-white"
        >
          {active.length}
        </span>
      )}
    </button>
  )
}
