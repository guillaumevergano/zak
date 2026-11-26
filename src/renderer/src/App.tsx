import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import type { FavoriteInfo, WidevineStatus } from '@shared/types'
import { useBrowserStore } from './store/useBrowserStore'
import { collisionDetection, NEW_ROW, parseDndId, ROOT_ZONE, type DndKind } from './lib/dnd'
import { rectOf } from './lib/favorites'
import { Sidebar, TileIcon } from './components/Sidebar'
import { TabGhost, TabStrip, TitleBar } from './components/TabStrip'
import { Toolbar } from './components/Toolbar'
import { SplitFrame } from './components/SplitFrame'
import { ScrollTrack } from './components/ScrollTrack'
import { SPLIT_INSET } from '@shared/split'

const api = window.zak

/**
 * Browser chrome (CLAUDE.md §7, docs/design/maquette-v2.png): tab strip on the plum frame (or, with
 * the tabs in the sidebar, a thin title bar), then the cream toolbar across the whole width
 * (extension icons at its end), then the page and the plum sidebar, on its right by default or on
 * its left (mirrored). Toolbar and page form one cream panel with rounded corners.
 * The page itself is a WebContentsView that main lays over the `content` placeholder.
 */
export function App(): JSX.Element {
  const [widevine, setWidevine] = useState<WidevineStatus | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const inSplit = useBrowserStore((s) => s.splits.some((x) => s.activeId !== null && x.tabs.includes(s.activeId)))
  const side = useBrowserStore((s) => s.sidebar?.layout.side ?? 'right')
  const tabsInSidebar = useBrowserStore((s) => s.sidebar?.layout.tabs === 'sidebar')

  useEffect(() => {
    const { setTabsState, focusOmnibox, setSidebar, toggleSidebar, setDownloads } = useBrowserStore.getState()
    const offs = [
      api.on('tabs:state', setTabsState),
      api.on('tabs:scroll', ({ tabId, scroll }) => useBrowserStore.getState().setScroll(tabId, scroll)),
      api.on('omnibox:focus', focusOmnibox),
      api.on('sidebar:state', setSidebar),
      api.on('sidebar:toggle', toggleSidebar),
      api.on('sidebar:edit', openEditor),
      api.on('downloads:state', setDownloads)
    ]
    void api.invoke('downloads:getState').then(setDownloads)
    void api.invoke('tabs:getState').then(setTabsState)
    void api.invoke('sidebar:getState').then(setSidebar)
    void api.invoke('widevine:getStatus').then(setWidevine)
    return () => offs.forEach((off) => off())
  }, [])

  // Tell main where the page goes, so it can position the active tab's WebContentsView.
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    // Once per frame while the sidebar glides: the page follows its edge.
    let last = ''
    const report = (): void => {
      const r = el.getBoundingClientRect()
      // Rounded outwards: the page covers its slot to the last pixel (no light line on its edges).
      const insets = {
        left: Math.floor(r.left),
        top: Math.floor(r.top),
        right: Math.floor(window.innerWidth - r.right),
        bottom: Math.floor(window.innerHeight - r.bottom)
      }
      const key = JSON.stringify(insets)
      if (key === last) return
      last = key
      api.send('layout:update', insets)
    }
    const observer = new ResizeObserver(report)
    observer.observe(el)
    window.addEventListener('resize', report)
    report()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [])

  return (
    <DragAndDrop>
      <div className="flex h-full flex-col">
        {/* For screen readers: the window's title, and the bars as one landmark. */}
        <header className="contents">
          <h1 className="sr-only">Zak</h1>
          {tabsInSidebar ? <TitleBar /> : <TabStrip />}
          <Toolbar widevine={widevine} />
        </header>
        <div className="flex min-h-0 flex-1">
          {side === 'left' && (
            <>
              <Sidebar />
              <SidebarEdge />
            </>
          )}
          <main
            aria-label={t('Page')}
            data-split={inSplit || undefined}
            className={`page-slot no-drag relative mb-2 min-w-0 flex-1 overflow-hidden rounded-b-[14px] ${side === 'right' ? 'ml-2' : ''}`}
          >
            <div ref={contentRef} className="h-full w-full" />
            <SplitFrame />
          </main>
          <ScrollGutter corner={side === 'right'} />
          {side === 'right' && <Sidebar />}
        </div>
      </div>
    </DragAndDrop>
  )
}

/**
 * On the page's right: its thin scroll indicator (its own scrollbar is hidden), on the plum frame.
 * In a split view, the right page's (the left one's is in the split's gap). With the sidebar on the
 * right, the cream panel turns down here into the page: a concave corner at the top.
 */
function ScrollGutter({ corner }: { corner: boolean }): JSX.Element {
  const activeId = useBrowserStore((s) => s.activeId)
  const split = useBrowserStore((s) => s.splits.find((x) => activeId !== null && x.tabs.includes(activeId)))
  const inset = split ? SPLIT_INSET : 0
  return (
    <div data-testid="page-gutter" className="relative mb-2 w-2.5 shrink-0 bg-frame">
      {corner && <div aria-hidden className="concave-corner pointer-events-none absolute top-0 left-0 z-10 size-[14px]" />}
      <ScrollTrack tabId={split ? split.tabs[1] : activeId} testId="page-scroll" style={{ left: 0, right: 0, top: inset, bottom: inset }} />
    </div>
  )
}

/** Sidebar on the left: the frame between it and the page, where the cream panel turns down into the page. */
function SidebarEdge(): JSX.Element {
  return (
    <div className="relative mb-2 w-2.5 shrink-0 bg-frame">
      <div aria-hidden className="concave-corner-left pointer-events-none absolute top-0 right-0 z-10 size-[14px]" />
    </div>
  )
}

/** "Modifier…" / "Renommer…" from a native context menu: open the editor at the item. */
function openEditor({ kind, id }: { kind: 'favorite' | 'folder'; id: string }): void {
  const sidebar = useBrowserStore.getState().sidebar
  if (!sidebar) return
  const selector = kind === 'favorite' ? `[data-favorite-id="${id}"]` : `[data-folder-id="${id}"] > button`
  const el = document.querySelector(selector)
  const anchor = el ? rectOf(el) : { x: 24, y: 120, width: 0, height: 0 }
  if (kind === 'favorite') {
    const f = sidebar.favorites.find((x) => x.id === id)
    if (!f) return
    void api.invoke('overlay:open', {
      kind: 'favorite-editor',
      anchor,
      favoriteId: id,
      draft: { title: f.title, url: f.url, emoji: f.emoji, folderId: f.folderId, favicon: f.favicon, image: f.image }
    })
  } else {
    const f = sidebar.folders.find((x) => x.id === id)
    if (!f) return
    void api.invoke('overlay:open', { kind: 'folder-editor', anchor, folderId: id, draft: { name: f.name, emoji: f.emoji } })
  }
}

/**
 * The tab a dragged tab would join in a split view: the pointer is over the middle of a tab that
 * isn't pinned nor already in a split view (across the strip, or down the sidebar's list). Over its
 * edges, the drag reorders as usual. While over the middle the list stays still, so the target
 * doesn't slide away from the pointer.
 */
function mergeCandidate({ active, over, delta, activatorEvent }: DragMoveEvent): number | null {
  const from = parseDndId(active.id)
  const to = over ? parseDndId(over.id) : null
  if (!over || from.kind !== 'tab' || to?.kind !== 'tab' || !(activatorEvent instanceof PointerEvent)) return null
  const { tabs, splits, sidebar } = useBrowserStore.getState()
  const dragged = tabs.find((t) => t.id === Number(from.id))
  const target = tabs.find((t) => t.id === Number(to.id))
  if (!dragged || !target || dragged.id === target.id || dragged.pinned || target.pinned) return null
  if (splits.some((s) => s.tabs.includes(target.id))) return null
  const x = activatorEvent.clientX + delta.x
  const y = activatorEvent.clientY + delta.y
  const r = over.rect
  if (sidebar?.layout.tabs === 'sidebar') {
    const down = (y - r.top) / r.height
    return x >= r.left - 6 && x <= r.left + r.width + 6 && down > 0.25 && down < 0.75 ? target.id : null
  }
  const across = (x - r.left) / r.width
  return y >= r.top - 6 && y <= r.top + r.height + 6 && across > 0.2 && across < 0.8 ? target.id : null
}

/**
 * One drag & drop context for the chrome UI: reorder tabs, hold a tab over another to show them
 * side by side (split view), reorder favorites and folders, move favorites between folders, drop a
 * tab into the sidebar to make it a favorite.
 */
function DragAndDrop({ children }: { children: React.ReactNode }): JSX.Element {
  // A small distance keeps a plain click a click (activate, open) rather than a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [dragging, setDragging] = useState<{ kind: DndKind; id: string } | null>(null)
  const tabs = useBrowserStore((s) => s.tabs)
  const sidebar = useBrowserStore((s) => s.sidebar)
  const mergeTarget = useBrowserStore((s) => s.mergeTarget)
  const setMergeTarget = (id: number | null): void => {
    if (useBrowserStore.getState().mergeTarget !== id) useBrowserStore.getState().setMergeTarget(id)
  }

  const onDragStart = ({ active }: DragStartEvent): void => setDragging(parseDndId(active.id))

  // Over the middle of another tab: the strip stops reordering and the target lights up; dropping
  // then shows both tabs side by side.
  const onDragMove = (event: DragMoveEvent): void => setMergeTarget(mergeCandidate(event))

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    setDragging(null)
    const merging = useBrowserStore.getState().mergeTarget
    setMergeTarget(null)
    const from = parseDndId(active.id)
    if (merging !== null && from.kind === 'tab') {
      void api.invoke('tabs:split', merging, Number(from.id))
      return
    }
    if (!over || active.id === over.id) return
    const to = parseDndId(over.id)
    const state = useBrowserStore.getState()

    // Favorites target: [folder, index, row] of the tile, row or zone under the pointer. In the
    // root, the index is within the row (CLAUDE.md §6.2).
    const favoriteTarget = (): [string | null, number, number | undefined] | null => {
      if (!state.sidebar) return null
      const favorites = state.sidebar.favorites
      const root = favorites.filter((f) => f.folderId === null)
      const rowCount = root.reduce((n, f) => Math.max(n, f.row + 1), 0)
      const inRow = (row: number): FavoriteInfo[] => root.filter((f) => f.row === row && f.id !== from.id)
      if (to.kind === 'fav') {
        const target = favorites.find((f) => f.id === to.id)
        if (!target) return null
        if (target.folderId === null) return [null, root.filter((f) => f.row === target.row).indexOf(target), target.row]
        const siblings = favorites.filter((f) => f.folderId === target.folderId)
        return [target.folderId, siblings.indexOf(target), undefined]
      }
      if (to.kind === 'row') {
        const row = to.id === NEW_ROW ? rowCount : Number(to.id)
        return [null, inRow(row).length, row]
      }
      if (to.kind === 'zone' || to.kind === 'folder') {
        const folderId = to.id === ROOT_ZONE ? null : to.id
        if (folderId === null) {
          const last = Math.max(0, rowCount - 1)
          return [null, inRow(last).length, last]
        }
        return [folderId, favorites.filter((f) => f.folderId === folderId).length, undefined]
      }
      return null
    }

    if (from.kind === 'tab') {
      const tabId = Number(from.id)
      if (to.kind === 'tab') {
        const dragged = state.tabs.find((t) => t.id === tabId)
        const target = state.tabs.find((t) => t.id === Number(to.id))
        // Pinned and regular tabs don't mix (main clamps too).
        if (!dragged || !target || dragged.pinned !== target.pinned) return
        const index = state.tabs.indexOf(target)
        state.moveTabLocally(tabId, index)
        void api.invoke('tabs:move', tabId, index)
        return
      }
      const target = favoriteTarget()
      if (target) void api.invoke('favorites:addFromTab', tabId, target[0], target[1], target[2])
      return
    }

    if (from.kind === 'fav') {
      const target = favoriteTarget()
      if (!target) return
      state.moveFavoriteLocally(from.id, target[0], target[1], target[2])
      void api.invoke('favorites:move', from.id, target[0], target[1], target[2])
      return
    }

    if (from.kind === 'folder' && to.kind === 'folder' && state.sidebar) {
      const index = state.sidebar.folders.findIndex((f) => f.id === to.id)
      if (index >= 0) void api.invoke('folders:move', from.id, index)
    }
  }

  const ghostTab = dragging?.kind === 'tab' ? tabs.find((t) => t.id === Number(dragging.id)) : undefined
  const ghostFavorite = dragging?.kind === 'fav' ? sidebar?.favorites.find((f) => f.id === dragging.id) : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragging(null)
        setMergeTarget(null)
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {ghostTab && <TabGhost tab={ghostTab} merging={mergeTarget !== null} />}
        {ghostFavorite && (
          <div className="grid h-11 w-11 place-items-center rounded-[10px] bg-frame-3 shadow-[0_8px_24px_rgb(0_0_0/0.4)]">
            <TileIcon favorite={ghostFavorite} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
