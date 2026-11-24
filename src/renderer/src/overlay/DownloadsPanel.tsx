import { useEffect, useState } from 'react'
import type { DownloadAction, DownloadInfo, OverlayRequest } from '@shared/types'
import { downloadStatus, isActive } from '../lib/downloads'
import { Popover } from './Popover'
import { t } from '@shared/i18n'

const api = window.zak

/**
 * Toolbar downloads panel (CLAUDE.md §6.7): this run's downloads with progress, pause / resume,
 * cancel, open, show in folder, retry. A completed file can be dragged out (Finder, desktop, mail…).
 * « Tout afficher » opens zak://downloads.
 */
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
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-bold text-title">{t('Téléchargements')}</span>
          <PanelButton onClick={() => void api.invoke('downloads:openPage')}>{t('Tout afficher')}</PanelButton>
        </div>
        {downloads.length === 0 && <p className="m-0 py-3 text-[13px] text-sub">{t('Aucun téléchargement.')}</p>}
        <ul className="m-0 flex max-h-[360px] list-none flex-col gap-1 overflow-y-auto p-0">
          {downloads.map((d) => {
            const active = isActive(d)
            const openable = d.state === 'completed' && d.exists !== false
            const percent = d.totalBytes > 0 ? Math.round((d.receivedBytes / d.totalBytes) * 100) : null
            return (
              <li
                key={d.id}
                data-testid="download"
                draggable={openable}
                onDragStart={(e) => {
                  // The OS drag (a real file) is started by main.
                  e.preventDefault()
                  api.send('downloads:drag', d.id)
                }}
                title={openable ? t('Glissez le fichier vers le Finder ou une autre app') : undefined}
                className="flex flex-col gap-1 rounded-xl px-2 py-2 hover:bg-violet/5"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!openable}
                    onClick={() => act(d.id, 'open')}
                    title={openable ? t('Ouvrir') : undefined}
                    className={`min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold ${
                      openable ? 'text-ink hover:underline' : active ? 'text-ink' : d.state === 'blocked' ? 'text-pink-button' : 'text-sub line-through'
                    }`}
                  >
                    {d.filename}
                  </button>
                  {d.state === 'progressing' && <PanelButton onClick={() => act(d.id, 'pause')}>{t('Pause')}</PanelButton>}
                  {d.state === 'paused' && <PanelButton onClick={() => act(d.id, 'resume')}>{t('Reprendre')}</PanelButton>}
                  {active && <PanelButton onClick={() => act(d.id, 'cancel')}>{t('Annuler')}</PanelButton>}
                  {openable && <PanelButton onClick={() => act(d.id, 'show')}>{t('Afficher dans le dossier')}</PanelButton>}
                  {(d.state === 'cancelled' || d.state === 'interrupted') && (
                    <PanelButton onClick={() => act(d.id, 'retry')}>{t('Réessayer')}</PanelButton>
                  )}
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
                <span
                  data-testid="download-status"
                  className={`text-[12px] ${d.state === 'blocked' ? 'font-semibold text-pink-button' : 'text-sub'}`}
                >
                  {downloadStatus(d)}
                </span>
                {d.state === 'blocked' && (
                  <div>
                    <PanelButton onClick={() => act(d.id, 'keep')}>{t('Télécharger quand même')}</PanelButton>
                  </div>
                )}
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
