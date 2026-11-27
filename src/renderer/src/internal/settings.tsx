import '../lib/lang'
import { StrictMode, useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type {
  AgentId,
  AgentStatus,
  BrowserSettings,
  ClearPeriod,
  DefaultBrowserStatus,
  ExtensionBarSettings,
  GeneralSettings,
  ImportSource,
  McpState,
  McpToolInfo,
  NewtabHeadlineSource,
  ModInfo,
  PipSettings,
  ProfileInfo,
  SidebarLayout
} from '@shared/types'
import { orderExtensions, toolBarId } from '@shared/extensionBar'
import type { ZakToolId } from '@shared/tools'
import { APPEARANCE_PAGE_URL, EXTENSIONS_PAGE_URL, PASSWORDS_PAGE_URL } from '@shared/ipc'
import { permissionLabel } from '../lib/permissions'
import { SEARCH_ENGINES, type SearchEngine } from '@shared/url'
import { callInternal } from './api'
import { SmallButton, Toggle } from './ui'
import '../styles.css'
import { LANGUAGES, LANG_CODES, plural, t } from '@shared/i18n'

/** zak://settings (CLAUDE.md §6.7). Every change is saved at once (no save button). */
function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<BrowserSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fail = (err: unknown): void => setError(String(err))

  useEffect(() => {
    callInternal('settings/get', null).then(setSettings).catch(fail)
  }, [])

  const update = (patch: Partial<BrowserSettings>): void => setSettings((s) => (s ? { ...s, ...patch } : s))

  const saveSidebar = (patch: Partial<Pick<SidebarLayout, 'collapsed' | 'side' | 'tabs'>>): void => {
    if (settings) update({ sidebar: { ...settings.sidebar, ...patch } })
    callInternal('settings/setSidebar', patch)
      .then((sidebar) => {
        update({ sidebar })
        setError(null)
      })
      .catch(fail)
  }

  const saveGeneral = (patch: Partial<GeneralSettings>): void => {
    if (settings) update({ general: { ...settings.general, ...patch } })
    callInternal('settings/setGeneral', patch)
      .then((general) => {
        update({ general })
        setError(null)
      })
      .catch(fail)
  }

  const savePip = (next: PipSettings): void => {
    update({ pip: next })
    callInternal('settings/setPip', next)
      .then((pip) => {
        update({ pip })
        setError(null)
      })
      .catch(fail)
  }

  if (!settings) {
    return (
      <main className="mx-auto max-w-[760px] px-6 py-10">
        {error && <p role="alert">{error}</p>}
      </main>
    )
  }
  const { general, pip } = settings

  return (
    <div className="mx-auto flex max-w-[1010px] items-start gap-8 px-6 py-10">
    <SettingsNav variant="side" />
    <main className="flex min-w-0 max-w-[760px] flex-1 flex-col gap-6">
      <header>
        <h1 className="m-0 font-serif text-[34px] font-semibold text-cream-ink">{t('Réglages')}</h1>
      </header>
      <SettingsNav variant="bar" />

      {error && (
        <p role="alert" className="m-0 rounded-[12px] bg-white/70 px-4 py-3 text-[13px] text-pink-button">
          {error}
        </p>
      )}

      <Section id="general" title={t('Général')}>
        <DefaultBrowser onError={fail} />
        <Row title={t('Moteur de recherche')} detail={t("Utilisé par la barre d'adresse et la page Nouvel onglet.")}>
          <select
            aria-label={t('Moteur de recherche')}
            value={general.searchEngine}
            onChange={(e) => saveGeneral({ searchEngine: e.target.value as SearchEngine })}
            className={selectClass}
          >
            {(Object.keys(SEARCH_ENGINES) as SearchEngine[]).map((key) => (
              <option key={key} value={key}>
                {SEARCH_ENGINES[key].label}
              </option>
            ))}
          </select>
        </Row>
        <Row title={t('Langue')} detail={t('Appliquée au prochain lancement de Zak.')}>
          <select
            aria-label={t('Langue')}
            value={general.language}
            onChange={(e) => saveGeneral({ language: e.target.value as GeneralSettings['language'] })}
            className={selectClass}
          >
            <option value="system">{t('Langue du système')}</option>
            {LANG_CODES.map((code) => (
              <option key={code} value={code} lang={code}>
                {LANGUAGES[code]}
              </option>
            ))}
          </select>
        </Row>
        <Row title={t('Au démarrage')}>
          <select
            aria-label={t('Au démarrage')}
            value={general.startup}
            onChange={(e) => saveGeneral({ startup: e.target.value as GeneralSettings['startup'] })}
            className={selectClass}
          >
            <option value="restore">{t('Rouvrir les onglets de la dernière session')}</option>
            <option value="newtab">{t('Ouvrir un nouvel onglet')}</option>
          </select>
        </Row>
        <Row title={t('Thème')} detail={t("« Système » suit le mode clair ou sombre de l'ordinateur.")}>
          <div role="radiogroup" aria-label={t('Thème')} className="flex rounded-[10px] border border-cream-edge bg-cream-2 p-0.5">
            {(
              [
                ['light', t('Clair')],
                ['dark', t('Sombre')],
                ['system', t('Système')]
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={general.theme === value}
                onClick={() => saveGeneral({ theme: value })}
                className={`cursor-pointer rounded-[8px] border-0 px-3 py-1 text-[12.5px] font-semibold ${
                  general.theme === value ? 'bg-violet text-white' : 'bg-transparent text-sub hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
        <Row title={t('Apparence des sites')} detail={t('Le mode clair ou sombre que voient les sites web (YouTube…). « Système » suit l’ordinateur, quel que soit le thème de Zak.')}>
          <div role="radiogroup" aria-label={t('Apparence des sites')} className="flex rounded-[10px] border border-cream-edge bg-cream-2 p-0.5">
            {(
              [
                ['light', t('Clair')],
                ['dark', t('Sombre')],
                ['system', t('Système')]
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={general.sitesTheme === value}
                onClick={() => saveGeneral({ sitesTheme: value })}
                className={`cursor-pointer rounded-[8px] border-0 px-3 py-1 text-[12.5px] font-semibold ${
                  general.sitesTheme === value ? 'bg-violet text-white' : 'bg-transparent text-sub hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
        <ImportFromBrowser onError={fail} />
        <ImportBookmarks onError={fail} />
        <Row
          title={t('Mettre en veille les onglets inactifs')}
          detail={t(
            'Libère la mémoire des onglets restés en arrière-plan. Ils se rechargent quand vous y revenez ; ceux qui jouent du son ou ont un formulaire en cours ne sont pas mis en veille.'
          )}
        >
          <select
            aria-label={t('Mettre en veille les onglets inactifs')}
            className={selectClass}
            value={general.sleepTabsAfter}
            onChange={(e) => saveGeneral({ sleepTabsAfter: Number(e.target.value) })}
          >
            <option value={0}>{t('Jamais')}</option>
            <option value={15}>{t('Après {n} minutes', { n: 15 })}</option>
            <option value={30}>{t('Après {n} minutes', { n: 30 })}</option>
            <option value={60}>{t('Après 1 heure')}</option>
            <option value={120}>{t('Après {n} heures', { n: 2 })}</option>
          </select>
        </Row>
        <Row title={t('Couleurs et polices')} detail={t('Chaque couleur de Zak et ses polices, avec le résultat en direct.')}>
          <a
            href={APPEARANCE_PAGE_URL}
            data-testid="open-appearance"
            className="rounded-[10px] border border-cream-edge bg-cream-2 px-3 py-1 text-[12.5px] font-semibold text-violet no-underline hover:border-violet/40"
          >
            {t('Personnaliser…')}
          </a>
        </Row>
        <Row title={t('Position de la barre latérale')} detail={t('À gauche ou à droite de la page.')}>
          <select
            aria-label={t('Position de la barre latérale')}
            className={selectClass}
            value={settings.sidebar.side}
            onChange={(e) => saveSidebar({ side: e.target.value === 'left' ? 'left' : 'right' })}
          >
            <option value="left">{t('À gauche')}</option>
            <option value="right">{t('À droite')}</option>
          </select>
        </Row>
        <Row title={t('Onglets')} detail={t('En haut de la fenêtre, ou un par ligne dans la barre latérale.')}>
          <select
            aria-label={t('Position des onglets')}
            className={selectClass}
            value={settings.sidebar.tabs}
            onChange={(e) => saveSidebar({ tabs: e.target.value === 'sidebar' ? 'sidebar' : 'top' })}
          >
            <option value="top">{t('En haut')}</option>
            <option value="sidebar">{t('Dans la barre latérale')}</option>
          </select>
        </Row>
        <Row title={t('Barre latérale réduite')} detail={t('Icônes seules (⌘B).')}>
          <Toggle label={t('Barre latérale réduite')} on={settings.sidebar.collapsed} onChange={(collapsed) => saveSidebar({ collapsed })} />
        </Row>
      </Section>

      <ExtensionBar
        bar={settings.extensionBar}
        onChange={(extensionBar) => {
          update({ extensionBar })
          callInternal('settings/setExtensionBar', extensionBar)
            .then((saved) => update({ extensionBar: saved }))
            .catch(fail)
        }}
        onError={fail}
      />

      <Section id="newtab" title={t('Nouvel onglet')}>
        <Row
          title={t('Sous le logo')}
          detail={
            t('À chaque nouvel onglet, l’un de ceux cochés, au hasard. Rien de coché : rien ne s’affiche.') +
            (general.newtabHeadlines.includes('history') || general.newtabHeadlines.includes('wikipedia')
              ? ` ${t('« Ce jour dans l’histoire » et « Le saviez-vous ? » viennent de Wikipédia, dans la langue de Zak.')}`
              : '')
          }
        >
          <fieldset aria-label={t('Sous le logo')} className="m-0 flex flex-col gap-1.5 border-0 p-0">
            {HEADLINE_SOURCES.map(([source, label]) => (
              <label key={source} className="flex items-center gap-2 text-[13.5px] text-ink">
                <input
                  type="checkbox"
                  checked={general.newtabHeadlines.includes(source)}
                  onChange={(e) =>
                    saveGeneral({
                      newtabHeadlines: e.target.checked
                        ? [...general.newtabHeadlines, source]
                        : general.newtabHeadlines.filter((s) => s !== source)
                    })
                  }
                  className="size-4 accent-violet"
                />
                {label}
              </label>
            ))}
          </fieldset>
        </Row>
        {general.newtabHeadlines.includes('custom') && (
          <Row title={t('Mon texte')}>
            <div className="flex w-[300px] flex-col gap-1.5">
              <input
                aria-label={t('Titre')}
                placeholder={t('Un peu d’espace.')}
                defaultValue={general.newtabTitle}
                maxLength={80}
                onBlur={(e) => e.target.value !== general.newtabTitle && saveGeneral({ newtabTitle: e.target.value })}
                className="h-9 rounded-[10px] border border-cream-edge bg-cream-2 px-3 text-[13.5px] text-ink focus:border-pink focus:outline-none"
              />
              <input
                aria-label={t('Sous-titre')}
                placeholder={t('Pour vos prochaines idées.')}
                defaultValue={general.newtabSubtitle}
                maxLength={120}
                onBlur={(e) => e.target.value !== general.newtabSubtitle && saveGeneral({ newtabSubtitle: e.target.value })}
                className="h-9 rounded-[10px] border border-cream-edge bg-cream-2 px-3 text-[13.5px] text-ink focus:border-pink focus:outline-none"
              />
            </div>
          </Row>
        )}
      </Section>

      <Section id="downloads" title={t('Téléchargements')}>
        <Row title={t('Dossier de téléchargement')} detail={general.downloadDir}>
          <SmallButton
            onClick={() =>
              callInternal('settings/chooseDownloadDir', null)
                .then((g) => update({ general: g }))
                .catch(fail)
            }
          >
            {t('Modifier…@@dossier')}
          </SmallButton>
        </Row>
        <Row title={t('Demander où enregistrer chaque fichier')} detail={t('Sinon, les fichiers vont directement dans ce dossier.')}>
          <Toggle
            label={t('Demander où enregistrer chaque fichier')}
            on={general.askWhereToSave}
            onChange={(askWhereToSave) => saveGeneral({ askWhereToSave })}
          />
        </Row>
      </Section>

      <Section
        id="pip"
        title={t('Lecteur vidéo flottant')}
        nav={t('Lecteur flottant')}
        intro={t(
          'Quand vous quittez un onglet où une vidéo est en lecture, elle continue dans une petite fenêtre flottante, toujours au premier plan.'
        )}
      >
        <Row title={t('Passer automatiquement en lecteur flottant')} detail={t("Au changement d'onglet ou quand la fenêtre est réduite.")}>
          <Toggle label={t('Lecteur flottant automatique')} on={pip.enabled} onChange={(enabled) => savePip({ ...pip, enabled })} />
        </Row>
        <Row
          title={t('Lecteur flottant')}
          detail={t('Celui de Zak : coins arrondis, ses boutons (lecture, revenir à l’onglet, fermer), et on le déplace à la souris. Celui du système : le lecteur Picture-in-Picture de Chromium.')}
        >
          <select
            aria-label={t('Lecteur flottant')}
            value={pip.style}
            onChange={(e) => savePip({ ...pip, style: e.target.value === 'system' ? 'system' : 'zak' })}
            className={selectClass}
          >
            <option value="zak">{t('Celui de Zak')}</option>
            <option value="system">{t('Celui du système')}</option>
          </select>
        </Row>
        <Row title={t("Fermer le lecteur flottant au retour sur l'onglet")}>
          <Toggle label={t('Fermer au retour')} on={pip.closeOnReturn} onChange={(closeOnReturn) => savePip({ ...pip, closeOnReturn })} />
        </Row>
        <Row
          title={t('Aussi les vidéos qui se lancent toutes seules')}
          detail={t('Par défaut, seule une vidéo que vous avez lancée (clic, touche) passe en lecteur flottant, pas celles qui démarrent seules dans un fil (X, Instagram…).')}
        >
          <Toggle label={t('Aussi les vidéos qui se lancent toutes seules')} on={pip.autoplayed} onChange={(autoplayed) => savePip({ ...pip, autoplayed })} />
        </Row>
        <Row title={t('Ignorer les vidéos muettes')} detail={t('Par défaut, une vidéo sans le son passe aussi en lecteur flottant.')}>
          <Toggle label={t('Ignorer les vidéos muettes')} on={pip.skipMuted} onChange={(skipMuted) => savePip({ ...pip, skipMuted })} />
        </Row>
        <ExcludedDomains domains={pip.excludedDomains} onChange={(excludedDomains) => savePip({ ...pip, excludedDomains })} />
      </Section>

      <ProfilesSection onError={fail} />

      <CustomizeSection onError={fail} />

      <McpSection onError={fail} />

      <Section id="passwords" title={t('Mots de passe')}>
        <Row title={t("Proposer d'enregistrer les mots de passe")} detail={t('Après une connexion. Chiffrés avec le trousseau de votre ordinateur.')}>
          <Toggle label={t("Proposer d'enregistrer les mots de passe")} on={general.savePasswords} onChange={(savePasswords) => saveGeneral({ savePasswords })} />
        </Row>
        <Row
          title={t('Mots de passe enregistrés')}
          detail={t('Afficher, modifier, importer ou exporter (CSV de Chrome, Safari, Firefox, Bitwarden, 1Password…).')}
        >
          <a href={PASSWORDS_PAGE_URL} className="rounded-[10px] border border-cream-edge bg-cream-2 px-3 py-1 text-[12.5px] font-semibold text-violet no-underline hover:border-violet/40">
            {t('Gérer')}
          </a>
        </Row>
      </Section>

      <Section id="security" title={t('Sécurité')}>
        <Row
          title={t('Protection contre les sites dangereux')}
          detail={t(
            "Avertit avant d'ouvrir un site d'hameçonnage ou de logiciels malveillants connu. Les listes (OpenPhish, PhishTank, URLhaus) sont vérifiées sur cet ordinateur : vos adresses ne sont envoyées à personne."
          )}
        >
          <Toggle label={t('Protection contre les sites dangereux')} on={general.safeBrowsing} onChange={(safeBrowsing) => saveGeneral({ safeBrowsing })} />
        </Row>
      </Section>

      <Section id="permissions" title={t('Autorisations des sites')} nav={t('Autorisations')} intro={t('Les réponses données aux demandes des sites, mémorisées par site.')}>
        {settings.permissions.length === 0 ? (
          <p className="m-0 border-t border-violet/10 py-3 text-[13px] text-sub">{t('Aucune autorisation mémorisée.')}</p>
        ) : (
          <ul aria-label={t('Autorisations mémorisées')} className="m-0 list-none p-0">
            {settings.permissions.map((p) => (
              <li key={`${p.origin} ${p.permission}`} className="flex items-center gap-3 border-t border-violet/10 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">{p.origin}</span>
                <span className="text-[13px] text-sub">{permissionLabel(p.permission)}</span>
                <span className={`w-[70px] text-[12.5px] font-semibold ${p.granted ? 'text-violet' : 'text-pink-button'}`}>
                  {p.granted ? t('Autorisé') : t('Bloqué')}
                </span>
                <SmallButton
                  onClick={() =>
                    callInternal('settings/removePermission', { origin: p.origin, permission: p.permission })
                      .then((permissions) => update({ permissions }))
                      .catch(fail)
                  }
                >
                  {t('Oublier')}
                </SmallButton>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ClearData onError={fail} />
    </main>
    </div>
  )
}

/**
 * The menu of the page's sections: a column on the left that stays in view, or a bar under the
 * title when the window is narrow. Built from the sections on the page (their `data-nav`), the
 * one in view highlighted.
 */
function SettingsNav({ variant }: { variant: 'side' | 'bar' }): JSX.Element {
  const [sections, setSections] = useState<{ id: string; label: string }[]>([])
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    const list = [...document.querySelectorAll<HTMLElement>('main section[id][data-nav]')]
    setSections(list.map((el) => ({ id: el.id, label: el.dataset['nav'] ?? el.id })))
    // The section crossing the upper part of the window is the current one.
    const seen = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting)
        const first = list.find((el) => seen.get(el.id))
        if (first) setCurrent(first.id)
      },
      { rootMargin: '-15% 0px -70% 0px' }
    )
    list.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const go = (e: MouseEvent, id: string): void => {
    e.preventDefault()
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    history.replaceState(null, '', `#${id}`)
    setCurrent(id)
  }

  // The bar keeps the current section's link in view.
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const bar = navRef.current
    const link = bar?.querySelector<HTMLElement>('[aria-current]')
    if (variant !== 'bar' || !bar || !link) return
    bar.scrollTo({ left: link.offsetLeft - bar.clientWidth / 2 + link.offsetWidth / 2 })
  }, [current, variant])

  const side = variant === 'side'
  return (
    <nav
      ref={navRef}
      aria-label={t('Sections des réglages')}
      data-testid={`settings-nav-${variant}`}
      className={
        side
          ? 'sticky top-10 hidden w-[180px] shrink-0 flex-col gap-0.5 pt-[66px] min-[900px]:flex'
          : 'sticky top-0 z-10 -mx-2 flex gap-1 overflow-x-auto rounded-[14px] [scrollbar-width:none] bg-cream/90 px-2 py-2 backdrop-blur min-[900px]:hidden'
      }
    >
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          onClick={(e) => go(e, section.id)}
          aria-current={current === section.id ? 'location' : undefined}
          className={`shrink-0 rounded-[9px] px-3 py-1.5 text-[13px] whitespace-nowrap no-underline transition-colors ${
            current === section.id ? 'bg-violet/12 font-semibold text-violet' : 'text-sub hover:bg-violet/6 hover:text-ink'
          }`}
        >
          {section.label}
        </a>
      ))}
    </nav>
  )
}

const selectClass = 'max-w-[300px] rounded-[10px] border border-cream-edge bg-cream-2 px-2 py-1.5 text-[13px] text-cream-ink'

function Section(props: { id: string; title: string; nav?: string; intro?: string; children: ReactNode }): JSX.Element {
  return (
    <section
      id={props.id}
      aria-labelledby={`${props.id}-title`}
      data-nav={props.nav ?? props.title}
      className="glass-card flex scroll-mt-16 flex-col rounded-[18px] px-5 py-4 min-[900px]:scroll-mt-6"
    >
      <h2 id={`${props.id}-title`} className="m-0 text-[15px] font-bold text-title">
        {props.title}
      </h2>
      {props.intro && <p className="m-0 mt-1 mb-2 text-[13px] text-sub">{props.intro}</p>}
      {!props.intro && <div className="h-2" />}
      {props.children}
    </section>
  )
}

/** A line of the list: a Chrome extension, or one of Zak's tools (`zak:<tool>`). */
interface BarItem {
  id: string
  name: string
  icon: string | null
  emoji: string | null
}

const toolItem = (tool: ZakToolId): BarItem =>
  tool === 'screenshot'
    ? { id: toolBarId(tool), name: t('Capture d’écran'), icon: null, emoji: '📸' }
    : tool === 'record'
      ? { id: toolBarId(tool), name: t('Enregistrement de l’écran'), icon: null, emoji: '🎥' }
      : { id: toolBarId(tool), name: t('Traduction'), icon: null, emoji: '🌐' }

/** Which extension icons the sidebar shows, and in what order (top of the sidebar, left to right). */
function ExtensionBar(props: {
  bar: ExtensionBarSettings
  onChange: (bar: ExtensionBarSettings) => void
  onError: (err: unknown) => void
}): JSX.Element {
  const [extensions, setExtensions] = useState<BarItem[] | null>(null)
  const { onError } = props

  useEffect(() => {
    callInternal('settings/listExtensions', null)
      .then(({ tools, extensions: list }) =>
        setExtensions([
          ...tools.map((tool) => toolItem(tool)),
          ...list.filter((e) => e.enabled).map((e) => ({ id: e.id, name: e.name, icon: e.icon, emoji: null }))
        ])
      )
      .catch(onError)
    // Once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ordered = extensions ? orderExtensions(extensions, props.bar) : []
  const ids = ordered.map((e) => e.id)

  const move = (index: number, delta: number): void => {
    const next = [...ids]
    const [id] = next.splice(index, 1)
    next.splice(index + delta, 0, id!)
    props.onChange({ ...props.bar, order: next })
  }
  const setShown = (id: string, shown: boolean): void => {
    const hidden = props.bar.hidden.filter((h) => h !== id)
    props.onChange({ order: ids, hidden: shown ? hidden : [...hidden, id] })
  }

  return (
    <Section
      id="extension-bar"
      title={t('Extensions dans la barre latérale')}
      nav={t('Extensions')}
      intro={t("Choisis les icônes d'extensions affichées en haut de la barre latérale, et leur ordre (de gauche à droite).")}
    >
      {extensions && extensions.length === 0 && (
        <p className="m-0 border-t border-violet/10 py-3 text-[13px] text-sub">
          {t('Aucune extension active.')}{' '}
          <a href={EXTENSIONS_PAGE_URL} className="font-semibold text-violet">
            {t('Gérer les extensions')}
          </a>
        </p>
      )}
      <ol className="m-0 flex list-none flex-col p-0" data-testid="extension-bar-list">
        {ordered.map((ext, index) => {
          const shown = !props.bar.hidden.includes(ext.id)
          return (
            <li
              key={ext.id}
              data-testid="extension-bar-item"
              data-extension-id={ext.id}
              className="flex items-center gap-3 border-t border-violet/10 py-2.5"
            >
              {ext.emoji ? (
                <span aria-hidden className={`grid size-6 shrink-0 place-items-center text-[17px] ${shown ? '' : 'opacity-40'}`}>
                  {ext.emoji}
                </span>
              ) : ext.icon ? (
                <img src={ext.icon} alt="" className={`size-6 shrink-0 rounded ${shown ? '' : 'opacity-40'}`} />
              ) : (
                <span className="size-6 shrink-0 rounded bg-cream-edge" />
              )}
              <span className={`min-w-0 flex-1 truncate text-[13.5px] font-semibold ${shown ? 'text-ink' : 'text-sub'}`}>
                {ext.name}
              </span>
              <div className="flex shrink-0 gap-1">
                <ArrowButton label={t('Monter {name}', { name: ext.name })} disabled={index === 0} onClick={() => move(index, -1)}>
                  ↑
                </ArrowButton>
                <ArrowButton
                  label={t('Descendre {name}', { name: ext.name })}
                  disabled={index === ordered.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </ArrowButton>
              </div>
              <Toggle label={t('Afficher {name} dans la barre latérale', { name: ext.name })} on={shown} onChange={(on) => setShown(ext.id, on)} />
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

function ArrowButton(props: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="grid size-7 cursor-pointer place-items-center rounded-[8px] border border-cream-edge bg-cream-2 text-[13px] text-violet hover:border-violet/40 disabled:cursor-default disabled:opacity-35 disabled:hover:border-cream-edge"
    >
      {props.children}
    </button>
  )
}

function ImportBookmarks({ onError }: { onError: (err: unknown) => void }): JSX.Element {
  const [result, setResult] = useState<string | null>(null)
  const run = (): void => {
    setResult(null)
    callInternal('settings/importBookmarks', null)
      .then((r) => {
        if (r)
          setResult(
            r.favorites === 0
              ? t('Rien de nouveau à importer.')
              : r.folders > 0
                ? t('{favorites}, {folders}.', {
                    favorites: plural(r.favorites, '{n} favori importé', '{n} favoris importés'),
                    folders: plural(r.folders, '{n} dossier', '{n} dossiers')
                  })
                : `${plural(r.favorites, '{n} favori importé', '{n} favoris importés')}.`
          )
      })
      .catch(onError)
  }
  return (
    <Row
      title={t('Importer des favoris')}
      detail={result ?? t('Depuis le fichier HTML exporté par Chrome, Arc, Firefox ou Safari.')}
    >
      <SmallButton onClick={run}>{t('Choisir le fichier…')}</SmallButton>
    </Row>
  )
}

/** Favorites and history of Chrome, Edge, Brave, Arc… read from their profile on this computer. */
function ImportFromBrowser({ onError }: { onError: (err: unknown) => void }): JSX.Element | null {
  const [sources, setSources] = useState<ImportSource[] | null>(null)
  const [profile, setProfile] = useState('')
  const [bookmarks, setBookmarks] = useState(true)
  const [withHistory, setWithHistory] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    callInternal('settings/importSources', null)
      .then((found) => {
        setSources(found)
        setProfile(found[0]?.profiles[0]?.path ?? '')
      })
      .catch(() => setSources([]))
  }, [])

  if (!sources || sources.length === 0) return null
  const run = (): void => {
    setBusy(true)
    setResult(null)
    callInternal('settings/importFrom', { profile, bookmarks, history: withHistory })
      .then((r) => {
        const parts = [
          bookmarks && plural(r.favorites, '{n} favori', '{n} favoris'),
          bookmarks && r.folders > 0 && plural(r.folders, '{n} dossier', '{n} dossiers'),
          withHistory && plural(r.pages, "{n} page d'historique", "{n} pages d'historique")
        ].filter(Boolean)
        setResult(t('Importé : {items}.', { items: parts.join(', ') }))
      })
      .catch(onError)
      .finally(() => setBusy(false))
  }
  return (
    <Row
      title={t('Importer depuis un autre navigateur')}
      detail={
        result ??
        t("Lu directement sur cet ordinateur. Les mots de passe s'importent depuis un fichier CSV (section Mots de passe ci-dessous).")
      }
    >
      <div className="flex flex-col items-end gap-2">
        <select aria-label={t('Navigateur à importer')} className={selectClass} value={profile} onChange={(e) => setProfile(e.target.value)}>
          {sources.map((s) =>
            s.profiles.map((p) => (
              <option key={p.path} value={p.path}>
                {s.profiles.length > 1 ? `${s.browser} — ${p.name}` : s.browser}
              </option>
            ))
          )}
        </select>
        <div className="flex items-center gap-3 text-[13px] text-ink">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={bookmarks} onChange={(e) => setBookmarks(e.target.checked)} /> {t('Favoris')}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={withHistory} onChange={(e) => setWithHistory(e.target.checked)} /> {t('Historique')}
          </label>
          <SmallButton onClick={run} disabled={busy || (!bookmarks && !withHistory)}>
            {busy ? t('Import…') : t('Importer')}
          </SmallButton>
        </div>
      </div>
    </Row>
  )
}

const GUIDE_URL = 'https://github.com/guillaumevergano/zak/blob/main/docs/customize/README.md'

/** Prompts to copy into Claude Code or Codex (run in a terminal, anywhere). */
const customizePrompts = (path: string): string[] => [
  t('Dans {path}, passe le moteur de recherche sur DuckDuckGo, le thème en sombre et la mise en veille des onglets à 30 minutes. Le schéma des réglages est indiqué dans le fichier ($schema).', { path }),
  t('Crée dans ~/Zak/extensions/mode-lecture une extension Chrome (Manifest V3) qui ajoute un bouton pour afficher la page en mode lecture, sans publicité ni menus. Je la chargerai dans Zak avec « Charger une extension non empaquetée ».')
]

/**
 * « Personnaliser avec Claude Code ou Codex » (docs/customize/): the settings file AI agents
 * can edit (applied at once) and home-made extensions, with prompts to start from.
 */
function CustomizeSection({ onError }: { onError: (err: unknown) => void }): JSX.Element {
  const [path, setPath] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  useEffect(() => {
    callInternal('settings/customizeInfo', null)
      .then((info) => setPath(info.settingsPath))
      .catch(() => {})
  }, [])
  return (
    <Section
      id="customize"
      title={t('Personnaliser avec Claude Code ou Codex')}
      nav={t('Personnaliser')}
      intro={t('Zak se configure aussi en langage naturel : demandez à Claude Code ou à Codex de modifier vos réglages ou de vous écrire une extension.')}
    >
      <Row title={t('Fichier de réglages')} detail={path ?? ''}>
        <div className="flex gap-2">
          <SmallButton onClick={() => void callInternal('settings/openSettingsFile', { reveal: false }).catch(onError)}>{t('Ouvrir')}</SmallButton>
          <SmallButton onClick={() => void callInternal('settings/openSettingsFile', { reveal: true }).catch(onError)}>{t('Afficher le dossier')}</SmallButton>
        </div>
      </Row>
      <ModsBlock onError={onError} />
      <Row title={t('Extensions maison')} detail={t('Une extension écrite par l’IA se charge dans Extensions et se recharge à chaque modification.')}>
        <a href={EXTENSIONS_PAGE_URL} className="rounded-[10px] border border-cream-edge bg-cream-2 px-3 py-1 text-[12.5px] font-semibold text-violet no-underline hover:border-violet/40">
          {t('Extensions')}
        </a>
      </Row>
      {path && (
        <div className="flex flex-col gap-2 border-t border-violet/10 py-3">
          <span className="text-[13px] font-semibold text-ink">{t('Exemples à copier')}</span>
          {customizePrompts(path).map((prompt, i) => (
            <div key={i} className="flex items-start gap-3 rounded-[12px] bg-cream-2 px-3 py-2">
              <p className="m-0 flex-1 text-[12.5px] text-sub">{prompt}</p>
              <SmallButton
                onClick={() =>
                  void navigator.clipboard.writeText(prompt).then(() => {
                    setCopied(i)
                    setTimeout(() => setCopied(null), 1500)
                  })
                }
              >
                {copied === i ? t('Copié') : t('Copier')}
              </SmallButton>
            </div>
          ))}
          <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold text-violet">
            {t('Lire le guide complet')}
          </a>
        </div>
      )}
    </Section>
  )
}

/**
 * Réglages → MCP: what the MCP server is for, how to connect an agent in three steps, and once
 * it runs, the tools agents get.
 */
function McpSection({ onError }: { onError: (err: unknown) => void }): JSX.Element {
  return (
    <Section
      id="mcp"
      title={t('MCP : piloter Zak depuis un assistant IA')}
      nav="MCP"
      intro={t(
        'Le MCP (Model Context Protocol) permet à Claude Code, Codex ou Claude Desktop de piloter Zak : ranger vos onglets, ajouter des favoris, changer vos réglages ou son apparence. Le serveur ne tourne que sur cet ordinateur.'
      )}
    >
      <ol aria-label={t('Installer le MCP')} className="m-0 mb-3 flex list-none flex-col gap-2 p-0">
        {[
          t('Activez le serveur MCP ci-dessous.'),
          t('Cliquez sur « Connecter à … » pour l’assistant installé sur cet ordinateur : Zak s’ajoute tout seul à sa configuration. Sinon, suivez la configuration manuelle.'),
          t('Dans l’assistant, demandez par exemple : « Range mes onglets Zak par sujet ».')
        ].map((step, i) => (
          <li key={i} className="flex items-start gap-3 text-[13px] text-sub">
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-violet/12 text-[12px] font-bold text-violet">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      <McpBlock onError={onError} />
    </Section>
  )
}

/** What each tool does, for people (agents read the English description). */
const MCP_TOOL_LABELS: Record<string, () => string> = {
  list_tabs: () => t('Lister les fenêtres et leurs onglets'),
  open_tab: () => t('Ouvrir une adresse ou une recherche dans un nouvel onglet'),
  close_tabs: () => t('Fermer des onglets'),
  activate_tab: () => t('Afficher un onglet'),
  group_tabs: () => t('Regrouper des onglets, avec un nom et une couleur'),
  list_favorites: () => t('Lister les favoris et les dossiers de la barre latérale'),
  add_favorite: () => t('Ajouter un favori, avec un emoji, dans un dossier'),
  get_settings: () => t('Lire les réglages'),
  update_settings: () => t('Modifier les réglages (moteur de recherche, thème, barre latérale…)'),
  get_appearance: () => t('Lire les couleurs et les polices'),
  update_appearance: () => t('Changer les couleurs et les polices'),
  list_mods: () => t('Lister les mods'),
  use_mod: () => t('Utiliser un mod (thème, page Nouvel onglet)')
}

/** The tools of the running server: what an agent connected to Zak can do. */
function McpTools(): JSX.Element | null {
  const [tools, setTools] = useState<McpToolInfo[] | null>(null)
  useEffect(() => {
    callInternal('settings/mcpTools', null).then(setTools).catch(() => {})
  }, [])
  if (!tools) return null
  return (
    <div className="flex flex-col gap-2 border-t border-violet/10 py-3">
      <span className="text-[13px] font-semibold text-ink">{t('Outils disponibles ({count})', { count: tools.length })}</span>
      <ul aria-label={t('Outils du MCP')} data-testid="mcp-tools" className="m-0 flex list-none flex-col p-0">
        {tools.map((tool) => (
          <li key={tool.name} className="flex items-center gap-3 border-t border-violet/6 py-1.5 first:border-t-0">
            <code className="w-[150px] shrink-0 truncate font-mono text-[12px] text-violet">{tool.name}</code>
            <span className="min-w-0 flex-1 text-[12.5px] text-sub">{MCP_TOOL_LABELS[tool.name]?.() ?? tool.description}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                tool.readOnly ? 'bg-cream-2 text-sub' : 'bg-violet/12 text-violet'
              }`}
            >
              {tool.readOnly ? t('Lecture seule') : t('Modifie Zak')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * « Laisser Claude Code ou Codex piloter Zak »: Zak's MCP server (main/mcp/), off by default, and
 * the commands that connect an agent to it.
 */
function McpBlock({ onError }: { onError: (err: unknown) => void }): JSX.Element {
  const [state, setState] = useState<McpState | null>(null)
  const [agents, setAgents] = useState<AgentStatus[]>([])
  const [busy, setBusy] = useState<AgentId | null>(null)
  const [done, setDone] = useState<AgentId | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  useEffect(() => {
    callInternal('settings/mcp', null).then(setState).catch(() => {})
    callInternal('settings/agents', null).then(setAgents).catch(() => {})
  }, [])
  const connect = (agent: AgentId): void => {
    setBusy(agent)
    callInternal('settings/connectAgent', { agent })
      .then((r) => {
        setAgents(r.agents)
        setState(r.mcp)
        setDone(agent)
      })
      .catch(onError)
      .finally(() => setBusy(null))
  }
  const agentName: Record<AgentId, string> = { 'claude-code': 'Claude Code', codex: 'Codex', 'claude-desktop': 'Claude Desktop' }
  const copy = (key: string, text: string): void =>
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  const claude = state?.url ? `claude mcp add --transport http zak ${state.url} --header "Authorization: Bearer ${state.token}"` : ''
  const codex = state?.url
    ? `# ~/.codex/config.toml
[mcp_servers.zak]
url = "${state.url}"
bearer_token_env_var = "ZAK_MCP_TOKEN"

# ${t('puis, dans votre terminal :')}
export ZAK_MCP_TOKEN=${state.token}`
    : ''
  return (
    <>
      <Row
        title={t('Laisser Claude Code ou Codex piloter Zak')}
        detail={t('Serveur MCP local : l’agent peut gérer vos onglets, groupes, favoris, réglages et mods. Jamais le contenu des pages, l’historique ni les mots de passe.')}
      >
        <Toggle
          label={t('Laisser Claude Code ou Codex piloter Zak')}
          on={state?.enabled ?? false}
          onChange={(enabled) => void callInternal('settings/setMcp', { enabled }).then(setState).catch(onError)}
        />
      </Row>
      {state?.error && <p className="m-0 pb-2 text-[12.5px] text-pink-button">{t('Le serveur n’a pas pu démarrer : {error}', { error: state.error })}</p>}
      <div className="flex flex-col gap-2 border-t border-violet/10 py-3" data-testid="agents">
        <span className="text-[13px] font-semibold text-ink">{t('Connexion en un clic')}</span>
        <div className="flex flex-wrap gap-2">
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={!a.installed || busy !== null}
              onClick={() => connect(a.id)}
              title={a.installed ? undefined : t('{name} n’est pas installé sur cet ordinateur.', { name: agentName[a.id] })}
              className="cursor-pointer rounded-[10px] border border-cream-edge bg-cream-2 px-3 py-1.5 text-[12.5px] font-semibold text-violet hover:border-violet/40 disabled:cursor-default disabled:opacity-50"
            >
              {busy === a.id
                ? t('Connexion…')
                : a.connected || done === a.id
                  ? t('✓ {name} connecté', { name: agentName[a.id] })
                  : t('Connecter à {name}', { name: agentName[a.id] })}
            </button>
          ))}
        </div>
        {done && (
          <p className="m-0 text-[12.5px] text-sub" role="status">
            {done === 'claude-desktop'
              ? t('C’est fait. Redémarrez Claude Desktop, puis demandez-lui par exemple : « Range mes onglets Zak par sujet ».')
              : t('C’est fait. Dans {name}, demandez par exemple : « Range mes onglets Zak par sujet ».', { name: agentName[done] })}
          </p>
        )}
      </div>
      {state?.enabled && state.url && <McpTools />}
      {state?.enabled && state.url && (
        <details className="border-t border-violet/10 py-3" data-testid="mcp-setup">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink">{t('Configuration manuelle')}</summary>
          <div className="mt-2 flex flex-col gap-2">
          {[
            { key: 'claude', label: 'Claude Code', text: claude },
            { key: 'codex', label: 'Codex', text: codex }
          ].map((item) => (
            <div key={item.key} className="flex items-start gap-3 rounded-[12px] bg-cream-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <span className="text-[12px] font-semibold text-ink">{item.label}</span>
                <pre className="m-0 mt-1 overflow-x-auto font-mono text-[11.5px] whitespace-pre-wrap break-all text-sub">{item.text}</pre>
              </div>
              <SmallButton onClick={() => copy(item.key, item.text)}>{copied === item.key ? t('Copié') : t('Copier')}</SmallButton>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <span className="flex-1 text-[12px] text-sub">{t('Le jeton donne accès à Zak : ne le partagez pas.')}</span>
            <SmallButton onClick={() => void callInternal('settings/newMcpToken', null).then(setState).catch(onError)}>
              {t('Nouveau jeton')}
            </SmallButton>
          </div>
          </div>
        </details>
      )}
    </>
  )
}

/** Mods: a theme for Zak itself and a new tab page of one's own (docs/customize/). */
function ModsBlock({ onError }: { onError: (err: unknown) => void }): JSX.Element {
  const [state, setState] = useState<{ dir: string; mods: ModInfo[] } | null>(null)
  useEffect(() => {
    const load = (): void => void callInternal('settings/mods', null).then(setState).catch(() => {})
    load()
    // Mods written meanwhile (by hand or by an agent) show when coming back to the page.
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [])
  const select = (kind: 'theme' | 'newtab', id: string | null): void =>
    void callInternal('settings/selectMod', { kind, id }).then(setState).catch(onError)
  const themes = state?.mods.filter((m) => m.hasTheme) ?? []
  const newtabs = state?.mods.filter((m) => m.hasNewtab) ?? []
  return (
    <>
      <Row title={t('Thème')} detail={t('Un mod peut changer les couleurs et les formes de Zak.')}>
        <select
          aria-label={t('Thème de Zak')}
          className={selectClass}
          value={themes.find((m) => m.themeActive)?.id ?? ''}
          onChange={(e) => select('theme', e.target.value || null)}
        >
          <option value="">{t('Celui de Zak')}</option>
          {themes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Row>
      <Row title={t('Page Nouvel onglet')} detail={t('Un mod peut la remplacer par la vôtre (sans accès à Internet).')}>
        <select
          aria-label={t('Page Nouvel onglet')}
          className={selectClass}
          value={newtabs.find((m) => m.newtabActive)?.id ?? ''}
          onChange={(e) => select('newtab', e.target.value || null)}
        >
          <option value="">{t('Celle de Zak')}</option>
          {newtabs.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Row>
      <Row
        title={t('Dossier des mods')}
        detail={state ? t('{n} mod(s) dans {dir}. Chaque mod est un dossier avec un mod.json.', { n: state.mods.length, dir: state.dir }) : ''}
      >
        <SmallButton onClick={() => void callInternal('settings/openModsFolder', null).catch(onError)}>{t('Ouvrir')}</SmallButton>
      </Row>
    </>
  )
}

type ProfileState = { current: string; list: ProfileInfo[] }

/**
 * Profiles (Fichier → Profils): each one a separate Zak, with its own history, favorites,
 * passwords, cookies and extensions.
 */
function ProfilesSection({ onError }: { onError: (err: unknown) => void }): JSX.Element {
  const [state, setState] = useState<ProfileState | null>(null)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('💼')

  useEffect(() => {
    callInternal('settings/profiles', null).then(setState).catch(() => {})
    // Opened from « Gérer les profils… »: show this section.
    if (location.hash === '#profiles') setTimeout(() => document.getElementById('profiles')?.scrollIntoView(), 50)
  }, [])

  const create = (e: FormEvent): void => {
    e.preventDefault()
    callInternal('settings/createProfile', { name, emoji, open: true })
      .then((next) => {
        setState(next)
        setName('')
      })
      .catch(onError)
  }

  return (
    <Section
      id="profiles"
      title={t('Profils')}
      intro={t('Chaque profil est un Zak séparé : historique, favoris, mots de passe, cookies et extensions ne se mélangent pas. Pratique pour séparer le perso et le travail.')}
    >
      <ul aria-label={t('Profils')} className="m-0 list-none p-0">
        {state?.list.map((p) => (
          <li key={p.id} data-testid="profile-row" className="flex items-center gap-3 border-t border-violet/10 py-2">
            <input
              aria-label={t('Emoji du profil')}
              defaultValue={p.emoji}
              maxLength={4}
              onBlur={(e) => e.target.value !== p.emoji && callInternal('settings/updateProfile', { id: p.id, emoji: e.target.value }).then(setState).catch(onError)}
              className="h-8 w-10 rounded-[8px] border border-cream-edge bg-cream-2 text-center text-[16px]"
            />
            <input
              aria-label={t('Nom du profil')}
              defaultValue={p.name}
              onBlur={(e) => e.target.value !== p.name && callInternal('settings/updateProfile', { id: p.id, name: e.target.value }).then(setState).catch(onError)}
              className="h-8 min-w-0 flex-1 rounded-[8px] border border-transparent bg-transparent px-2 text-[13.5px] font-semibold text-ink hover:border-cream-edge focus:border-pink focus:outline-none"
            />
            {p.id === state.current ? (
              <span className="text-[12.5px] font-semibold text-violet">{t('Ce profil')}</span>
            ) : (
              <>
                <SmallButton onClick={() => void callInternal('settings/openProfile', { id: p.id }).catch(onError)}>{t('Ouvrir')}</SmallButton>
                {p.id !== 'default' && (
                  <SmallButton
                    danger
                    onClick={() => {
                      if (!confirm(t('Supprimer le profil « {name} » et toutes ses données (historique, mots de passe, extensions…) ?', { name: p.name }))) return
                      callInternal('settings/removeProfile', { id: p.id }).then(setState).catch(onError)
                    }}
                  >
                    {t('Supprimer')}
                  </SmallButton>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={create} className="mt-2 flex items-center gap-2 border-t border-violet/10 pt-3">
        <input
          aria-label={t('Emoji du nouveau profil')}
          value={emoji}
          maxLength={4}
          onChange={(e) => setEmoji(e.target.value)}
          className="h-8 w-10 rounded-[8px] border border-cream-edge bg-cream-2 text-center text-[16px]"
        />
        <input
          required
          aria-label={t('Nom du nouveau profil')}
          placeholder={t('Nouveau profil (Travail, Famille…)')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${selectClass} h-8 flex-1`}
        />
        <SmallButton submit>{t('Créer et ouvrir')}</SmallButton>
      </form>
    </Section>
  )
}

/** « Navigateur par défaut »: the system confirms (macOS dialog, Windows settings), so re-check on return. */
function DefaultBrowser({ onError }: { onError: (err: unknown) => void }): JSX.Element {
  const [status, setStatus] = useState<DefaultBrowserStatus | null>(null)

  useEffect(() => {
    const refresh = (): void => void callInternal('settings/defaultBrowser', null).then(setStatus).catch(onError)
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
    // Once: `onError` is a new function at each render of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const detail =
    status === 'default'
      ? t('Les liens ouverts depuis les autres applications arrivent dans Zak.')
      : status === 'unavailable'
        ? t("Disponible dans l'application installée, pas en mode développement.")
        : t('Ouvrir dans Zak les liens cliqués dans les autres applications.')

  return (
    <Row title={t('Navigateur par défaut')} detail={detail}>
      {status === 'other' && (
        <SmallButton onClick={() => void callInternal('settings/makeDefaultBrowser', null).then(setStatus).catch(onError)}>
          {t('Définir par défaut')}
        </SmallButton>
      )}
      {status === 'default' && <span className="text-[12.5px] font-semibold text-violet">{t('✓ Par défaut')}</span>}
    </Row>
  )
}

function ClearData({ onError }: { onError: (err: unknown) => void }): JSX.Element {
  const [period, setPeriod] = useState<ClearPeriod>('hour')
  const [history, setHistory] = useState(true)
  const [siteData, setSiteData] = useState(false)
  const [cache, setCache] = useState(true)
  const [downloads, setDownloads] = useState(false)
  const [done, setDone] = useState(false)

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    setDone(false)
    callInternal('settings/clearData', { period, history, siteData, cache, downloads })
      .then(() => setDone(true))
      .catch(onError)
  }

  const check = (label: string, on: boolean, set: (v: boolean) => void): JSX.Element => (
    <label className="flex items-center gap-2 text-[13.5px] text-ink">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="size-4 accent-violet" />
      {label}
    </label>
  )

  return (
    <Section id="clear" title={t('Effacer les données de navigation')} nav={t('Effacer les données')}>
      <form onSubmit={submit} className="flex flex-col gap-3 border-t border-violet/10 pt-3">
        <label className="flex items-center gap-3 text-[13.5px] font-semibold text-ink">
          {t('Période')}
          <select value={period} onChange={(e) => setPeriod(e.target.value as ClearPeriod)} className={selectClass}>
            <option value="hour">{t('Dernière heure')}</option>
            <option value="day">{t('Dernières 24 heures')}</option>
            <option value="week">{t('7 derniers jours')}</option>
            <option value="month">{t('4 dernières semaines')}</option>
            <option value="all">{t('Toutes les périodes')}</option>
          </select>
        </label>
        {check(t('Historique de navigation'), history, setHistory)}
        {check(t('Historique des téléchargements (les fichiers restent)'), downloads, setDownloads)}
        {check(t('Cookies et données de sites (toutes périodes, vous serez déconnecté)'), siteData, setSiteData)}
        {check(t('Images et fichiers en cache (toutes périodes)'), cache, setCache)}
        <div className="flex items-center gap-3">
          <SmallButton danger submit>
            {t('Effacer les données')}
          </SmallButton>
          {done && <span className="text-[13px] text-sub">{t('Données effacées.')}</span>}
        </div>
      </form>
    </Section>
  )
}

/** The new tab page's sources, in the order of the settings page. */
const HEADLINE_SOURCES: [NewtabHeadlineSource, string][] = [
  ['zak', t('« Un peu d’espace. »')],
  ['custom', t('Mon texte')],
  ['quote', t('Une citation')],
  ['proverb', t('Un proverbe')],
  ['history', t('Ce jour dans l’histoire')],
  ['wikipedia', t('Le saviez-vous ?')]
]

function Row(props: { title: string; detail?: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-4 border-t border-violet/10 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink">{props.title}</div>
        {props.detail && <div className="text-[12.5px] text-sub">{props.detail}</div>}
      </div>
      {props.children}
    </div>
  )
}

function ExcludedDomains(props: { domains: string[]; onChange: (domains: string[]) => void }): JSX.Element {
  const [draft, setDraft] = useState('')

  const add = (e: FormEvent): void => {
    e.preventDefault()
    if (draft.trim() === '') return
    // Main normalizes (URL → domain, www. removed) and drops what isn't a domain.
    props.onChange([...props.domains, draft])
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-2 border-t border-violet/10 pt-3">
      <div>
        <div className="text-[13.5px] font-semibold text-ink">{t('Sites exclus')}</div>
        <div className="text-[12.5px] text-sub">{t('Jamais de lecteur flottant sur ces sites (sous-domaines compris).')}</div>
      </div>
      {props.domains.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={t('Sites exclus')}>
          {props.domains.map((domain) => (
            <li
              key={domain}
              className="flex items-center gap-1.5 rounded-full border border-cream-edge bg-cream-2 py-1 pr-1 pl-3 font-mono text-[12px] text-ink"
            >
              {domain}
              <button
                type="button"
                aria-label={t('Retirer {domain}', { domain })}
                onClick={() => props.onChange(props.domains.filter((d) => d !== domain))}
                className="grid size-5 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-sub hover:bg-violet/10 hover:text-ink"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('exemple.com')}
          aria-label={t('Site à exclure')}
          className="min-w-0 flex-1 rounded-[10px] border border-cream-edge bg-cream-2 px-3 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-pink"
        />
        <SmallButton submit>{t('Ajouter')}</SmallButton>
      </form>
    </div>
  )
}

document.title = t('Réglages')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsPage />
  </StrictMode>
)
