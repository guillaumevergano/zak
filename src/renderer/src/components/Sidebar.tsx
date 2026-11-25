import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { FavoriteInfo, FolderInfo, OpenDisposition, SidebarSide } from '@shared/types'
import { SETTINGS_PAGE_URL } from '@shared/ipc'
import { selectActiveTab, useBrowserStore } from '../store/useBrowserStore'
import { dndId, ROOT_ZONE } from '../lib/dnd'
import { matchFavorite, rectOf } from '../lib/favorites'
import { ChevronIcon, GearIcon, GlobeIcon, PlusIcon, SidebarIcon } from './Icons'
import { SidebarTabs } from './SidebarTabs'
import { t } from '@shared/i18n'

const api = window.zak
export const SIDEBAR_COLLAPSED_WIDTH = 64
export const SIDEBAR_DEFAULT_WIDTH = 300
/** Same bounds as main's settings store. */
const MIN_WIDTH = 220
const MAX_WIDTH = 380
const COLUMNS = 5

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
  const activeId = activeTab?.url ? matchFavorite(activeTab.url, favorites)?.id : undefined
  const inFolder = (folderId: string | null): FavoriteInfo[] => favorites.filter((f) => f.folderId === folderId)

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
        <Mosaic zone={ROOT_ZONE} favorites={inFolder(null)} activeId={activeId} collapsed={collapsed} folderId={null} showAdd />

        <div className="my-4 h-px shrink-0 bg-frame-line" />

        <SortableContext items={folders.map((f) => dndId('folder', f.id))} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-0.5">
            {folders.map((folder) => (
              <FolderSection
                key={folder.id}
                folder={folder}
                favorites={inFolder(folder.id)}
                activeId={activeId}
                collapsed={collapsed}
              />
            ))}
          </div>
        </SortableContext>

        <button
          data-testid="new-folder"
          title={t('Nouveau dossier')}
          onClick={newFolder}
          className={`mt-1 mb-3 flex h-9 shrink-0 items-center gap-2.5 rounded-lg text-[14px] text-frame-text hover:bg-frame-2 ${
            collapsed ? 'justify-center' : 'px-2'
          }`}
        >
          <PlusIcon />
          {!collapsed && t('Nouveau dossier')}
        </button>

        {layout.tabs === 'sidebar' && (
          <>
            <div className="mb-3 h-px shrink-0 bg-frame-line" />
            <SidebarTabs collapsed={collapsed} />
          </>
        )}
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
  collapsed: boolean
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
        className={`flex h-9 items-center gap-2.5 rounded-lg text-[14.5px] text-frame-text outline-none hover:bg-frame-2 ${
          collapsed ? 'justify-center' : 'px-1.5'
        }`}
      >
        {!collapsed && (
          <span className="text-frame-sub">
            <ChevronIcon open={!folder.collapsed} />
          </span>
        )}
        {folder.emoji && <span className="emoji text-[17px] leading-none">{folder.emoji}</span>}
        {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>}
        {!collapsed && <span className="text-[13px] text-frame-dim tabular-nums">{props.favorites.length}</span>}
      </button>
      {!folder.collapsed &&
        (collapsed ? (
          <Mosaic
            zone={folder.id}
            favorites={props.favorites}
            activeId={props.activeId}
            collapsed
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
function useAddCurrentPage(folderId: string | null): (e: MouseEvent<HTMLButtonElement>) => void {
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
        favicon: tab?.favicon ?? null
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
        className={`mt-1 mb-1.5 ml-7 flex flex-col items-start gap-1 rounded-[10px] border border-dashed px-3 py-2 text-[12.5px] text-frame-sub ${
          isOver ? 'border-iris-ring bg-frame-2' : 'border-frame-line'
        }`}
      >
        <span>{t('Glisse un favori ou un onglet ici')}</span>
        <button
          data-testid="add-favorite"
          onClick={add}
          className="-ml-1.5 flex h-7 items-center gap-1.5 rounded-md px-1.5 font-semibold text-iris hover:bg-frame-3"
        >
          <PlusIcon />
          {t('Ajouter la page actuelle')}
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

/** A grid of square tiles: 5 per row, 1 when the sidebar is collapsed. Also a drop zone. */
function Mosaic(props: {
  zone: string
  favorites: FavoriteInfo[]
  activeId: string | undefined
  collapsed: boolean
  folderId: string | null
  showAdd: boolean
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: dndId('zone', props.zone) })
  const add = useAddCurrentPage(props.folderId)

  return (
    <div
      ref={setNodeRef}
      data-testid="mosaic"
      className={`grid min-h-4 gap-2.5 rounded-[12px] transition-colors ${props.collapsed ? 'grid-cols-1' : 'grid-cols-5'} ${
        isOver ? 'bg-frame-2 outline-2 outline-iris-ring/40 outline-dashed' : ''
      }`}
    >
      <SortableContext items={props.favorites.map((f) => dndId('fav', f.id))} strategy={rectSortingStrategy}>
        {props.favorites.map((favorite, i) => (
          <FavoriteTile
            key={favorite.id}
            favorite={favorite}
            active={favorite.id === props.activeId}
            column={props.collapsed ? -1 : i % COLUMNS}
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

function FavoriteTile(props: { favorite: FavoriteInfo; active: boolean; column: number }): JSX.Element {
  const { favorite, active, column } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dndId('fav', favorite.id)
  })
  // Keep the tooltip inside the sidebar: first column aligned left, last aligned right.
  const tooltipPlace =
    column === 0 ? 'left-0' : column === COLUMNS - 1 || column === -1 ? 'right-0' : 'left-1/2 -translate-x-1/2'

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      {...favoriteHandlers(favorite)}
      data-testid="favorite"
      data-favorite-id={favorite.id}
      aria-label={favorite.title}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group relative grid aspect-square place-items-center rounded-[10px] outline-none ${
        active ? 'bg-frame-3 ring-[1.5px] ring-iris-ring' : 'bg-frame-2 hover:bg-frame-3'
      } ${isDragging ? 'opacity-30' : ''}`}
    >
      <TileIcon favorite={favorite} />
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
    </button>
  )
}

export function TileIcon(props: { favorite: Pick<FavoriteInfo, 'emoji' | 'favicon'>; small?: boolean }): JSX.Element {
  const { favorite, small } = props
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

/** Drag the sidebar's edge next to the page: 220–380 px, saved on release. */
function ResizeHandle({ aside, side }: { aside: React.RefObject<HTMLElement | null>; side: SidebarSide }): JSX.Element {
  const setLayout = useBrowserStore((s) => s.setSidebarLayout)

  const start = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const el = aside.current
    if (!el) return
    e.preventDefault()
    const { left, right } = el.getBoundingClientRect()
    const widthAt = (x: number): number => Math.round(Math.min(Math.max(side === 'left' ? x - left : right - x, MIN_WIDTH), MAX_WIDTH))
    const move = (ev: PointerEvent): void => setLayout({ width: widthAt(ev.clientX), collapsed: false }, false)
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setLayout({ width: widthAt(ev.clientX), collapsed: false }, true)
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
