import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ExtensionInfo } from '@shared/types'
import { callInternal } from './api'
import { SmallButton, Toggle } from './ui'
import '../styles.css'

/** zak://extensions (CLAUDE.md §6.5): installed extensions, on/off, options, uninstall. */
function ExtensionsPage(): JSX.Element {
  const [extensions, setExtensions] = useState<ExtensionInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    callInternal('extensions/list', null)
      .then((list) => {
        setExtensions(list)
        setError(null)
      })
      .catch((err: unknown) => setError(String(err)))
  }, [])

  useEffect(() => {
    refresh()
    // Installed from the Web Store in another tab meanwhile: refresh when coming back.
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  const run = (action: Promise<unknown>): void => {
    action.then(refresh).catch((err: unknown) => setError(String(err)))
  }

  return (
    <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-bold text-title">Extensions</h1>
          <p className="m-0 mt-1 text-[13px] text-sub">
            Installées depuis le Chrome Web Store, actives dans les fenêtres normales.
          </p>
        </div>
        <button
          type="button"
          onClick={() => run(callInternal('extensions/openStore', null))}
          className="shrink-0 cursor-pointer rounded-[11px] border-0 bg-violet px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-title"
        >
          Ouvrir le Chrome Web Store
        </button>
      </header>

      {error && (
        <p role="alert" className="m-0 rounded-[12px] bg-white/70 px-4 py-3 text-[13px] text-pink-button">
          {error}
        </p>
      )}

      {extensions?.length === 0 && (
        <div className="glass-card rounded-[18px] px-6 py-10 text-center text-sub">
          Aucune extension installée. Ouvrez le Chrome Web Store et cliquez sur « Ajouter à Chrome ».
        </div>
      )}

      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Extensions installées">
        {extensions?.map((ext) => (
          <ExtensionCard key={ext.id} ext={ext} run={run} />
        ))}
      </ul>
    </main>
  )
}

function ExtensionCard({ ext, run }: { ext: ExtensionInfo; run: (action: Promise<unknown>) => void }): JSX.Element {
  const [confirming, setConfirming] = useState(false)

  return (
    <li
      data-extension-id={ext.id}
      className={`glass-card flex gap-4 rounded-[18px] px-5 py-4 ${ext.enabled ? '' : 'opacity-70'}`}
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-white">
        {ext.icon ? (
          <img src={ext.icon} alt="" className={`size-8 ${ext.enabled ? '' : 'grayscale'}`} />
        ) : (
          <span className="text-[18px] font-bold text-violet">{ext.name.charAt(0)}</span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <h2 className="m-0 truncate text-[15px] font-bold text-title">{ext.name}</h2>
          <span className="shrink-0 font-mono text-[11px] text-sub">{ext.version}</span>
          {ext.manifestVersion < 3 && (
            <span className="shrink-0 rounded-full bg-track px-2 py-px text-[10px] font-semibold text-violet">MV2</span>
          )}
        </div>
        {ext.description && <p className="m-0 line-clamp-2 text-[13px] text-sub">{ext.description}</p>}
        <p className="m-0 font-mono text-[10.5px] text-sub/70 select-all">{ext.id}</p>

        <div className="mt-2 flex items-center gap-2">
          {confirming ? (
            <>
              <span className="text-[13px] font-semibold text-ink">Désinstaller « {ext.name} » ?</span>
              <SmallButton danger onClick={() => run(callInternal('extensions/uninstall', { id: ext.id }))}>
                Désinstaller
              </SmallButton>
              <SmallButton onClick={() => setConfirming(false)}>Annuler</SmallButton>
            </>
          ) : (
            <>
              {ext.enabled && ext.hasOptions && (
                <SmallButton onClick={() => run(callInternal('extensions/openOptions', { id: ext.id }))}>
                  Options
                </SmallButton>
              )}
              <SmallButton onClick={() => setConfirming(true)}>Désinstaller</SmallButton>
            </>
          )}
        </div>
      </div>

      <Toggle
        label={ext.enabled ? `Désactiver ${ext.name}` : `Activer ${ext.name}`}
        on={ext.enabled}
        onChange={(enabled) => run(callInternal('extensions/setEnabled', { id: ext.id, enabled }))}
      />
    </li>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ExtensionsPage />
  </StrictMode>
)
