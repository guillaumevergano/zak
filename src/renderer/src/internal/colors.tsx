import '../lib/lang'
import { StrictMode, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { ColorsPageState } from '@shared/ipc'
import {
  COLOR_FORMATS,
  contrast,
  formatColor,
  inkOn,
  kitToCss,
  type BrandColorRole,
  type BrandFolder,
  type BrandKit,
  type BrandKitSummary,
  type ColorFormat,
  type FontRole,
  type SavedColor
} from '@shared/colors'
import { callInternal } from './api'
import { SmallButton } from './ui'
import '../styles.css'
import { locale, plural, t } from '@shared/i18n'

type View = { tab: 'colors' } | { tab: 'kits'; folder: string | null } | { tab: 'kit'; id: string }

/** `#kits`, `#kits=<folder>`, `#kit=<id>`; anything else: the eyedropper's colors. */
const viewOf = (hash: string): View => {
  const kit = /^#kit=(.+)$/.exec(hash)?.[1]
  if (kit) return { tab: 'kit', id: decodeURIComponent(kit) }
  const folder = /^#kits(?:=(.*))?$/.exec(hash)
  if (folder) return { tab: 'kits', folder: folder[1] ? decodeURIComponent(folder[1]) : null }
  return { tab: 'colors' }
}

const UNFILED = '-'

const roleName = (role: BrandColorRole): string =>
  ({
    primary: t('Principale'),
    accent: t('Accent'),
    background: t('Fond'),
    surface: t('Surface'),
    text: t('Texte'),
    neutral: t('Neutre')
  })[role]

const fontRoleName = (role: FontRole): string =>
  ({ heading: t('Titres'), body: t('Texte courant'), button: t('Boutons'), link: t('Liens') })[role]

const sourceName = (source: string): string =>
  ({ google: 'Google Fonts', adobe: 'Adobe Fonts', web: t('Police du site'), system: t('Police système') })[source] ?? source

const dateOf = (time: number): string => new Date(time).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })

const isMac = navigator.platform.startsWith('Mac')

/**
 * zak://colors (CLAUDE.md §6.8): the eyedropper's history and favorite colors, and the brand kits
 * read from sites (colors, fonts, text styles, buttons…), in folders, with a comment.
 */
function ColorsPage(): JSX.Element {
  const [state, setState] = useState<ColorsPageState | null>(null)
  const [view, setView] = useState<View>(() => viewOf(location.hash))
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fail = (err: unknown): void => setError(String(err instanceof Error ? err.message : err))

  const refresh = useCallback(() => {
    callInternal('colors/state', null).then(setState).catch(fail)
  }, [])

  useEffect(() => {
    refresh()
    const onHash = (): void => setView(viewOf(location.hash))
    // A color picked or a kit read meanwhile (from the sidebar, the menu).
    const onShow = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onShow)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [refresh])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 2500)
    return () => clearTimeout(timer)
  }, [notice])

  const go = (hash: string): void => {
    location.hash = hash
  }
  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text).then(() => setNotice(t('{value} copié.', { value: text })))
  }
  const setColors = (colors: SavedColor[]): void => setState((s) => s && { ...s, colors })

  const tab = view.tab === 'colors' ? 'colors' : 'kits'
  return (
    <main className="mx-auto flex max-w-[1040px] flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="m-0 font-serif text-[34px] font-semibold text-cream-ink">{t('Couleurs')}</h1>
        <button
          type="button"
          data-testid="colors-pick"
          onClick={() => callInternal('colors/pick', null).catch(fail)}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-full border-0 bg-pink-button px-5 text-[14px] font-semibold text-white hover:bg-pink"
        >
          <span aria-hidden>💧</span>
          {t('Prendre une couleur')}
          <kbd className="font-sans text-[12px] opacity-80">{isMac ? '⌘⇧K' : t('Ctrl+Maj+K')}</kbd>
        </button>
      </header>

      <nav className="flex gap-1 border-b border-cream-edge" aria-label={t('Sections')}>
        <TabLink active={tab === 'colors'} onClick={() => go('')} count={state?.colors.length}>
          {t('Pipette')}
        </TabLink>
        <TabLink active={tab === 'kits'} onClick={() => go('kits')} count={state?.kits.length}>
          {t('Chartes graphiques')}
        </TabLink>
      </nav>

      {(notice || error) && (
        <p role={error ? 'alert' : 'status'} className={`m-0 rounded-[12px] bg-white/70 px-4 py-3 text-[13px] ${error ? 'text-pink-button' : 'text-ink'}`}>
          {error ?? notice}
        </p>
      )}

      {state && view.tab === 'colors' && (
        <PickedColors
          state={state}
          copy={copy}
          setColors={setColors}
          setFormat={(format) => {
            setState((s) => s && { ...s, format })
            callInternal('colors/setFormat', { format }).catch(fail)
          }}
          fail={fail}
        />
      )}
      {state && view.tab === 'kits' && (
        <KitList state={state} folder={view.folder} go={go} setFolders={(folders) => setState((s) => s && { ...s, folders })} refresh={refresh} fail={fail} />
      )}
      {state && view.tab === 'kit' && (
        <KitDetail
          key={view.id}
          id={view.id}
          folders={state.folders}
          favorites={state.colors}
          copy={copy}
          setColors={setColors}
          go={go}
          refresh={refresh}
          fail={fail}
        />
      )}
    </main>
  )
}

function TabLink(props: { active: boolean; onClick: () => void; count?: number; children: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      aria-current={props.active ? 'page' : undefined}
      onClick={props.onClick}
      className={`-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-3 py-2 text-[14px] font-semibold ${
        props.active ? 'border-pink text-cream-ink' : 'border-transparent text-cream-sub hover:text-cream-ink'
      }`}
    >
      {props.children}
      {props.count !== undefined && props.count > 0 && <span className="ml-1.5 text-[12px] font-normal text-cream-sub">{props.count}</span>}
    </button>
  )
}

// ─── Eyedropper: favorites and history ─────────────────────────────────────────────────────────

function PickedColors(props: {
  state: ColorsPageState
  copy: (text: string) => void
  setColors: (colors: SavedColor[]) => void
  setFormat: (format: ColorFormat) => void
  fail: (err: unknown) => void
}): JSX.Element {
  const { state, copy, setColors, fail } = props
  const favorites = state.colors.filter((c) => c.favorite)
  const history = state.colors.filter((c) => !c.favorite)
  const act = (promise: Promise<SavedColor[]>): void => void promise.then(setColors).catch(fail)

  return (
    <>
      <section className="glass-card flex flex-wrap items-center gap-3 rounded-[16px] px-5 py-3">
        <span className="min-w-[220px] flex-1 text-[13px] text-sub">
          {t('Cliquez n’importe où sur votre écran, même hors de Zak : la couleur est copiée et gardée ici. Rien ne quitte votre ordinateur.')}
        </span>
        <span className="text-[13px] text-sub">{t('Copier en')}</span>
        <div className="flex gap-1" role="radiogroup" aria-label={t('Format copié')}>
          {COLOR_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              role="radio"
              aria-checked={state.format === format}
              onClick={() => props.setFormat(format)}
              className={`h-8 cursor-pointer rounded-[10px] border px-3 text-[12px] font-semibold uppercase ${
                state.format === format ? 'border-violet bg-violet text-white' : 'border-cream-edge bg-cream-2 text-violet hover:border-violet/40'
              }`}
            >
              {format}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="favorites" className="flex flex-col gap-3">
        <h2 id="favorites" className="m-0 text-[17px] font-bold text-cream-ink">
          {t('Favoris')} <span className="text-[13px] font-normal text-cream-sub">{favorites.length || ''}</span>
        </h2>
        {favorites.length === 0 ? (
          <p className="m-0 text-[13px] text-cream-sub">{t('Ajoutez une couleur aux favoris avec ☆ : elle reste ici, même quand l’historique est effacé.')}</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-0" aria-label={t('Couleurs favorites')}>
            {favorites.map((color) => (
              <ColorCard
                key={color.id}
                color={color}
                format={state.format}
                copy={copy}
                onFavorite={(favorite) => act(callInternal('colors/setFavorite', { id: color.id, favorite }))}
                onRename={(name) => act(callInternal('colors/rename', { id: color.id, name }))}
                onRemove={() => act(callInternal('colors/remove', { id: color.id }))}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="history" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="history" className="m-0 text-[17px] font-bold text-cream-ink">
            {t('Historique')} <span className="text-[13px] font-normal text-cream-sub">{history.length || ''}</span>
          </h2>
          {history.length > 0 && <SmallButton onClick={() => act(callInternal('colors/clearHistory', null))}>{t('Effacer l’historique')}</SmallButton>}
        </div>
        {history.length === 0 ? (
          <p className="m-0 py-6 text-center text-[14px] text-cream-sub">
            {t('Aucune couleur prise. Cliquez sur la pipette de la barre latérale, ou {shortcut}.', { shortcut: isMac ? '⌘⇧K' : t('Ctrl+Maj+K') })}
          </p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-0" aria-label={t('Historique des couleurs')}>
            {history.map((color) => (
              <ColorCard
                key={color.id}
                color={color}
                format={state.format}
                copy={copy}
                onFavorite={(favorite) => act(callInternal('colors/setFavorite', { id: color.id, favorite }))}
                onRemove={() => act(callInternal('colors/remove', { id: color.id }))}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function ColorCard(props: {
  color: SavedColor
  format: ColorFormat
  copy: (text: string) => void
  onFavorite: (favorite: boolean) => void
  onRename?: (name: string) => void
  onRemove: () => void
}): JSX.Element {
  const { color } = props
  const [naming, setNaming] = useState(false)
  return (
    <li data-testid="saved-color" data-hex={color.hex} className="group glass-card flex flex-col overflow-hidden rounded-[14px]">
      <button
        type="button"
        onClick={() => props.copy(formatColor(color.hex, props.format))}
        title={t('Copier {value}', { value: formatColor(color.hex, props.format) })}
        className="relative h-[86px] cursor-copy border-0"
        style={{ background: color.hex, color: inkOn(color.hex) }}
      >
        <span className="absolute bottom-1.5 left-2 text-[11px] font-semibold opacity-0 transition-opacity group-hover:opacity-90">{t('Copier')}</span>
      </button>
      <div className="flex items-start gap-1 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          {naming && props.onRename ? (
            <input
              autoFocus
              defaultValue={color.name}
              aria-label={t('Nom de la couleur')}
              onBlur={(e) => {
                setNaming(false)
                props.onRename!(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setNaming(false)
              }}
              className="h-6 w-full min-w-0 rounded-md border border-cream-edge bg-white px-1.5 text-[12.5px] text-cream-ink outline-none focus:border-pink"
            />
          ) : (
            <p
              className={`m-0 truncate text-[13px] font-semibold text-cream-ink ${props.onRename ? 'cursor-text' : ''}`}
              title={props.onRename ? t('Renommer') : undefined}
              onDoubleClick={() => props.onRename && setNaming(true)}
            >
              {color.name || <span className="font-mono">{color.hex}</span>}
            </p>
          )}
          <p className="m-0 truncate font-mono text-[11px] text-cream-sub">{color.name ? color.hex : formatColor(color.hex, props.format === 'hex' ? 'rgb' : props.format)}</p>
          {color.sourceUrl && (
            <p className="m-0 truncate text-[11px] text-cream-sub" title={color.sourceUrl}>
              {color.sourceTitle ?? color.sourceUrl}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center">
          <IconButton label={color.favorite ? t('Retirer des favoris') : t('Ajouter aux favoris')} pressed={color.favorite} onClick={() => props.onFavorite(!color.favorite)}>
            {color.favorite ? '★' : '☆'}
          </IconButton>
          {props.onRename && (
            <IconButton label={t('Renommer')} onClick={() => setNaming(true)}>
              ✎
            </IconButton>
          )}
          <IconButton label={t('Supprimer')} onClick={props.onRemove}>
            ✕
          </IconButton>
        </div>
      </div>
    </li>
  )
}

function IconButton(props: { label: string; onClick: () => void; pressed?: boolean; children: string }): JSX.Element {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.pressed}
      onClick={props.onClick}
      className={`grid size-7 cursor-pointer place-items-center rounded-[8px] border-0 bg-transparent text-[13px] hover:bg-cream-edge ${
        props.pressed ? 'text-pink-button' : 'text-cream-sub hover:text-cream-ink'
      }`}
    >
      {props.children}
    </button>
  )
}

// ─── Brand kits: folders and list ──────────────────────────────────────────────────────────────

function KitList(props: {
  state: ColorsPageState
  folder: string | null
  go: (hash: string) => void
  setFolders: (folders: BrandFolder[]) => void
  refresh: () => void
  fail: (err: unknown) => void
}): JSX.Element {
  const { state, folder, go, fail } = props
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<BrandFolder | 'new' | null>(null)
  const q = query.trim().toLowerCase()
  const inFolder = (kit: BrandKitSummary): boolean => (folder === null ? true : folder === UNFILED ? kit.folderId === null : kit.folderId === folder)
  const matches = (kit: BrandKitSummary): boolean =>
    !q || [kit.title, kit.host, kit.comment, ...kit.fonts, ...kit.colors].some((text) => text.toLowerCase().includes(q))
  const kits = state.kits.filter((k) => inFolder(k) && matches(k))
  const count = (id: string | null): number => state.kits.filter((k) => k.folderId === id).length
  const current = state.folders.find((f) => f.id === folder)

  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start">
      <aside className="flex shrink-0 flex-col gap-0.5 md:w-[220px]" aria-label={t('Dossiers')}>
        <FolderLink active={folder === null} onClick={() => go('kits')} emoji="🗂️" name={t('Toutes les chartes')} count={state.kits.length} />
        <FolderLink active={folder === UNFILED} onClick={() => go(`kits=${UNFILED}`)} emoji="📄" name={t('Sans dossier')} count={count(null)} />
        {state.folders.map((f) =>
          editing !== 'new' && editing?.id === f.id ? (
            <FolderForm
              key={f.id}
              initial={f}
              onCancel={() => setEditing(null)}
              onSave={(name, emoji) =>
                callInternal('colors/updateFolder', { id: f.id, name, emoji })
                  .then((folders) => {
                    props.setFolders(folders)
                    setEditing(null)
                  })
                  .catch(fail)
              }
            />
          ) : (
            <FolderLink
              key={f.id}
              active={folder === f.id}
              onClick={() => go(`kits=${encodeURIComponent(f.id)}`)}
              emoji={f.emoji ?? '📁'}
              name={f.name}
              count={count(f.id)}
              onEdit={() => setEditing(f)}
            />
          )
        )}
        {editing === 'new' ? (
          <FolderForm
            onCancel={() => setEditing(null)}
            onSave={(name, emoji) =>
              callInternal('colors/createFolder', { name, emoji })
                .then((folders) => {
                  props.setFolders(folders)
                  setEditing(null)
                  const created = folders[folders.length - 1]
                  if (created) go(`kits=${encodeURIComponent(created.id)}`)
                })
                .catch(fail)
            }
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="mt-1 h-9 cursor-pointer rounded-[10px] border border-dashed border-cream-edge bg-transparent px-3 text-left text-[13px] font-semibold text-cream-sub hover:border-violet/40 hover:text-violet"
          >
            {t('+ Nouveau dossier')}
          </button>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col gap-4" aria-label={t('Chartes graphiques')}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="m-0 flex-1 text-[17px] font-bold text-cream-ink">
            {folder === null ? t('Toutes les chartes') : folder === UNFILED ? t('Sans dossier') : current ? `${current.emoji ?? '📁'} ${current.name}` : t('Dossier')}
          </h2>
          {current && (
            <SmallButton
              onClick={() =>
                callInternal('colors/removeFolder', { id: current.id })
                  .then((folders) => {
                    props.setFolders(folders)
                    props.refresh()
                    go('kits')
                  })
                  .catch(fail)
              }
            >
              {t('Supprimer le dossier')}
            </SmallButton>
          )}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Rechercher un site, une police, un commentaire')}
            aria-label={t('Rechercher une charte')}
            className="h-10 w-[300px] max-w-full rounded-full border border-cream-edge bg-cream-2 px-4 text-[14px] text-cream-ink outline-none focus:border-pink"
          />
        </div>
        {kits.length === 0 ? (
          <p className="m-0 rounded-[16px] border border-dashed border-cream-edge px-6 py-10 text-center text-[14px] text-cream-sub">
            {q
              ? t('Aucun résultat.')
              : t('Sur un site, cliquez sur l’icône palette de la barre latérale (ou clic droit → « Analyser la charte graphique ») : ses couleurs, ses polices et ses styles arrivent ici.')}
          </p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4 p-0">
            {kits.map((kit) => (
              <KitCard key={kit.id} kit={kit} folder={state.folders.find((f) => f.id === kit.folderId) ?? null} onOpen={() => go(`kit=${encodeURIComponent(kit.id)}`)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function FolderLink(props: { active: boolean; onClick: () => void; emoji: string; name: string; count: number; onEdit?: () => void }): JSX.Element {
  return (
    <div className={`group flex items-center rounded-[10px] ${props.active ? 'bg-cream-2' : 'hover:bg-cream-2/60'}`}>
      <button
        type="button"
        aria-current={props.active ? 'page' : undefined}
        onClick={props.onClick}
        className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent px-3 text-left text-[13.5px] text-cream-ink"
      >
        <span aria-hidden className="font-emoji">
          {props.emoji}
        </span>
        <span className={`min-w-0 flex-1 truncate ${props.active ? 'font-semibold' : ''}`}>{props.name}</span>
        <span className="text-[12px] text-cream-sub">{props.count}</span>
      </button>
      {props.onEdit && (
        <button
          type="button"
          onClick={props.onEdit}
          aria-label={t('Modifier le dossier {name}', { name: props.name })}
          title={t('Modifier')}
          className="mr-1 grid size-7 cursor-pointer place-items-center rounded-[8px] border-0 bg-transparent text-[12px] text-cream-sub opacity-0 hover:bg-cream-edge group-hover:opacity-100 focus:opacity-100"
        >
          ✎
        </button>
      )}
    </div>
  )
}

function FolderForm(props: { initial?: BrandFolder; onSave: (name: string, emoji: string | null) => void; onCancel: () => void }): JSX.Element {
  const [name, setName] = useState(props.initial?.name ?? '')
  const [emoji, setEmoji] = useState(props.initial?.emoji ?? '')
  return (
    <form
      className="glass-card my-1 flex flex-col gap-2 rounded-[12px] p-2"
      aria-label={props.initial ? t('Modifier le dossier') : t('Nouveau dossier')}
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) props.onSave(name.trim(), [...emoji.trim()].slice(0, 2).join('') || null)
      }}
    >
      <div className="flex gap-1.5">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="📁"
          aria-label={t('Emoji')}
          className="h-8 w-10 shrink-0 rounded-[8px] border border-cream-edge bg-white text-center text-[15px] outline-none focus:border-pink"
        />
        <input
          autoFocus
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('Nom du dossier')}
          aria-label={t('Nom du dossier')}
          className="h-8 min-w-0 flex-1 rounded-[8px] border border-cream-edge bg-white px-2 text-[13px] text-cream-ink outline-none focus:border-pink"
        />
      </div>
      <div className="flex justify-end gap-1.5">
        <SmallButton onClick={props.onCancel}>{t('Annuler')}</SmallButton>
        <SmallButton submit danger>
          {t('Enregistrer')}
        </SmallButton>
      </div>
    </form>
  )
}

function KitCard({ kit, folder, onOpen }: { kit: BrandKitSummary; folder: BrandFolder | null; onOpen: () => void }): JSX.Element {
  return (
    <li data-testid="brand-kit-card" data-host={kit.host}>
      <button
        type="button"
        onClick={onOpen}
        className="glass-card flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[16px] border-0 p-0 text-left transition-shadow hover:shadow-[0_8px_24px_rgb(59_35_112/0.16)]"
      >
        <div className="relative h-[120px] w-full bg-cream-2">
          {kit.preview && <img src={kit.preview} alt="" className="size-full object-cover object-top" />}
          {kit.logo && (
            <img src={kit.logo} alt="" className="absolute bottom-2 left-2 max-h-8 max-w-[110px] rounded-[6px] bg-white/90 object-contain p-1 shadow" />
          )}
        </div>
        <div className="flex h-3 w-full">
          {kit.colors.map((hex) => (
            <span key={hex} className="h-full flex-1" style={{ background: hex }} />
          ))}
        </div>
        <div className="flex flex-col gap-0.5 px-3.5 py-3">
          <span className="truncate text-[14px] font-semibold text-cream-ink">{kit.title}</span>
          <span className="truncate text-[12px] text-cream-sub">
            {kit.host} · {dateOf(kit.createdAt)}
          </span>
          {kit.fonts.length > 0 && <span className="truncate text-[12px] text-cream-sub">{kit.fonts.join(', ')}</span>}
          {kit.comment && <span className="mt-1 line-clamp-2 text-[12.5px] text-cream-ink">{kit.comment}</span>}
          {folder && (
            <span className="mt-1 w-fit rounded-full bg-cream-2 px-2 py-0.5 text-[11.5px] text-cream-sub">
              {folder.emoji ?? '📁'} {folder.name}
            </span>
          )}
        </div>
      </button>
    </li>
  )
}

// ─── A brand kit ───────────────────────────────────────────────────────────────────────────────

function KitDetail(props: {
  id: string
  folders: BrandFolder[]
  favorites: SavedColor[]
  copy: (text: string) => void
  setColors: (colors: SavedColor[]) => void
  go: (hash: string) => void
  refresh: () => void
  fail: (err: unknown) => void
}): JSX.Element {
  const { id, copy, fail } = props
  const [kit, setKit] = useState<BrandKit | null | undefined>(undefined)
  const [comment, setComment] = useState('')
  const [saved, setSaved] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commentRef = useRef(comment)
  commentRef.current = comment

  useEffect(() => {
    callInternal('colors/kit', { id })
      .then((k) => {
        setKit(k)
        setComment(k?.comment ?? '')
      })
      .catch(fail)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const update = (patch: { title?: string; comment?: string; folderId?: string | null }): Promise<void> =>
    callInternal('colors/updateKit', { id, ...patch })
      .then((k) => {
        // The comment field keeps its own text (typing goes on while it saves).
        if (k) setKit(k)
        props.refresh()
      })
      .catch(fail)

  // The comment saves itself while typing (and when leaving the page).
  const saveComment = (text: string): void => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    void update({ comment: text }).then(() => setSaved(true))
  }
  useEffect(() => {
    const flush = (): void => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        void callInternal('colors/updateKit', { id, comment: commentRef.current })
      }
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (kit === undefined) return <p className="m-0 text-[14px] text-cream-sub">{t('Chargement…')}</p>
  if (kit === null)
    return (
      <p className="m-0 text-[14px] text-cream-sub">
        {t('Cette charte n’existe plus.')}{' '}
        <a href="#kits" className="font-semibold text-violet">
          {t('Toutes les chartes')}
        </a>
      </p>
    )

  const { data } = kit
  const favoriteHexes = new Set(props.favorites.filter((c) => c.favorite).map((c) => c.hex))
  const addFavorite = (hex: string): void =>
    void callInternal('colors/addFavorite', { hex, sourceUrl: kit.url, sourceTitle: kit.title }).then(props.setColors).catch(fail)

  return (
    <article className="flex flex-col gap-6" data-testid="brand-kit" data-host={kit.host}>
      <div className="flex flex-wrap items-center gap-3">
        <a href={kit.folderId ? `#kits=${encodeURIComponent(kit.folderId)}` : '#kits'} className="text-[13px] font-semibold text-violet no-underline hover:underline">
          ← {t('Chartes graphiques')}
        </a>
      </div>

      <header className="glass-card flex flex-wrap items-center gap-5 rounded-[18px] p-5">
        <div className="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-white p-2">
          {data.logo || data.icon ? (
            <img src={data.logo ?? data.icon!} alt={t('Logo de {host}', { host: kit.host })} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[24px]" aria-hidden>
              🎨
            </span>
          )}
        </div>
        <div className="flex min-w-[240px] flex-1 flex-col gap-1">
          <input
            defaultValue={kit.title}
            aria-label={t('Nom de la charte')}
            onBlur={(e) => e.target.value.trim() !== kit.title && void update({ title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="m-0 w-full rounded-[8px] border border-transparent bg-transparent px-1 font-serif text-[26px] font-semibold text-cream-ink outline-none hover:border-cream-edge focus:border-pink focus:bg-white"
          />
          <span className="px-1 text-[13px] text-cream-sub">
            <a href={kit.url} target="_blank" rel="noreferrer" className="font-semibold text-violet">
              {kit.host}
            </a>{' '}
            · {t('Analysée le {date}', { date: dateOf(kit.createdAt) })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[13px] text-cream-sub">
            {t('Dossier')}
            <select
              value={kit.folderId ?? ''}
              onChange={(e) => void update({ folderId: e.target.value || null })}
              className="h-8 rounded-lg border border-cream-edge bg-white px-2 text-[13px] font-semibold text-cream-ink"
            >
              <option value="">{t('Sans dossier')}</option>
              {props.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.emoji ?? '📁'} {f.name}
                </option>
              ))}
            </select>
          </label>
          <SmallButton onClick={() => copy(kitToCss(kit))}>{t('Copier en CSS')}</SmallButton>
          <SmallButton onClick={() => copy(JSON.stringify({ url: kit.url, title: kit.title, ...data, logo: undefined, icon: undefined }, null, 2))}>
            {t('Copier en JSON')}
          </SmallButton>
          {confirming ? (
            <>
              <SmallButton
                danger
                onClick={() =>
                  void callInternal('colors/removeKit', { id })
                    .then(() => {
                      props.refresh()
                      props.go(kit.folderId ? `kits=${encodeURIComponent(kit.folderId)}` : 'kits')
                    })
                    .catch(fail)
                }
              >
                {t('Supprimer la charte')}
              </SmallButton>
              <SmallButton onClick={() => setConfirming(false)}>{t('Annuler')}</SmallButton>
            </>
          ) : (
            <SmallButton onClick={() => setConfirming(true)}>{t('Supprimer')}</SmallButton>
          )}
        </div>
      </header>

      <Block title={t('Commentaire')} aside={saved ? undefined : t('Enregistrement…')}>
        <textarea
          value={comment}
          data-testid="brand-kit-comment"
          onChange={(e) => {
            setComment(e.target.value)
            setSaved(false)
            if (saveTimer.current) clearTimeout(saveTimer.current)
            const text = e.target.value
            saveTimer.current = setTimeout(() => saveComment(text), 600)
          }}
          onBlur={() => saveTimer.current && saveComment(comment)}
          placeholder={t('Vos notes sur cette charte : ce qui vous plaît, pour quel projet…')}
          rows={3}
          className="w-full resize-y rounded-[12px] border border-cream-edge bg-white px-3 py-2 font-sans text-[14px] text-cream-ink outline-none focus:border-pink"
        />
      </Block>

      <Block title={t('Couleurs')} aside={t('Cliquez pour copier')}>
        {data.colors.length === 0 ? (
          <Empty />
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 p-0" aria-label={t('Couleurs de la charte')}>
            {data.colors.map((color) => (
              <li key={color.hex} data-testid="brand-color" data-hex={color.hex} data-role={color.role} className="group glass-card flex flex-col overflow-hidden rounded-[14px]">
                <button
                  type="button"
                  onClick={() => copy(color.hex)}
                  className="flex h-[92px] cursor-copy flex-col justify-end border-0 p-2.5 text-left"
                  style={{ background: color.hex, color: inkOn(color.hex) }}
                  title={t('Copier {value}', { value: color.hex })}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{roleName(color.role)}</span>
                </button>
                <div className="flex items-center gap-1 px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="m-0 font-mono text-[12.5px] font-semibold text-cream-ink">{color.hex}</p>
                    <p className="m-0 truncate text-[11px] text-cream-sub">
                      {formatColor(color.hex, 'rgb')}
                      {color.share >= 0.01 ? ` · ${Math.round(color.share * 100)} %` : ''}
                    </p>
                  </div>
                  <IconButton
                    label={favoriteHexes.has(color.hex) ? t('Dans vos favoris') : t('Ajouter aux favoris')}
                    pressed={favoriteHexes.has(color.hex)}
                    onClick={() => !favoriteHexes.has(color.hex) && addFavorite(color.hex)}
                  >
                    {favoriteHexes.has(color.hex) ? '★' : '☆'}
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Contrasts kit={kit} />
      </Block>

      {data.variables.length > 0 && (
        <Block title={t('Variables CSS')} aside={plural(data.variables.length, '{n} variable', '{n} variables')}>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-4 gap-y-1 p-0">
            {data.variables.map((v) => (
              <li key={v.name}>
                <button
                  type="button"
                  onClick={() => copy(`var(${v.name})`)}
                  title={t('Copier {value}', { value: `var(${v.name})` })}
                  className="flex w-full cursor-copy items-center gap-2 rounded-[8px] border-0 bg-transparent px-1.5 py-1 text-left hover:bg-cream-2"
                >
                  <span className="size-5 shrink-0 rounded-[6px] border border-black/10" style={{ background: v.hex }} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-cream-ink" title={v.name}>
                    {v.name}
                  </span>
                  <span className="font-mono text-[11px] text-cream-sub">{v.hex}</span>
                </button>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title={t('Typographies')}>
        {data.fonts.length === 0 ? (
          <Empty />
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 p-0">
            {data.fonts.map((font) => (
              <li key={font.family} data-testid="brand-font" className="glass-card flex flex-col gap-2 rounded-[14px] p-4">
                <span className="truncate text-[34px] leading-tight text-cream-ink" style={{ fontFamily: `${font.stack}, system-ui, sans-serif` }}>
                  Aa Bb 123
                </span>
                <button
                  type="button"
                  onClick={() => copy(font.stack)}
                  title={t('Copier {value}', { value: font.stack })}
                  className="w-fit cursor-copy border-0 bg-transparent p-0 text-left text-[15px] font-bold text-cream-ink hover:text-violet"
                >
                  {font.family}
                </button>
                <span className="text-[12px] text-cream-sub">
                  {font.roles.map(fontRoleName).join(', ')} · {sourceName(font.source)}
                  {font.share >= 0.01 ? ` · ${Math.round(font.share * 100)} %` : ''}
                </span>
                <span className="text-[12px] text-cream-sub">{t('Graisses : {weights}', { weights: font.weights.join(', ') })}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {data.styles.length > 0 && (
        <Block title={t('Styles de texte')}>
          <ul className="m-0 flex list-none flex-col p-0">
            {data.styles.map((style) => (
              <li key={style.tag} className="flex items-center gap-4 border-t border-cream-edge/70 py-2.5 first:border-t-0">
                <span className="w-16 shrink-0 font-mono text-[12px] uppercase text-cream-sub">{style.tag === 'p' ? t('texte') : style.tag}</span>
                <span
                  className="min-w-0 flex-1 truncate text-cream-ink"
                  style={{
                    // Not installed here: a sans-serif rather than the browser's Times.
                    fontFamily: `"${style.family}", system-ui, sans-serif`,
                    fontSize: Math.min(style.size, 56),
                    fontWeight: style.weight,
                    letterSpacing: style.letterSpacing || undefined,
                    textTransform: (style.transform || undefined) as React.CSSProperties['textTransform']
                  }}
                >
                  {kit.title}
                </span>
                <span className="w-[210px] shrink-0 text-right font-mono text-[11.5px] text-cream-sub">
                  {style.family} · {style.size}px · {style.weight}
                  {style.lineHeight ? ` / ${style.lineHeight}px` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {data.buttons.length > 0 && (
        <Block title={t('Boutons')}>
          <div className="flex flex-wrap items-center gap-4 rounded-[14px] p-5" style={{ background: data.colors.find((c) => c.role === 'background')?.hex ?? '#FFFFFF' }}>
            {data.buttons.map((b, i) => (
              <span
                key={i}
                title={`${b.background} · ${b.color} · ${b.radius}`}
                style={{
                  background: b.background,
                  color: b.color,
                  border: b.border === 'none' ? undefined : b.border,
                  borderRadius: b.radius,
                  padding: b.padding,
                  fontFamily: b.family,
                  fontSize: b.size,
                  fontWeight: b.weight,
                  textTransform: (b.transform === 'none' ? undefined : b.transform) as React.CSSProperties['textTransform']
                }}
                className="inline-block max-w-[260px] truncate"
              >
                {b.text}
              </span>
            ))}
          </div>
        </Block>
      )}

      {(data.radii.length > 0 || data.shadows.length > 0) && (
        <Block title={t('Arrondis et ombres')}>
          <div className="flex flex-wrap gap-4">
            {data.radii.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => copy(r)}
                className="flex cursor-copy flex-col items-center gap-1.5 border-0 bg-transparent"
                title={t('Copier {value}', { value: r })}
              >
                <span className="size-14 border-2 border-violet/60 bg-white" style={{ borderRadius: r }} />
                <span className="max-w-[90px] truncate font-mono text-[11px] text-cream-sub">{r}</span>
              </button>
            ))}
            {data.shadows.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => copy(s)}
                className="flex cursor-copy flex-col items-center gap-1.5 border-0 bg-transparent"
                title={t('Copier {value}', { value: s })}
              >
                <span className="size-14 rounded-[10px] bg-white" style={{ boxShadow: s }} />
                <span className="max-w-[120px] truncate font-mono text-[11px] text-cream-sub">{t('Ombre')}</span>
              </button>
            ))}
          </div>
        </Block>
      )}

      {kit.preview && (
        <Block title={t('Page analysée')}>
          <a href={kit.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[14px] border border-cream-edge">
            <img src={kit.preview} alt={t('Aperçu de {host}', { host: kit.host })} className="block w-full" />
          </a>
        </Block>
      )}
    </article>
  )
}

/** Text on background: whether the main pairs read well (WCAG). */
function Contrasts({ kit }: { kit: BrandKit }): JSX.Element | null {
  const bg = kit.data.colors.find((c) => c.role === 'background')?.hex
  if (!bg) return null
  const others = kit.data.colors.filter((c) => c.hex !== bg && (c.role === 'text' || c.role === 'primary' || c.role === 'accent')).slice(0, 4)
  if (others.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2" aria-label={t('Contrastes sur le fond')}>
      {others.map((c) => {
        const ratio = contrast(c.hex, bg)
        const grade = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? t('AA grand texte') : t('Insuffisant')
        return (
          <span key={c.hex} className="flex items-center gap-2 rounded-[10px] border border-cream-edge px-2.5 py-1.5 text-[12px]" style={{ background: bg, color: c.hex }}>
            <strong>Aa</strong>
            <span className="font-mono">{ratio.toFixed(1)}:1</span>
            <span className="rounded-full bg-white/85 px-1.5 text-[10.5px] font-semibold text-cream-ink">{grade}</span>
          </span>
        )
      })}
    </div>
  )
}

function Block(props: { title: string; aside?: string; children: ReactNode }): JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[17px] font-bold text-cream-ink">{props.title}</h2>
        {props.aside && <span className="text-[12px] text-cream-sub">{props.aside}</span>}
      </div>
      {props.children}
    </section>
  )
}

function Empty(): JSX.Element {
  return <p className="m-0 text-[13px] text-cream-sub">{t('Rien trouvé sur cette page.')}</p>
}

document.title = t('Couleurs')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorsPage />
  </StrictMode>
)
