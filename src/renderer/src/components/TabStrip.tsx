import { horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TabInfo } from '@shared/types'
import { useBrowserStore } from '../store/useBrowserStore'
import { dndId } from '../lib/dnd'
import { BroomIcon, CloseIcon, GlobeIcon, PlusIcon, SparkleIcon, SpeakerIcon } from './Icons'
import { isPrivateWindow } from '../lib/env'

const api = window.zak
const isMac = navigator.userAgent.includes('Mac')

/**
 * Top tab strip (CLAUDE.md §6.1, §7) on the plum frame: traffic lights, pinned tabs as icons,
 * the broom ("Tout fermer"), then the tabs and "+". Tabs reorder by drag & drop.
 */
export function TabStrip(): JSX.Element {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeId = useBrowserStore((s) => s.activeId)
  const pinned = tabs.filter((t) => t.pinned)
  const regular = tabs.filter((t) => !t.pinned)

  return (
    <div className={`drag flex h-11 shrink-0 items-end gap-1 ${isMac ? 'pr-2.5 pl-[84px]' : 'pr-36 pl-3'}`}>
      {/* The DndContext lives in App: tabs can also be dropped into the sidebar. */}
      {pinned.length > 0 && (
        <SortableContext items={pinned.map((t) => dndId('tab', t.id))} strategy={horizontalListSortingStrategy}>
          <div role="tablist" aria-label="Onglets épinglés" data-testid="pinned-tabs" className="mb-1.5 flex shrink-0 items-center gap-1.5">
            {pinned.map((tab) => (
              <TabItem key={tab.id} tab={tab} active={tab.id === activeId} />
            ))}
          </div>
        </SortableContext>
      )}
      <CloseAllButton closable={regular.filter((t) => t.id !== activeId).length} />
      <SortableContext items={regular.map((t) => dndId('tab', t.id))} strategy={horizontalListSortingStrategy}>
        <div role="tablist" className="no-scrollbar flex min-w-0 items-end gap-1.5 overflow-x-auto px-1.5">
          {regular.map((tab) => (
            <TabItem key={tab.id} tab={tab} active={tab.id === activeId} />
          ))}
        </div>
      </SortableContext>
      <button
        data-testid="new-tab"
        title="Nouvel onglet (⌘T)"
        className="no-drag mb-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-frame-text hover:bg-frame-3"
        onClick={() => void api.invoke('tabs:create')}
      >
        <PlusIcon />
      </button>
      <div className="min-w-4 flex-1" />
      {isPrivateWindow && <PrivateBadge />}
    </div>
  )
}

function TabItem({ tab, active }: { tab: TabInfo; active: boolean }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dndId('tab', tab.id) })
  const close = (): void => void api.invoke('tabs:close', tab.id)

  // Pinned: an icon that widens on hover to show the site's title.
  const shape = tab.pinned
    ? `h-8 shrink-0 rounded-[10px] px-2 font-medium ${
        active ? 'bg-cream text-cream-ink' : 'bg-frame-2 text-frame-text hover:bg-frame-3'
      }`
    : `w-[210px] min-w-10 shrink gap-2 pr-2 pl-3 ${
        active
          ? 'tab-active z-10 h-9 rounded-t-[12px] font-semibold text-cream-ink'
          : 'mb-1.5 h-8 rounded-[10px] bg-frame-2 font-medium text-frame-text hover:bg-frame-3'
      }`

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={active}
      data-testid="tab"
      data-pinned={tab.pinned || undefined}
      title={tab.title}
      style={{ transform: CSS.Translate.toString(transform && { ...transform, y: 0 }), transition }}
      onPointerDown={(e) => {
        if (e.button === 0) void api.invoke('tabs:activate', tab.id)
        listeners?.['onPointerDown']?.(e)
      }}
      // Middle click closes, like Chrome. preventDefault on mousedown avoids autoscroll.
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onAuxClick={(e) => e.button === 1 && close()}
      onContextMenu={(e) => {
        e.preventDefault()
        void api.invoke('tabs:showContextMenu', tab.id)
      }}
      className={`no-drag group relative flex cursor-default items-center outline-none ${shape} ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <Favicon tab={tab} />
      {tab.pinned ? (
        <span
          data-testid="pinned-title"
          className="max-w-0 overflow-hidden whitespace-nowrap transition-[max-width,margin] duration-150 ease-out group-hover:mr-1 group-hover:ml-2 group-hover:max-w-[160px]"
        >
          {tab.title}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{tab.title}</span>
      )}
      {(tab.audible || tab.muted) && (
        <button
          title={tab.muted ? 'Réactiver le son' : 'Couper le son'}
          className={`grid shrink-0 place-items-center rounded-md ${
            tab.pinned ? 'absolute -top-1 -right-1 h-4 w-4 bg-frame' : 'h-5 w-5 hover:bg-black/10'
          } ${tab.muted ? 'opacity-50' : 'text-pink'}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void api.invoke('tabs:toggleMute', tab.id)}
        >
          <SpeakerIcon muted={tab.muted} />
        </button>
      )}
      {!tab.pinned && (
        <button
          title="Fermer l'onglet (⌘W)"
          data-testid="tab-close"
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${
            active ? 'text-cream-sub hover:bg-black/8 hover:text-cream-ink' : 'text-frame-sub opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-frame-text'
          }`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={close}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  )
}

/** "Privé" pill of private windows (CLAUDE.md §6.3). */
function PrivateBadge(): JSX.Element {
  return (
    <span
      data-testid="private-badge"
      title="Navigation privée : ni historique, ni cookies, ni données de site gardés après la fermeture de la fenêtre. Extensions désactivées."
      className="mb-[11px] flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-pink/40 bg-pink/12 px-2.5 text-[11.5px] font-bold text-pink-soft"
    >
      <MaskIcon />
      Privé
    </span>
  )
}

function MaskIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width={13} height={13} fill="currentColor" aria-hidden>
      <path d="M1.5 6.2c0-.9.7-1.5 1.6-1.4 1.5.2 3 .6 4.9.6s3.4-.4 4.9-.6c.9-.1 1.6.5 1.6 1.4 0 3-1.7 5-3.8 5-1.1 0-1.8-.6-2.7-1.6-.5.9-1.2-.9-1.2-.9s-.7 1.8-1.2.9c-.9 1-1.6 1.6-2.7 1.6C3.2 11.2 1.5 9.2 1.5 6.2Zm3.3 1.1c-.6 0-1.1.3-1.3.8.4.4 1 .6 1.5.6s1-.2 1.4-.6c-.3-.5-.9-.8-1.6-.8Zm6.4 0c-.7 0-1.3.3-1.6.8.4.4.9.6 1.4.6s1.1-.2 1.5-.6c-.2-.5-.7-.8-1.3-.8Z" />
    </svg>
  )
}

/** What follows the pointer while a tab is dragged (DragOverlay in App). */
export function TabGhost({ tab }: { tab: TabInfo }): JSX.Element {
  return (
    <div className="flex h-9 w-[210px] items-center gap-2 rounded-xl bg-cream pr-2 pl-3 font-semibold text-cream-ink shadow-[0_8px_24px_rgb(0_0_0/0.35)]">
      <Favicon tab={tab} />
      <span className="min-w-0 flex-1 truncate">{tab.title}</span>
    </div>
  )
}

function Favicon({ tab }: { tab: TabInfo }): JSX.Element {
  if (tab.loading) {
    return <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-pink/30 border-t-pink" />
  }
  if (tab.favicon) return <img src={tab.favicon} alt="" draggable={false} className="h-4 w-4 shrink-0 rounded-[4px]" />
  // The new tab page (empty URL) gets the sparkle of the mockup.
  return <span className="shrink-0 text-iris">{tab.url === '' ? <SparkleIcon /> : <GlobeIcon />}</span>
}

/** Broom (CLAUDE.md §6.1, à la Arc): closes every tab but the active and the pinned ones, no confirmation. */
function CloseAllButton({ closable }: { closable: number }): JSX.Element {
  return (
    <button
      data-testid="close-all"
      title="Fermer tous les onglets sauf l'onglet actif (⇧⌘W)"
      disabled={closable === 0}
      className="no-drag mb-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-frame-sub enabled:hover:bg-frame-3 enabled:hover:text-frame-text disabled:opacity-40"
      onClick={() => void useBrowserStore.getState().closeAll()}
    >
      <BroomIcon />
    </button>
  )
}
