import '../lib/lang'
import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ExtensionBarSettings, ExtensionInfo } from '@shared/types'
import { toolBarId } from '@shared/extensionBar'
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
  const [bar, setBar] = useState<ExtensionBarSettings | null>(null)

  /** The icon in the sidebar, apart from being on: an extension can work without one. */
  const icon = (id: string): IconChoice | null =>
    bar && {
      shown: !bar.hidden.includes(id),
      onChange: (shown) => {
        const hidden = bar.hidden.filter((h) => h !== id)
        const next = { ...bar, hidden: shown ? hidden : [...hidden, id] }
        setBar(next)
        callInternal('extensions/setBar', next)
          .then(setBar)
          .catch((err: unknown) => setError(String(err)))
      }
    }

  const refresh = useCallback(() => {
    // The icons can also be picked on zak://settings meanwhile.
    void callInternal('extensions/bar', null).then(setBar)
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

      <ZakTools icon={icon} />

      <h2 className="m-0 mt-2 text-[17px] font-bold text-title">{t('Extensions Chrome')}</h2>

      {extensions?.length === 0 && (
        <div className="glass-card rounded-[18px] px-6 py-10 text-center text-sub">
          {t('Aucune extension installée. Ouvrez le Chrome Web Store et cliquez sur « Ajouter à Chrome ».')}
        </div>
      )}

      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={t('Extensions installées')}>
        {extensions?.map((ext) => (
          <ExtensionCard key={ext.id} ext={ext} run={run} icon={icon(ext.id)} />
        ))}
      </ul>
    </main>
  )
}

interface IconChoice {
  shown: boolean
  onChange: (shown: boolean) => void
}

/** « Icône dans la barre latérale », under an extension that is on. */
function IconCheckbox({ choice, name }: { choice: IconChoice | null; name: string }): JSX.Element | null {
  if (!choice) return null
  return (
    <label className="mt-1 flex w-fit cursor-pointer items-center gap-2 text-[13px] text-ink">
      <input
        type="checkbox"
        data-testid="extension-icon-shown"
        aria-label={t('Icône de {name} dans la barre latérale', { name })}
        checked={choice.shown}
        onChange={(e) => choice.onChange(e.target.checked)}
        className="size-4 cursor-pointer accent-violet"
      />
      {t('Icône dans la barre latérale')}
    </label>
  )
}

function ExtensionCard(props: { ext: ExtensionInfo; run: (action: Promise<unknown>) => void; icon: IconChoice | null }): JSX.Element {
  const { ext, run } = props
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
        {ext.enabled && <IconCheckbox choice={props.icon} name={ext.name} />}

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
function ZakTools({ icon }: { icon: (id: string) => IconChoice | null }): JSX.Element | null {
  const [tools, setTools] = useState<ToolsSettings | null>(null)
  useEffect(() => {
    void callInternal('extensions/tools', null).then(setTools)
  }, [])
  if (!tools) return null
  const lang = getLang()
  const { translate, screenshot, record } = tools
  const setTranslate = (patch: InternalApiRoutes['extensions/setTranslate']['body']): void =>
    void callInternal('extensions/setTranslate', patch).then(setTools)
  const isMac = navigator.platform.startsWith('Mac')

  return (
    <section aria-labelledby="zak-tools" className="flex flex-col gap-3">
      <div>
        <h2 id="zak-tools" className="m-0 text-[17px] font-bold text-title">
          {t('Outils Zak')}
        </h2>
        <p className="m-0 mt-1 text-[13px] text-sub">{t('Intégrés à Zak : activez seulement ceux qui vous servent.')}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={t('Outils Zak')}>
        <ToolCard
          id="translate"
          icon="🌐"
          name={t('Traduction')}
          enabled={translate.enabled}
          sidebarIcon={icon(toolBarId('translate'))}
          onToggle={(enabled) => setTranslate({ enabled })}
          description={t('Sélectionnez un texte puis clic droit : « Traduire en… ». Dans un champ où vous écrivez (un e-mail, un message), le texte sélectionné est remplacé par sa traduction (⌘Z pour revenir) ; ailleurs, la traduction s’affiche dans une bulle.')}
          note={t('Le texte n’est envoyé à Google Traduction qu’au moment où vous le demandez.')}
        >
          <label className="mt-2 flex items-center gap-2 text-[13px] text-ink">
            {t('Traduire ce que je lis en')}
            <select
              value={translate.target}
              onChange={(e) => setTranslate({ target: e.target.value })}
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
        </ToolCard>
        <ToolCard
          id="screenshot"
          icon="📸"
          name={t('Capture d’écran')}
          enabled={screenshot.enabled}
          sidebarIcon={icon(toolBarId('screenshot'))}
          onToggle={(enabled) => void callInternal('extensions/setScreenshot', { enabled }).then(setTools)}
          description={t('Une zone tracée, la page visible ou la page entière : menu Fichier ({shortcut}) ou clic droit sur la page. L’image est copiée dans le presse-papiers et enregistrée dans le dossier des téléchargements.', { shortcut: isMac ? '⌘⇧2' : t('Ctrl+Maj+2') })}
          note={t('Tout reste sur votre ordinateur.')}
        />
        <ToolCard
          id="record"
          icon="🎥"
          name={t('Enregistrement de l’écran')}
          enabled={record.enabled}
          sidebarIcon={icon(toolBarId('record'))}
          onToggle={(enabled) => void callInternal('extensions/setRecord', { enabled }).then(setTools)}
          description={t('Un écran ou une fenêtre, avec votre caméra dans une bulle et votre micro, comme Loom : menu Fichier ({shortcut}), clic droit sur la page ou son icône. La vidéo est enregistrée dans le dossier des téléchargements.', { shortcut: isMac ? '⌘⇧E' : t('Ctrl+Maj+E') })}
          note={t('Tout reste sur votre ordinateur.')}
        />
      </ul>
    </section>
  )
}

function ToolCard(props: {
  id: string
  icon: string
  name: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  /** Its icon in the sidebar (shown or not). */
  sidebarIcon: IconChoice | null
  description: string
  note: string
  /** Its options, shown while it is on. */
  children?: JSX.Element
}): JSX.Element {
  return (
    <li data-tool-id={props.id} className={`glass-card flex gap-4 rounded-[18px] px-5 py-4 ${props.enabled ? '' : 'opacity-70'}`}>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-white text-[24px]" aria-hidden>
        {props.icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="m-0 text-[15px] font-bold text-title">{props.name}</h3>
        <p className="m-0 text-[13px] text-sub">{props.description}</p>
        <p className="m-0 text-[12px] text-sub">{props.note}</p>
        {props.enabled && <IconCheckbox choice={props.sidebarIcon} name={props.name} />}
        {props.enabled && props.children}
      </div>
      <Toggle
        label={props.enabled ? t('Désactiver {name}', { name: props.name }) : t('Activer {name}', { name: props.name })}
        on={props.enabled}
        onChange={props.onToggle}
      />
    </li>
  )
}

document.title = t('Extensions')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ExtensionsPage />
  </StrictMode>
)
