import '../lib/lang'
import { StrictMode, useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  DEFAULT_COLORS,
  DEFAULT_FONTS,
  type Appearance,
  type AppearancePatch,
  type ColorScheme,
  type ColorToken,
  type FontRole
} from '@shared/appearance'
import type { AppearanceState, GeneralSettings, SidebarLayout } from '@shared/types'
import { callInternal } from './api'
import { SmallButton } from './ui'
import '../styles.css'
import { t } from '@shared/i18n'

/** Colors, grouped as they appear in the window, with what each one paints. */
const GROUPS: { title: string; tokens: { token: ColorToken; label: string; detail: string }[] }[] = [
  {
    title: t('Cadre'),
    tokens: [
      { token: 'frame', label: t('Cadre'), detail: t("Barre d'onglets, barre latérale") },
      { token: 'frame-2', label: t('Tuiles'), detail: t('Onglets inactifs, tuiles des favoris') },
      { token: 'frame-3', label: t('Survol'), detail: t('Tuile ou onglet sous la souris') },
      { token: 'frame-line', label: t('Séparateurs'), detail: t('Traits et bordures sur le cadre') },
      { token: 'frame-text', label: t('Texte'), detail: t('Titres des onglets, dossiers') },
      { token: 'frame-sub', label: t('Texte secondaire'), detail: t('Icônes et libellés discrets') },
      { token: 'frame-dim', label: t('Texte discret'), detail: t('Nombres de favoris') }
    ]
  },
  {
    title: t('Panneau'),
    tokens: [
      { token: 'cream', label: t('Panneau'), detail: t("Onglet actif, barre d'outils, pages de Zak") },
      { token: 'cream-2', label: t('Champs'), detail: t("Barre d'adresse, champs, boutons") },
      { token: 'cream-edge', label: t('Bordures'), detail: t('Contours des champs et des cartes') },
      { token: 'cream-ink', label: t('Texte'), detail: t('Texte du panneau') },
      { token: 'cream-sub', label: t('Texte secondaire'), detail: t('Adresse, détails') },
      { token: 'cream-dim', label: t('Texte discret'), detail: t('Boutons indisponibles') },
      { token: 'blush', label: t('Sous-titre'), detail: t('« Pour vos prochaines idées. » du nouvel onglet') }
    ]
  },
  {
    title: t('Accents'),
    tokens: [
      { token: 'iris', label: t('Violet'), detail: t('Icônes, réglages actifs') },
      { token: 'iris-ring', label: t('Contour violet'), detail: t('Favori de la page ouverte, vue partagée') },
      { token: 'pink', label: t('Rose'), detail: t("Chargement, focus de la barre d'adresse, onglet sonore") },
      { token: 'pink-button', label: t('Rose des boutons'), detail: t("Boutons d'action, alertes") },
      { token: 'pink-soft', label: t('Rose clair'), detail: t('Petit texte rose sur fond sombre') }
    ]
  }
]

/** Fonts offered per role (the first is Zak's own, embedded); any installed font can be typed. */
const FONT_CHOICES: Record<FontRole, string[]> = {
  ui: ['DM Sans', 'Helvetica Neue', 'Avenir Next', 'Futura', 'Gill Sans', 'Verdana', 'Segoe UI'],
  display: ['Fraunces', 'Georgia', 'Baskerville', 'Didot', 'Hoefler Text', 'Palatino', 'DM Sans'],
  mono: ['JetBrains Mono', 'Menlo', 'SF Mono', 'Monaco', 'Courier New', 'Consolas']
}
const FONT_ROLES: { role: FontRole; label: string; detail: string; sample: string }[] = [
  { role: 'ui', label: t('Interface'), detail: t('Onglets, menus, réglages'), sample: t('Où voulez-vous aller ?') },
  { role: 'display', label: t('Titres'), detail: t('Nouvel onglet, titres des pages de Zak'), sample: t('Un peu d’espace.') },
  { role: 'mono', label: t('Adresse et code'), detail: t("Adresse dans la barre d'adresse"), sample: 'hellozak.com/mods' }
]
const OTHER = '__other'

/** While a color is dragged in the picker, at most one save every this many ms (the window follows). */
const SEND_EVERY_MS = 60

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

/**
 * zak://appearance (CLAUDE.md §7): every color of the interface, the fonts, the theme and the layout.
 * Everything applies at once to the whole window around this page (main inserts the CSS everywhere),
 * so the page is its own preview. Colors belong to a theme: the page edits the one on screen.
 */
function AppearancePage(): JSX.Element {
  const [state, setState] = useState<AppearanceState | null>(null)
  const [scheme, setScheme] = useState<ColorScheme>(darkQuery.matches ? 'dark' : 'light')
  const [error, setError] = useState<string | null>(null)
  const fail = (err: unknown): void => setError(String(err))
  const send = useCoalescedSend(fail)

  useEffect(() => {
    callInternal('appearance/get', null).then(setState).catch(fail)
    const onScheme = (): void => setScheme(darkQuery.matches ? 'dark' : 'light')
    darkQuery.addEventListener('change', onScheme)
    return () => darkQuery.removeEventListener('change', onScheme)
  }, [])

  if (!state) {
    return <main className="mx-auto max-w-[820px] px-6 py-10">{error && <p role="alert">{error}</p>}</main>
  }
  const { appearance } = state

  const change = (patch: AppearancePatch): void => {
    setState((s) => (s ? { ...s, appearance: applyLocally(s.appearance, patch) } : s))
    send(patch)
  }
  const setTheme = (theme: GeneralSettings['theme']): void => {
    setState((s) => (s ? { ...s, theme } : s))
    callInternal('appearance/setTheme', { theme }).catch(fail)
  }
  const setLayout = (patch: Partial<Pick<SidebarLayout, 'side' | 'tabs'>>): void => {
    setState((s) => (s ? { ...s, sidebar: { ...s.sidebar, ...patch } } : s))
    callInternal('appearance/setLayout', patch).catch(fail)
  }
  const resetAll = (): void => {
    callInternal('appearance/reset', null)
      .then((fresh) => setState((s) => (s ? { ...s, appearance: fresh } : s)))
      .catch(fail)
  }
  const changed =
    Object.keys(appearance.colors.light).length + Object.keys(appearance.colors.dark).length + Object.values(appearance.fonts).filter(Boolean).length

  return (
    <main className="mx-auto flex max-w-[820px] flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 font-serif text-[34px] font-semibold text-cream-ink">{t('Apparence')}</h1>
          <p className="m-0 mt-1 text-[14px] text-cream-sub">
            {t('Chaque changement s’applique tout de suite à la fenêtre : regardez autour de cette page.')}
          </p>
        </div>
        <SmallButton disabled={changed === 0} onClick={resetAll}>
          {t('Tout rétablir')}
        </SmallButton>
      </header>

      {error && (
        <p role="alert" className="m-0 rounded-[12px] bg-white/70 px-4 py-3 text-[13px] text-pink-button">
          {error}
        </p>
      )}

      <Section title={t('Thème et emplacements')}>
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
                aria-checked={state.theme === value}
                onClick={() => setTheme(value)}
                className={`cursor-pointer rounded-[8px] border-0 px-3 py-1 text-[12.5px] font-semibold ${
                  state.theme === value ? 'bg-violet text-white' : 'bg-transparent text-sub hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
        <Row title={t('Position de la barre latérale')} detail={t('À gauche ou à droite de la page.')}>
          <select
            aria-label={t('Position de la barre latérale')}
            className={selectClass}
            value={state.sidebar.side}
            onChange={(e) => setLayout({ side: e.target.value === 'left' ? 'left' : 'right' })}
          >
            <option value="left">{t('À gauche')}</option>
            <option value="right">{t('À droite')}</option>
          </select>
        </Row>
        <Row title={t('Onglets')} detail={t('En haut de la fenêtre, ou un par ligne dans la barre latérale.')}>
          <select
            aria-label={t('Position des onglets')}
            className={selectClass}
            value={state.sidebar.tabs}
            onChange={(e) => setLayout({ tabs: e.target.value === 'sidebar' ? 'sidebar' : 'top' })}
          >
            <option value="top">{t('En haut')}</option>
            <option value="sidebar">{t('Dans la barre latérale')}</option>
          </select>
        </Row>
      </Section>

      <Section
        title={scheme === 'dark' ? t('Couleurs du thème sombre') : t('Couleurs du thème clair')}
        intro={
          (scheme === 'dark'
            ? t('Vous modifiez le thème sombre, celui qui est affiché. Passez en clair pour modifier ses couleurs.')
            : t('Vous modifiez le thème clair, celui qui est affiché. Passez en sombre pour modifier ses couleurs.')) +
          (state.modTheme ? ' ' + t('Elles passent au-dessus du thème « {name} ».', { name: state.modTheme }) : '') +
          ' ' +
          t('Les fenêtres privées gardent leurs couleurs.')
        }
      >
        {GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col">
            <h3 className="m-0 mt-3 mb-1 text-[12px] font-bold tracking-[0.5px] text-sub uppercase">{group.title}</h3>
            {group.tokens.map(({ token, label, detail }) => (
              <ColorRow
                key={token}
                label={label}
                detail={detail}
                value={appearance.colors[scheme][token] ?? DEFAULT_COLORS[scheme][token]}
                changed={token in appearance.colors[scheme]}
                onChange={(color) => change({ colors: { [scheme]: { [token]: color } } })}
                onReset={() => change({ colors: { [scheme]: { [token]: null } } })}
              />
            ))}
          </div>
        ))}
      </Section>

      <Section title={t('Polices')} intro={t('Une police installée sur l’ordinateur, ou celles de Zak.')}>
        {FONT_ROLES.map(({ role, label, detail, sample }) => (
          <FontRow
            key={role}
            role={role}
            label={label}
            detail={detail}
            sample={sample}
            value={appearance.fonts[role]}
            onChange={(font) => change({ fonts: { [role]: font } })}
          />
        ))}
      </Section>

      <p className="m-0 text-[12.5px] text-cream-sub">
        {t('Aussi par un agent (serveur MCP de Zak : get_appearance, update_appearance) ou dans le fichier de réglages, clé « appearance ».')}
      </p>
    </main>
  )
}

/** The page's own state follows at once; main gets the change a moment later (see useCoalescedSend). */
function applyLocally(current: Appearance, patch: AppearancePatch): Appearance {
  const next: Appearance = { colors: { light: { ...current.colors.light }, dark: { ...current.colors.dark } }, fonts: { ...current.fonts } }
  for (const scheme of ['light', 'dark'] as const) {
    for (const [token, color] of Object.entries(patch.colors?.[scheme] ?? {}) as [ColorToken, string | null][]) {
      if (color === null || color.toLowerCase() === DEFAULT_COLORS[scheme][token]) delete next.colors[scheme][token]
      else next.colors[scheme][token] = color.toLowerCase()
    }
  }
  for (const [role, font] of Object.entries(patch.fonts ?? {}) as [FontRole, string | null][]) {
    next.fonts[role] = font && font !== DEFAULT_FONTS[role] ? font : null
  }
  return next
}

/** Merges the changes made while a save is under way, and sends them at most every SEND_EVERY_MS. */
function useCoalescedSend(fail: (err: unknown) => void): (patch: AppearancePatch) => void {
  const pending = useRef<AppearancePatch | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flush = (): void => {
    timer.current = null
    const patch = pending.current
    pending.current = null
    if (patch) callInternal('appearance/set', patch).catch(fail)
  }
  return (patch) => {
    const merged = pending.current ?? {}
    pending.current = {
      colors: {
        light: { ...merged.colors?.light, ...patch.colors?.light },
        dark: { ...merged.colors?.dark, ...patch.colors?.dark }
      },
      fonts: { ...merged.fonts, ...patch.fonts }
    }
    if (!timer.current) timer.current = setTimeout(flush, SEND_EVERY_MS)
  }
}

function ColorRow(props: {
  label: string
  detail: string
  value: string
  changed: boolean
  onChange: (color: string) => void
  onReset: () => void
}): JSX.Element {
  const [text, setText] = useState(props.value)
  useEffect(() => setText(props.value), [props.value])
  const commit = (value: string): void => {
    const hex = value.trim().replace(/^([0-9a-f]{6})$/i, '#$1')
    if (/^#[0-9a-f]{6}$/i.test(hex)) props.onChange(hex)
    else setText(props.value)
  }
  return (
    <div data-testid="color-row" className="flex items-center gap-3 border-t border-violet/10 py-2">
      <input
        type="color"
        aria-label={props.label}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-[8px] border border-cream-edge bg-transparent p-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink">
          {props.label}
          {props.changed && <span className="ml-2 text-[11.5px] font-bold text-violet">{t('modifiée')}</span>}
        </div>
        <div className="truncate text-[12.5px] text-sub">{props.detail}</div>
      </div>
      <input
        aria-label={t('{name}, code hexadécimal', { name: props.label })}
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit(e.currentTarget.value)}
        className="w-[92px] shrink-0 rounded-[8px] border border-cream-edge bg-cream-2 px-2 py-1 font-mono text-[12.5px] text-cream-ink outline-none focus:border-pink"
      />
      <button
        type="button"
        title={t('Rétablir la couleur de Zak')}
        aria-label={t('Rétablir {name}', { name: props.label })}
        disabled={!props.changed}
        onClick={props.onReset}
        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[8px] border-0 bg-transparent text-[15px] text-sub hover:bg-black/6 disabled:invisible"
      >
        ↺
      </button>
    </div>
  )
}

function FontRow(props: {
  role: FontRole
  label: string
  detail: string
  sample: string
  value: string | null
  onChange: (font: string | null) => void
}): JSX.Element {
  const current = props.value ?? DEFAULT_FONTS[props.role]
  const choices = FONT_CHOICES[props.role]
  const [other, setOther] = useState(!choices.includes(current))
  const [typed, setTyped] = useState(choices.includes(current) ? '' : current)
  const pick = (name: string): void => props.onChange(name === DEFAULT_FONTS[props.role] ? null : name)
  return (
    <div data-testid="font-row" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-violet/10 py-3">
      <div className="min-w-[160px] flex-1">
        <div className="text-[13.5px] font-semibold text-ink">{props.label}</div>
        <div className="text-[12.5px] text-sub">{props.detail}</div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <select
          aria-label={t('Police : {name}', { name: props.label })}
          className={selectClass}
          value={other ? OTHER : current}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setOther(true)
              return
            }
            setOther(false)
            pick(e.target.value)
          }}
        >
          {choices.map((name, i) => (
            <option key={name} value={name}>
              {i === 0 ? t('{name} (Zak)', { name }) : name}
            </option>
          ))}
          <option value={OTHER}>{t('Autre police installée…')}</option>
        </select>
        {other && (
          <input
            aria-label={t('Nom de la police : {name}', { name: props.label })}
            placeholder={t('Nom exact, ex. Inter')}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={() => typed.trim() && pick(typed.trim())}
            onKeyDown={(e) => e.key === 'Enter' && typed.trim() && pick(typed.trim())}
            className="w-[220px] rounded-[8px] border border-cream-edge bg-cream-2 px-2 py-1 text-[13px] text-cream-ink outline-none focus:border-pink"
          />
        )}
      </div>
      <p
        aria-hidden
        style={{ fontFamily: `'${current}', ${props.role === 'mono' ? 'monospace' : props.role === 'display' ? 'serif' : 'sans-serif'}` }}
        className="m-0 w-full truncate text-[22px] text-cream-ink"
      >
        {props.sample}
      </p>
    </div>
  )
}

const selectClass = 'max-w-[300px] rounded-[10px] border border-cream-edge bg-cream-2 px-2 py-1.5 text-[13px] text-cream-ink'

function Section(props: { title: string; intro?: string; children: ReactNode }): JSX.Element {
  return (
    <section aria-label={props.title} className="glass-card flex flex-col rounded-[18px] px-5 py-4">
      <h2 className="m-0 text-[15px] font-bold text-title">{props.title}</h2>
      {props.intro ? <p className="m-0 mt-1 mb-2 text-[13px] text-sub">{props.intro}</p> : <div className="h-2" />}
      {props.children}
    </section>
  )
}

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

document.title = t('Apparence')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppearancePage />
  </StrictMode>
)
