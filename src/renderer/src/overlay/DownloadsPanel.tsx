import { useEffect, useState } from 'react'
import type { DownloadAction, DownloadInfo, OverlayRequest } from '@shared/types'
import { formatBytes } from '../lib/format'
import { Popover } from './Popover'
import { t } from '@shared/i18n'

const api = window.zak

const statusOf = (d: DownloadInfo): string => {
  const size = d.totalBytes > 0 ? t('{received} sur {total}', { received: formatBytes(d.receivedBytes), total: formatBytes(d.totalBytes) }) : formatBytes(d.receivedBytes)
  switch (d.state) {
    case 'progressing':
      return size
    case 'paused':
      return t('En pause — {size}', { size })
    case 'completed':
      return formatBytes(d.totalBytes || d.receivedBytes)
    case 'cancelled':
      return t('Annulé')
    case 'interrupted':
      return t('Échec du téléchargement')
  }
}

/** Toolbar downloads panel (CLAUDE.md §6.7): progress, pause / resume, cancel, open, show in folder. */
export function DownloadsPanel({ request }: { request: Extract<OverlayRequest, { kind: 'downloads' }> }): JSX.Element {
  const [downloads, setDownloads] = useState<DownloadInfo[]>([])

  useEffect(() => {
    void api.invoke('downloads:getState').then(setDownloads)
    return api.on('downloads:state', setDownloads)
  }, [])

  const act = (id: string, action: DownloadAction): void => void api.invoke('downloads:action', id, action)

  return (
    <Popover anchor={request.anchor}>
      <div data-testid="downloads-panel" className="flex flex-col gap-2">
        <span className="text-[15px] font-bold text-title">{t('Téléchargements')}</span>
        {downloads.length === 0 && <p className="m-0 py-3 text-[13px] text-sub">{t('Aucun téléchargement.')}</p>}
        <ul className="m-0 flex max-h-[360px] list-none flex-col gap-1 overflow-y-auto p-0">
          {downloads.map((d) => {
            const active = d.state === 'progressing' || d.state === 'paused'
            const percent = d.totalBytes > 0 ? Math.round((d.receivedBytes / d.totalBytes) * 100) : null
            return (
              <li key={d.id} data-testid="download" className="flex flex-col gap-1 rounded-xl px-2 py-2 hover:bg-violet/5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={d.state !== 'completed'}
                    onClick={() => act(d.id, 'open')}
                    title={d.state === 'completed' ? t('Ouvrir') : undefined}
                    className={`min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold ${
                      d.state === 'completed' ? 'text-ink hover:underline' : d.state === 'progressing' || d.state === 'paused' ? 'text-ink' : 'text-sub line-through'
                    }`}
                  >
                    {d.filename}
                  </button>
                  {d.state === 'progressing' && <PanelButton onClick={() => act(d.id, 'pause')}>{t('Pause')}</PanelButton>}
                  {d.state === 'paused' && <PanelButton onClick={() => act(d.id, 'resume')}>{t('Reprendre')}</PanelButton>}
                  {active && <PanelButton onClick={() => act(d.id, 'cancel')}>{t('Annuler')}</PanelButton>}
                  {d.state === 'completed' && <PanelButton onClick={() => act(d.id, 'show')}>{t('Afficher dans le dossier')}</PanelButton>}
                  {!active && (
                    <PanelButton label={t('Retirer {name} de la liste', { name: d.filename })} onClick={() => act(d.id, 'remove')}>
                      ×
                    </PanelButton>
                  )}
                </div>
                {active && (
                  <div className="h-1 overflow-hidden rounded-full bg-pink/15">
                    <div
                      className={`h-full rounded-full ${d.state === 'paused' ? 'bg-sub' : 'bg-pink'}`}
                      style={{ width: `${percent ?? 30}%` }}
                    />
                  </div>
                )}
                <span data-testid="download-status" className="text-[12px] text-sub">
                  {statusOf(d)}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </Popover>
  )
}

function PanelButton(props: { onClick: () => void; label?: string; children: React.ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold text-violet hover:bg-violet/10"
    >
      {props.children}
    </button>
  )
}
