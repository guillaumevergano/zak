import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import type { WidevineStatus } from '@shared/types'
import { useBrowserStore } from './store/useBrowserStore'
import { collisionDetection, parseDndId, ROOT_ZONE, type DndKind } from './lib/dnd'
import { rectOf } from './lib/favorites'
import { Sidebar, TileIcon } from './components/Sidebar'
import { TabGhost, TabStrip } from './components/TabStrip'
import { Toolbar } from './components/Toolbar'

const api = window.zak

/**
 * Browser chrome (CLAUDE.md §7, docs/design/maquette-v2.png): tab strip on the plum frame, then the
 * cream toolbar across the whole width (extension icons at its end), then the page on the left and
 * the plum sidebar on the right. Toolbar and page form one cream panel with rounded corners.
 * The page itself is a WebContentsView that main lays over the `content` placeholder.
 */
export function App(): JSX.Element {
  const [widevine, setWidevine] = useState<WidevineStatus | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const { setTabsState, focusOmnibox, setSidebar, toggleSidebar, setDownloads } = useBrowserStore.getState()
    const offs = [
      api.on('tabs:state', setTabsState),
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
    const report = (): void => {
      const r = el.getBoundingClientRect()
      api.send('layout:update', {
        left: Math.round(r.left),
        top: Math.round(r.top),
        right: Math.round(window.innerWidth - r.right),
        bottom: Math.round(window.innerHeight - r.bottom)
      })
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
        <TabStrip />
        <Toolbar widevine={widevine} />
        <div className="flex min-h-0 flex-1">
          <main className="page-slot no-drag mb-2 ml-2 min-w-0 flex-1 overflow-hidden rounded-b-[14px]">
            <div ref={contentRef} className="h-full w-full" />
          </main>
          <Sidebar />
        </div>
      </div>
    </DragAndDrop>
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
      draft: { title: f.title, url: f.url, emoji: f.emoji, folderId: f.folderId, favicon: f.favicon }
    })
  } else {
    const f = sidebar.folders.find((x) => x.id === id)
    if (!f) return
    void api.invoke('overlay:open', { kind: 'folder-editor', anchor, folderId: id, draft: { name: f.name, emoji: f.emoji } })
  }
}

/**
 * One drag & drop context for the chrome UI: reorder tabs, reorder favorites and folders,
 * move favorites between folders, drop a tab into the sidebar to make it a favorite.
 */
function DragAndDrop({ children }: { children: React.ReactNode }): JSX.Element {
  // A small distance keeps a plain click a click (activate, open) rather than a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [dragging, setDragging] = useState<{ kind: DndKind; id: string } | null>(null)
  const tabs = useBrowserStore((s) => s.tabs)
  const sidebar = useBrowserStore((s) => s.sidebar)

  const onDragStart = ({ active }: DragStartEvent): void => setDragging(parseDndId(active.id))

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    setDragging(null)
    if (!over || active.id === over.id) return
    const from = parseDndId(active.id)
    const to = parseDndId(over.id)
    const state = useBrowserStore.getState()

    // Favorites target: [folder, index] of the tile or zone under the pointer.
    const favoriteTarget = (): [string | null, number] | null => {
      if (!state.sidebar) return null
      const favorites = state.sidebar.favorites
      if (to.kind === 'fav') {
        const target = favorites.find((f) => f.id === to.id)
        if (!target) return null
        const siblings = favorites.filter((f) => f.folderId === target.folderId)
        return [target.folderId, siblings.indexOf(target)]
      }
      if (to.kind === 'zone' || to.kind === 'folder') {
        const folderId = to.id === ROOT_ZONE ? null : to.id
        return [folderId, favorites.filter((f) => f.folderId === folderId).length]
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
      if (target) void api.invoke('favorites:addFromTab', tabId, target[0], target[1])
      return
    }

    if (from.kind === 'fav') {
      const target = favoriteTarget()
      if (!target) return
      state.moveFavoriteLocally(from.id, target[0], target[1])
      void api.invoke('favorites:move', from.id, target[0], target[1])
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
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {ghostTab && <TabGhost tab={ghostTab} />}
        {ghostFavorite && (
          <div className="grid h-11 w-11 place-items-center rounded-[10px] bg-frame-3 shadow-[0_8px_24px_rgb(0_0_0/0.4)]">
            <TileIcon favorite={ghostFavorite} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
