import { Fragment, useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { FavoriteInfo, FolderInfo, OpenDisposition, SidebarSide } from '@shared/types'
import { SETTINGS_PAGE_URL } from '@shared/ipc'
import { selectActiveTab, useBrowserStore } from '../store/useBrowserStore'
import { dndId, NEW_ROW, parseDndId, ROOT_ZONE } from '../lib/dnd'
import { rectOf } from '../lib/favorites'
import { ChevronIcon, GearIcon, GlobeIcon, PlusIcon, SidebarIcon } from './Icons'
import { SidebarTabs } from './SidebarTabs'
import { MediaCard } from './MediaCard'
import { t } from '@shared/i18n'

const api = window.zak
export const SIDEBAR_COLLAPSED_WIDTH = 64
export const SIDEBAR_DEFAULT_WIDTH = 300
/** Same bounds as main's settings store. */
const MIN_WIDTH = 140
const MAX_WIDTH = 380
/** Narrower than this, the folders show their icon only (their name in a tooltip). */
const NARROW_WIDTH = 190
/** Dragging the edge narrower than this folds the sidebar (icons only). */
const FOLD_WIDTH = 96
const COLUMNS = 5
const TILE_MIN = 28
const TILE_GAP = 10

/** Tiles per row: 5, fewer when the sidebar is narrow (a tile stays at least 28 px). */
export function mosaicColumns(width: number): number {
  const inner = width - 32
  return Math.max(1, Math.min(COLUMNS, Math.floor((inner + TILE_GAP) / (TILE_MIN + TILE_GAP))))
}

/**
 * Folding / unfolding, calmly: the content fades out, the width glides (the page follows its edge
 * frame by frame, App reports the layout), the content comes back in its new layout. No jump of
 * the mosaic mid-way.
 */
const FADE_OUT_MS = 110
const GLIDE_MS = 300
const FADE_IN_MS = 200

/** The layout shown (wide or folded) and how far the fold animation is, following `collapsed`. */
function useFoldAnimation(collapsed: boolean | null): { shown: boolean; phase: 'idle' | 'out' | 'in'; gliding: boolean } {
  const [shown, setShown] = useState(collapsed ?? false)
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')
  const loaded = useRef(collapsed !== null)
  useEffect(() => {
    if (collapsed === null) return
    // The saved layout arriving at launch: no animation.
    if (!loaded.current) {
      loaded.current = true
      setShown(collapsed)
      return
    }
    if (collapsed === shown && phase === 'idle') return
    setPhase('out')
    const timers = [
      setTimeout(() => setShown(collapsed), FADE_OUT_MS),
      // The content comes back while the width lands.
      setTimeout(() => setPhase('in'), GLIDE_MS - 80),
      setTimeout(() => setPhase('idle'), GLIDE_MS)
    ]
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed])
  // Known in the very render where the width changes, so the browser animates it.
  const gliding = loaded.current && collapsed !== null && (collapsed !== shown || phase !== 'idle')
  return { shown, phase, gliding }
}

/**
 * Sidebar on the plum frame, under the toolbar, on the right of the page (or on its left, setting;
 * CLAUDE.md §6.2, §7): the root favorites as a 5-per-row emoji mosaic, then the folders as a list
 * (their favorites as rows), the tabs when they are in the sidebar, and the settings button.
 */
export function Sidebar(): JSX.Element {
  const sidebar = useBrowserStore((s) => s.sidebar)
  const activeTab = useBrowserStore(selectActiveTab)
  const asideRef = useRef<HTMLElement>(null)
  const { shown: collapsed, phase, gliding } = useFoldAnimation(sidebar?.layout.collapsed ?? null)
  if (!sidebar) return <aside className="no-drag w-[300px] shrink-0" />

  const { folders, favorites, layout } = sidebar
  const fading = phase === 'out'
  const content = {
    opacity: fading ? 0 : 1,
    transition: `opacity ${fading ? FADE_OUT_MS : FADE_IN_MS}ms var(--ease-calm)`
  }
  // The favorite whose own tab is shown (CLAUDE.md §6.2).
  const activeId = activeTab?.favoriteId ?? undefined
  const inFolder = (folderId: string | null): FavoriteInfo[] => favorites.filter((f) => f.folderId === folderId)
  // Narrow: the folders as icons, fewer tiles per row (CLAUDE.md §6.2).
  const iconsOnly = collapsed || layout.width < NARROW_WIDTH
  const columns = collapsed ? 1 : mosaicColumns(layout.width)

  const newFolder = (e: MouseEvent<HTMLButtonElement>): void =>
    void api.invoke('overlay:open', {
      kind: 'folder-editor',
      anchor: rectOf(e.currentTarget),
      folderId: null,
      draft: { name: '', emoji: '📁' }
    })

  return (
    <aside
      ref={asideRef}
      aria-label={layout.tabs === 'sidebar' ? t('Barre latérale') : t('Favoris')}
      data-testid="sidebar"
      data-collapsed={layout.collapsed || undefined}
      style={{
        width: layout.collapsed ? SIDEBAR_COLLAPSED_WIDTH : layout.width,
        // Only while folding: dragging the edge follows the pointer.
        transition: gliding ? `width ${GLIDE_MS}ms var(--ease-calm)` : undefined
      }}
      className="no-drag relative flex shrink-0 flex-col bg-frame text-frame-text"
    >
      <div style={content} className={`no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto pt-4 ${collapsed ? 'px-2.5' : 'px-4'}`}>
        <RootMosaic favorites={inFolder(null)} activeId={activeId} collapsed={collapsed} columns={columns} />

        <div className="my-4 h-px shrink-0 bg-frame-line" />

        <SortableContext items={folders.map((f) => dndId('folder', f.id))} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-0.5">
            {folders.map((folder) => (
              <FolderSection
                key={folder.id}
                folder={folder}
                favorites={inFolder(folder.id)}
                activeId={activeId}
                collapsed={iconsOnly}
                columns={columns}
              />
            ))}
          </div>
        </SortableContext>

        <button
          data-testid="new-folder"
          title={t('Nouveau dossier')}
          onClick={newFolder}
          className={`mt-1 mb-3 flex h-9 shrink-0 items-center gap-2.5 rounded-lg text-[13.5px] text-frame-text/75 hover:bg-frame-2 hover:text-frame-text ${
            iconsOnly ? 'justify-center' : 'px-2'
          }`}
        >
          <PlusIcon />
          {!iconsOnly && t('Nouveau dossier')}
        </button>

        {layout.tabs === 'sidebar' && (
          <>
            <div className="mb-3 h-px shrink-0 bg-frame-line" />
            <SidebarTabs collapsed={collapsed} />
          </>
        )}
      </div>

      <div style={content} className="shrink-0">
        <MediaCard collapsed={collapsed} />
      </div>

      <footer style={content} className={`flex shrink-0 items-center gap-2 pt-2 pb-3 ${collapsed ? 'flex-col justify-center' : 'justify-end px-3'}`}>
        {/* Folded: icons only, the favorites one below the other (also ⌘B). */}
        <button
          data-testid="toggle-sidebar"
          aria-expanded={!layout.collapsed}
          title={layout.collapsed ? t('Déplier la barre latérale (⌘B)') : t('Réduire la barre latérale (⌘B)')}
          onClick={() => useBrowserStore.getState().toggleSidebar()}
          className="grid h-10 w-10 place-items-center rounded-full border border-frame-line text-frame-text hover:bg-frame-2"
        >
          {/* The icon draws a sidebar on the right: mirrored when it is on the left. */}
          <span className={layout.side === 'left' ? '-scale-x-100' : undefined}>
            <SidebarIcon collapse={!collapsed} />
          </span>
        </button>
        <button
          data-testid="open-settings"
          title={t('Réglages (⌘,)')}
          onClick={() => void api.invoke('tabs:create', SETTINGS_PAGE_URL)}
          className="grid h-10 w-10 place-items-center rounded-full border border-frame-line text-frame-text hover:bg-frame-2"
        >
          <GearIcon />
        </button>
      </footer>

      {!collapsed && phase === 'idle' && <ResizeHandle aside={asideRef} side={layout.side} />}
    </aside>
  )
}

function FolderSection(props: {
  folder: FolderInfo
  favorites: FavoriteInfo[]
  activeId: string | undefined
  /** Icons only: the sidebar is folded or narrow. */
  collapsed: boolean
  columns: number
}): JSX.Element {
  const { folder, collapsed } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, active } = useSortable({
    id: dndId('folder', folder.id)
  })
  // A favorite or a tab dropped anywhere on the folder goes into it.
  const receiving = isOver && active !== null && !String(active.id).startsWith('folder:')
  const toggle = (): void => void api.invoke('folders:setCollapsed', folder.id, !folder.collapsed)
  const menu = (e: MouseEvent): void => {
    e.preventDefault()
    void api.invoke('folders:showContextMenu', folder.id)
  }

  return (
    <section
      ref={setNodeRef}
      data-testid="folder"
      data-folder-id={folder.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex flex-col rounded-[12px] transition-colors ${isDragging ? 'z-10 opacity-60' : ''} ${
        receiving ? 'bg-frame-2 outline-2 outline-iris-ring/50 outline-dashed' : ''
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={toggle}
        onContextMenu={menu}
        title={collapsed ? folder.name : undefined}
        className={`flex h-9 items-center gap-2.5 rounded-lg text-[13.5px] text-frame-text/75 outline-none hover:bg-frame-2 hover:text-frame-text ${
          collapsed ? 'justify-center' : 'px-1.5'
        }`}
      >
        {!collapsed && (
          <span className="text-frame-sub">
            <ChevronIcon open={!folder.collapsed} />
          </span>
        )}
        {/* Icons only: a folder without an emoji still shows something. */}
        {/* A box of its own: the emoji's glyph sits on the label's middle, not on its baseline. */}
        {(folder.emoji || collapsed) && (
          <span className="emoji grid size-5 shrink-0 place-items-center text-[16px] leading-none">{folder.emoji || '📁'}</span>
        )}
        {!collapsed && <span className="min-w-0 flex-1 truncate text-left leading-5">{folder.name}</span>}
        {!collapsed && <span className="text-[12.5px] leading-5 text-frame-dim tabular-nums">{props.favorites.length}</span>}
      </button>
      {!folder.collapsed &&
        (collapsed ? (
          <Mosaic
            zone={folder.id}
            favorites={props.favorites}
            activeId={props.activeId}
            collapsed
            columns={props.columns}
            folderId={folder.id}
            showAdd={false}
          />
        ) : (
          <FolderList folderId={folder.id} favorites={props.favorites} activeId={props.activeId} />
        ))}
    </section>
  )
}

/** Opens the favorite editor for the current page, filed in `folderId`. */
function useAddCurrentPage(folderId: string | null, row?: number): (e: MouseEvent<HTMLButtonElement>) => void {
  const tab = useBrowserStore(selectActiveTab)
  return (e) =>
    void api.invoke('overlay:open', {
      kind: 'favorite-editor',
      anchor: rectOf(e.currentTarget),
      favoriteId: null,
      draft: {
        title: tab?.url ? tab.title : '',
        url: tab?.url ?? '',
        emoji: null,
        folderId,
        favicon: tab?.favicon ?? null,
        row
      }
    })
}

/** An open folder's favorites, one row each (icon + title). Also a drop zone. */
function FolderList(props: { folderId: string; favorites: FavoriteInfo[]; activeId: string | undefined }): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: dndId('zone', props.folderId) })
  const add = useAddCurrentPage(props.folderId)

  if (props.favorites.length === 0) {
    return (
      <div
        ref={setNodeRef}
        data-testid="mosaic"
        // Full width (no indent), centered: at the narrowest sidebar the button stays on one line.
        className={`mt-1 mb-1.5 rounded-[10px] border border-dashed ${isOver ? 'border-iris-ring bg-frame-2' : 'border-frame-line'}`}
      >
        <button
          data-testid="add-favorite"
          onClick={add}
          className="flex w-full flex-col items-center gap-0.5 rounded-[9px] px-3 py-2.5 text-center hover:bg-frame-3"
        >
          <span className="flex max-w-full items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap text-iris">
            <PlusIcon />
            <span className="truncate">{t('Ajouter cette page')}</span>
          </span>
          <span className="text-[12px] leading-snug text-balance text-frame-sub">{t('Glisse un favori ou un onglet ici')}</span>
        </button>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      data-testid="mosaic"
      className={`mb-1 flex flex-col rounded-[10px] pl-7 transition-colors ${isOver ? 'bg-frame-2' : ''}`}
    >
      <SortableContext items={props.favorites.map((f) => dndId('fav', f.id))} strategy={verticalListSortingStrategy}>
        {props.favorites.map((favorite) => (
          <FavoriteRow key={favorite.id} favorite={favorite} active={favorite.id === props.activeId} />
        ))}
      </SortableContext>
    </div>
  )
}

/**
 * The root favorites, in rows you choose (CLAUDE.md §6.2): each row is a grid of 5 square tiles
 * (1 when the sidebar is collapsed), the rows one under the other. While a favorite or a tab is
 * dragged, « Nouvelle ligne » under the last row starts another one (over the gap before the
 * folders: nothing moves when it shows up); a row emptied goes away.
 */
function RootMosaic(props: { favorites: FavoriteInfo[]; activeId: string | undefined; collapsed: boolean; columns: number }): JSX.Element {
  const { setNodeRef } = useDroppable({ id: dndId('zone', ROOT_ZONE) })
  const { active } = useDndContext()
  const dragged = active ? parseDndId(active.id).kind : null
  // The row under the pointer shows a « + » in its next free place (adds the current page there).
  const [hovered, setHovered] = useState<number | null>(null)
  const rows: FavoriteInfo[][] = []
  for (const favorite of props.favorites) (rows[favorite.row] ??= []).push(favorite)
  const lines = rows.filter((row) => row !== undefined)
  // While a favorite or a tab is dragged, the free places of each row show as dotted squares.
  const dragging = dragged === 'fav' || dragged === 'tab'
  const free = (count: number): number => (props.columns - (count % props.columns)) % props.columns
  // The « + » only takes a free place: showing it never adds a line (an empty mosaic always shows it).
  const addButton = (row: number, count: number): React.ReactNode =>
    !props.collapsed && !dragging && (free(count) > 0 || count === 0) && <AddTile row={row} shown={hovered === row || lines.length === 0} />

  return (
    <div ref={setNodeRef} data-testid="mosaic" className="relative flex flex-col gap-2.5" onMouseLeave={() => setHovered(null)}>
      {/* One sortable list per row: tiles make room within their own row only, so the preview shows where it lands. */}
      {lines.map((row, r) => (
        <Fragment key={r}>
          {/* A straight hairline between rows (not the rounded edge of a row). */}
          {r > 0 && <div aria-hidden className="h-px shrink-0 bg-frame-line/70" />}
          <MosaicRow row={r} columns={props.columns} slots={dragging ? free(row.length) : 0} onHover={setHovered}>
            <SortableContext items={row.map((f) => dndId('fav', f.id))} strategy={rectSortingStrategy}>
              {row.map((favorite, i) => (
                <FavoriteTile
                  key={favorite.id}
                  favorite={favorite}
                  active={favorite.id === props.activeId}
                  column={props.collapsed ? -1 : i % props.columns}
                  columns={props.columns}
                />
              ))}
            </SortableContext>
            {addButton(r, row.length)}
          </MosaicRow>
        </Fragment>
      ))}
      {lines.length === 0 && (
        <MosaicRow row={0} columns={props.columns} slots={dragging ? props.columns : 0} onHover={setHovered}>
          {addButton(0, 0)}
        </MosaicRow>
      )}
      {dragging && lines.length > 0 && <NewRowZone collapsed={props.collapsed} />}
    </div>
  )
}

/** A row of the root mosaic; `slots`: free places shown as dotted squares while dragging. */
function MosaicRow(props: {
  row: number
  columns: number
  slots: number
  onHover: (row: number) => void
  children: React.ReactNode
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: dndId('row', props.row) })
  return (
    <div
      ref={setNodeRef}
      onMouseEnter={() => props.onHover(props.row)}
      data-testid="mosaic-row"
      style={{ gridTemplateColumns: `repeat(${props.columns}, minmax(0, 1fr))` }}
      className="grid min-h-4 gap-2.5"
    >
      {props.children}
      {Array.from({ length: props.slots }, (_, i) => (
        <div
          key={`slot-${i}`}
          aria-hidden
          data-testid="mosaic-slot"
          className={`aspect-square rounded-[10px] border border-dashed transition-colors ${
            isOver ? 'border-iris-ring bg-frame-2/60' : 'border-frame-line'
          }`}
        />
      ))}
    </div>
  )
}

/** « + » in a row's next free place, shown while the pointer is over that row: adds the current page to it. */
function AddTile({ row, shown }: { row: number; shown: boolean }): JSX.Element {
  const add = useAddCurrentPage(null, row)
  return (
    <button
      data-testid="add-favorite"
      title={t('Ajouter un favori')}
      onClick={add}
      tabIndex={shown ? 0 : -1}
      aria-hidden={!shown || undefined}
      className={`grid aspect-square place-items-center rounded-[10px] border border-dashed border-frame-line text-frame-sub transition-opacity duration-200 hover:border-frame-sub hover:text-frame-text focus-visible:opacity-100 ${
        shown ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <PlusIcon />
    </button>
  )
}

/** Under the last row while dragging: drop here to start a new line. */
function NewRowZone({ collapsed }: { collapsed: boolean }): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: dndId('row', NEW_ROW) })
  return (
    <div
      ref={setNodeRef}
      data-testid="new-row"
      className={`absolute inset-x-0 top-[calc(100%+2px)] z-10 grid h-[30px] place-items-center rounded-[10px] border border-dashed bg-frame text-[12.5px] transition-colors ${
        isOver ? 'border-iris-ring bg-frame-2 text-frame-text' : 'border-frame-line text-frame-sub'
      }`}
    >
      {collapsed ? <PlusIcon /> : t('Nouvelle ligne')}
    </div>
  )
}

/** A grid of square tiles: 5 per row, 1 when the sidebar is collapsed. Also a drop zone. */
function Mosaic(props: {
  zone: string
  favorites: FavoriteInfo[]
  activeId: string | undefined
  collapsed: boolean
  columns: number
  folderId: string | null
  showAdd: boolean
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: dndId('zone', props.zone) })
  const add = useAddCurrentPage(props.folderId)

  return (
    <div
      ref={setNodeRef}
      data-testid="mosaic"
      style={{ gridTemplateColumns: `repeat(${props.columns}, minmax(0, 1fr))` }}
      className={`grid min-h-4 gap-2.5 rounded-[12px] transition-colors ${
        isOver ? 'bg-frame-2 outline-2 outline-iris-ring/40 outline-dashed' : ''
      }`}
    >
      <SortableContext items={props.favorites.map((f) => dndId('fav', f.id))} strategy={rectSortingStrategy}>
        {props.favorites.map((favorite, i) => (
          <FavoriteTile
            key={favorite.id}
            favorite={favorite}
            active={favorite.id === props.activeId}
            column={props.columns === 1 ? -1 : i % props.columns}
            columns={props.columns}
          />
        ))}
      </SortableContext>
      {props.showAdd && !props.collapsed && (
        <button
          data-testid="add-favorite"
          title={t('Ajouter un favori')}
          onClick={add}
          className="grid aspect-square place-items-center rounded-[10px] border border-dashed border-frame-line text-frame-sub hover:border-frame-sub hover:text-frame-text"
        >
          <PlusIcon />
        </button>
      )}
    </div>
  )
}

/** Click, Cmd/Ctrl+click and middle click, context menu: shared by tiles and rows (CLAUDE.md §6.2). */
function favoriteHandlers(favorite: FavoriteInfo): {
  onClick: (e: MouseEvent) => void
  onMouseDown: (e: MouseEvent) => void
  onAuxClick: (e: MouseEvent) => void
  onContextMenu: (e: MouseEvent) => void
} {
  const open = (disposition: OpenDisposition): void => void api.invoke('favorites:open', favorite.id, disposition)
  return {
    onClick: (e) => open(e.metaKey || e.ctrlKey ? (e.shiftKey ? 'foreground-tab' : 'background-tab') : 'current'),
    onMouseDown: (e) => e.button === 1 && e.preventDefault(),
    onAuxClick: (e) => e.button === 1 && open('background-tab'),
    onContextMenu: (e) => {
      e.preventDefault()
      void api.invoke('favorites:showContextMenu', favorite.id)
    }
  }
}

/** The favorite's own tab is open (a dot under its tile, CLAUDE.md §6.2). */
const useFavoriteOpen = (id: string): boolean => useBrowserStore((s) => s.tabs.some((tab) => tab.favoriteId === id))

function FavoriteTile(props: { favorite: FavoriteInfo; active: boolean; column: number; columns: number }): JSX.Element {
  const { favorite, active, column, columns } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dndId('fav', favorite.id)
  })
  const open = useFavoriteOpen(favorite.id)
  // Keep the tooltip inside the sidebar: first column aligned left, last aligned right.
  const tooltipPlace =
    column === 0 && columns > 1 ? 'left-0' : column === columns - 1 || column === -1 ? 'right-0' : 'left-1/2 -translate-x-1/2'

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      {...favoriteHandlers(favorite)}
      data-testid="favorite"
      data-favorite-id={favorite.id}
      data-open={open || undefined}
      aria-label={favorite.title}
      aria-current={active ? 'page' : undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group relative grid aspect-square place-items-center rounded-[10px] outline-none ${
        active ? 'bg-frame-3 ring-[1.5px] ring-iris-ring' : 'bg-frame-2 hover:bg-frame-3'
      } ${isDragging ? 'opacity-30' : ''}`}
    >
      <TileIcon favorite={favorite} />
      {open && !active && <span aria-hidden className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-frame-sub" />}
      {!isDragging && (
        <span
          className={`pointer-events-none absolute top-[calc(100%+6px)] z-20 rounded-lg bg-black/85 px-2 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 transition-opacity delay-300 duration-100 group-hover:opacity-100 ${tooltipPlace}`}
        >
          {favorite.title}
        </span>
      )}
    </button>
  )
}

function FavoriteRow({ favorite, active }: { favorite: FavoriteInfo; active: boolean }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dndId('fav', favorite.id)
  })
  const open = useFavoriteOpen(favorite.id)

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      {...favoriteHandlers(favorite)}
      data-testid="favorite"
      data-favorite-id={favorite.id}
      aria-label={favorite.title}
      title={favorite.url}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex h-8 items-center gap-2.5 rounded-lg px-1.5 text-left text-[13.5px] outline-none ${
        active ? 'bg-frame-2 font-semibold text-white' : 'text-frame-text hover:bg-frame-2'
      } ${isDragging ? 'opacity-30' : ''}`}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center">
        <TileIcon favorite={favorite} small />
      </span>
      <span className="min-w-0 flex-1 truncate">{favorite.title}</span>
      {open && !active && <span aria-hidden className="mr-1 h-1 w-1 shrink-0 rounded-full bg-frame-sub" />}
    </button>
  )
}

export function TileIcon(props: {
  favorite: Pick<FavoriteInfo, 'emoji' | 'favicon'> & { image?: string | null }
  small?: boolean
}): JSX.Element {
  const { favorite, small } = props
  if (favorite.image) {
    return <img src={favorite.image} alt="" draggable={false} className={small ? 'h-4 w-4 rounded object-cover' : 'h-7 w-7 rounded-lg object-cover'} />
  }
  if (favorite.emoji) {
    return <span className={`emoji leading-none ${small ? 'text-[15px]' : 'text-[22px]'}`}>{favorite.emoji}</span>
  }
  if (favorite.favicon) {
    return <img src={favorite.favicon} alt="" draggable={false} className={small ? 'h-4 w-4 rounded' : 'h-6 w-6 rounded-md'} />
  }
  return (
    <span className="text-frame-sub">
      <GlobeIcon />
    </span>
  )
}

/** Drag the sidebar's edge next to the page: 140–380 px, saved on release; much narrower folds it (icons only). */
function ResizeHandle({ aside, side }: { aside: React.RefObject<HTMLElement | null>; side: SidebarSide }): JSX.Element {
  const setLayout = useBrowserStore((s) => s.setSidebarLayout)

  const start = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const el = aside.current
    if (!el) return
    e.preventDefault()
    const { left, right } = el.getBoundingClientRect()
    const raw = (x: number): number => (side === 'left' ? x - left : right - x)
    const layoutAt = (x: number): { width?: number; collapsed: boolean } =>
      raw(x) < FOLD_WIDTH ? { collapsed: true } : { width: Math.round(Math.min(Math.max(raw(x), MIN_WIDTH), MAX_WIDTH)), collapsed: false }
    const move = (ev: PointerEvent): void => setLayout(layoutAt(ev.clientX), false)
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setLayout(layoutAt(ev.clientX), true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      onPointerDown={start}
      title={t('Redimensionner')}
      // Inside the sidebar's edge: the frame between it and the page has the cream panel's corner.
      className={`absolute top-4 bottom-4 w-1.5 cursor-col-resize rounded-full hover:bg-iris/25 ${side === 'left' ? 'right-0' : 'left-0'}`}
    />
  )
}
