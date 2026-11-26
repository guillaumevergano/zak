import '../lib/lang'
import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ExtensionInfo } from '@shared/types'
import type { InternalApiRoutes } from '@shared/ipc'
import { languageMenu, languageName, type ToolsSettings } from '@shared/tools'
import { callInternal } from './api'
import { SmallButton, Toggle } from './ui'
import '../styles.css'
import { getLang, t } from '@shared/i18n'

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
          <h1 className="m-0 text-[26px] font-bold text-title">{t('Extensions')}</h1>
          <p className="m-0 mt-1 text-[13px] text-sub">
            {t('Installées depuis le Chrome Web Store, actives dans les fenêtres normales.')}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => run(callInternal('extensions/openStore', null))}
            className="cursor-pointer rounded-[11px] border-0 bg-violet px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-title"
          >
            {t('Ouvrir le Chrome Web Store')}
          </button>
          <SmallButton onClick={() => run(callInternal('extensions/loadUnpacked', null))}>
            {t('Charger une extension non empaquetée…')}
          </SmallButton>
        </div>
      </header>

      {error && (
        <p role="alert" className="m-0 rounded-[12px] bg-white/70 px-4 py-3 text-[13px] text-pink-button">
          {error}
        </p>
      )}

      <ZakTools />

      <h2 className="m-0 mt-2 text-[17px] font-bold text-title">{t('Extensions Chrome')}</h2>

      {extensions?.length === 0 && (
        <div className="glass-card rounded-[18px] px-6 py-10 text-center text-sub">
          {t('Aucune extension installée. Ouvrez le Chrome Web Store et cliquez sur « Ajouter à Chrome ».')}
        </div>
      )}

      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={t('Extensions installées')}>
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
        {ext.unpackedPath && (
          <p className="m-0 truncate font-mono text-[10.5px] text-sub" title={ext.unpackedPath} data-testid="unpacked-path">
            {t('Dossier : {path} — rechargée à chaque modification', { path: ext.unpackedPath })}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          {confirming ? (
            <>
              <span className="text-[13px] font-semibold text-ink">
                {ext.unpackedPath
                  ? t('Retirer « {name} » de Zak ? Son dossier reste en place.', { name: ext.name })
                  : t('Désinstaller « {name} » ?', { name: ext.name })}
              </span>
              <SmallButton danger onClick={() => run(callInternal('extensions/uninstall', { id: ext.id }))}>
                {ext.unpackedPath ? t('Retirer') : t('Désinstaller')}
              </SmallButton>
              <SmallButton onClick={() => setConfirming(false)}>{t('Annuler')}</SmallButton>
            </>
          ) : (
            <>
              {ext.enabled && ext.hasOptions && (
                <SmallButton onClick={() => run(callInternal('extensions/openOptions', { id: ext.id }))}>
                  {t('Options')}
                </SmallButton>
              )}
              {ext.unpackedPath && ext.enabled && (
                <SmallButton onClick={() => run(callInternal('extensions/reload', { id: ext.id }))}>{t('Recharger')}</SmallButton>
              )}
              <SmallButton onClick={() => setConfirming(true)}>{ext.unpackedPath ? t('Retirer') : t('Désinstaller')}</SmallButton>
            </>
          )}
        </div>
      </div>

      <Toggle
        label={ext.enabled ? t('Désactiver {name}', { name: ext.name }) : t('Activer {name}', { name: ext.name })}
        on={ext.enabled}
        onChange={(enabled) => run(callInternal('extensions/setEnabled', { id: ext.id, enabled }))}
      />
    </li>
  )
}

/** Zak's own tools (CLAUDE.md §6.8): built in, on or off; off, nothing of them is left. */
function ZakTools(): JSX.Element | null {
  const [tools, setTools] = useState<ToolsSettings | null>(null)
  useEffect(() => {
    void callInternal('extensions/tools', null).then(setTools)
  }, [])
  if (!tools) return null
  const lang = getLang()
  const { translate } = tools
  const set = (patch: InternalApiRoutes['extensions/setTranslate']['body']): void =>
    void callInternal('extensions/setTranslate', patch).then(setTools)

  return (
    <section aria-labelledby="zak-tools" className="flex flex-col gap-3">
      <div>
        <h2 id="zak-tools" className="m-0 text-[17px] font-bold text-title">
          {t('Outils Zak')}
        </h2>
        <p className="m-0 mt-1 text-[13px] text-sub">{t('Intégrés à Zak : activez seulement ceux qui vous servent.')}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={t('Outils Zak')}>
        <li data-tool-id="translate" className={`glass-card flex gap-4 rounded-[18px] px-5 py-4 ${translate.enabled ? '' : 'opacity-70'}`}>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-white text-[24px]" aria-hidden>
            🌐
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="m-0 text-[15px] font-bold text-title">{t('Traduction')}</h3>
            <p className="m-0 text-[13px] text-sub">
              {t('Sélectionnez un texte puis clic droit : « Traduire en… ». Dans un champ où vous écrivez (un e-mail, un message), le texte sélectionné est remplacé par sa traduction (⌘Z pour revenir) ; ailleurs, la traduction s’affiche dans une bulle.')}
            </p>
            <p className="m-0 text-[12px] text-sub/80">
              {t('Le texte n’est envoyé à Google Traduction qu’au moment où vous le demandez.')}
            </p>
            {translate.enabled && (
              <label className="mt-2 flex items-center gap-2 text-[13px] text-ink">
                {t('Traduire ce que je lis en')}
                <select
                  value={translate.target}
                  onChange={(e) => set({ target: e.target.value })}
                  className="h-8 rounded-lg border border-track bg-white px-2 text-[13px] font-semibold text-title"
                >
                  <option value="">{t('Langue de Zak ({language})', { language: languageName(lang, lang, false) })}</option>
                  {languageMenu([], lang).others.map((code) => (
                    <option key={code} value={code}>
                      {languageName(code, lang)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <Toggle
            label={translate.enabled ? t('Désactiver {name}', { name: t('Traduction') }) : t('Activer {name}', { name: t('Traduction') })}
            on={translate.enabled}
            onChange={(enabled) => set({ enabled })}
          />
        </li>
      </ul>
    </section>
  )
}

document.title = t('Extensions')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ExtensionsPage />
  </StrictMode>
)
