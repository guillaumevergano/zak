import { horizontalListSortingStrategy, SortableContext, useSortable, type SortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Fragment, useEffect, useState } from 'react'
import type { TabGroupColor, TabGroupInfo, TabInfo, TabSplitInfo } from '@shared/types'
import { useBrowserStore } from '../store/useBrowserStore'
import { dndId } from '../lib/dnd'
import { BroomIcon, ChevronIcon, CloseIcon, GlobeIcon, PlusIcon, SparkleIcon, SpeakerIcon, SplitIcon } from './Icons'
import { isPrivateWindow } from '../lib/env'
import { t } from '@shared/i18n'

const api = window.zak
const isMac = navigator.userAgent.includes('Mac')

/** While a dragged tab is held over another one (to show them side by side), the strip stays still. */
const stayStill: SortingStrategy = () => null

/**
 * Top tab strip (CLAUDE.md §6.1, §7) on the plum frame: traffic lights, pinned tabs as icons,
 * the broom ("Tout fermer"), then the tabs and "+". Tabs reorder by drag & drop.
 */
export function TabStrip(): JSX.Element {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeId = useBrowserStore((s) => s.activeId)
  const groups = useBrowserStore((s) => s.groups)
  const splits = useBrowserStore((s) => s.splits)
  const merging = useBrowserStore((s) => s.mergeTarget !== null)
  const pinned = tabs.filter((t) => t.pinned)
  const regular = tabs.filter((t) => !t.pinned)

  return (
    <div className={`drag flex h-11 shrink-0 items-end gap-1 ${isMac ? 'pr-2.5 pl-[84px]' : 'pr-36 pl-3'}`}>
      {/* The DndContext lives in App: tabs can also be dropped into the sidebar. */}
      {pinned.length > 0 && (
        <SortableContext items={pinned.map((t) => dndId('tab', t.id))} strategy={horizontalListSortingStrategy}>
          <div role="tablist" aria-label={t('Onglets épinglés')} data-testid="pinned-tabs" className="mb-1.5 flex shrink-0 items-center gap-1.5">
            {pinned.map((tab) => (
              <TabItem key={tab.id} tab={tab} active={tab.id === activeId} />
            ))}
          </div>
        </SortableContext>
      )}
      <CloseAllButton closable={regular.filter((t) => t.id !== activeId).length} />
      <SortableContext items={regular.map((t) => dndId('tab', t.id))} strategy={merging ? stayStill : horizontalListSortingStrategy}>
        {/* px-2.5: room for the active tab's 10 px feet, which the scrolling list would clip at its ends
            (first and last tab); -mx-1 keeps the tabs where they were. */}
        <div role="tablist" aria-label={t('Onglets')} className="no-scrollbar -mx-1 flex min-w-0 items-end gap-1.5 overflow-x-auto px-2.5">
          {regular.map((tab, i) => {
            const group = tab.groupId ? groups.find((g) => g.id === tab.groupId) : undefined
            const startsGroup = group !== undefined && regular[i - 1]?.groupId !== group.id
            // A split view: its two tabs, next to each other, make one pill (drawn with the left one).
            const split = splits.find((s) => s.tabs.includes(tab.id))
            if (split && tab.id === split.tabs[1] && regular[i - 1]?.id === split.tabs[0]) return null
            const right = split && tab.id === split.tabs[0] && regular[i + 1]?.id === split.tabs[1] ? regular[i + 1] : undefined
            return (
              <Fragment key={tab.id}>
                {startsGroup && <GroupChip group={group} />}
                {!group?.collapsed &&
                  (split && right ? (
                    <SplitPill split={split} left={tab} right={right} activeId={activeId} group={group} />
                  ) : (
                    <TabItem tab={tab} active={tab.id === activeId} group={group} />
                  ))}
              </Fragment>
            )
          })}
        </div>
      </SortableContext>
      <button
        data-testid="new-tab"
        title={t('Nouvel onglet (⌘T)')}
        className="no-drag mb-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-frame-text hover:bg-frame-3"
        onClick={() => void api.invoke('tabs:create')}
      >
        <PlusIcon />
      </button>
      <div className="min-w-4 flex-1" />
      {isPrivateWindow ? <PrivateBadge /> : api.profile && <ProfileBadge label={api.profile} />}
    </div>
  )
}

/** Tab group colors, made to sit on the plum frame. */
export const GROUP_COLOR: Record<TabGroupColor, string> = {
  grey: '#a8929f',
  blue: '#7aa7ff',
  red: '#ff6b81',
  yellow: '#f5c84c',
  green: '#5fd38d',
  pink: '#ff8cc4',
  purple: '#c67afb',
  cyan: '#5fd3e0',
  orange: '#ffa25f'
}

/**
 * A group's chip, before its tabs: click folds or unfolds it (like Chrome); « Renommer le
 * groupe… » in its menu turns it into a field.
 */
export function GroupChip({ group, variant = 'strip' }: { group: TabGroupInfo; variant?: TabVariant }): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  useEffect(() => api.on('tabGroups:rename', ({ groupId }) => groupId === group.id && setEditing(true)), [group.id])
  useEffect(() => setName(group.name), [group.name])
  const save = (): void => {
    setEditing(false)
    if (name.trim() !== group.name) void api.invoke('tabGroups:update', group.id, { name: name.trim() })
  }
  const color = GROUP_COLOR[group.color]
  if (editing) {
    return (
      <input
        autoFocus
        value={name}
        aria-label={t('Nom du groupe')}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') {
            setName(group.name)
            setEditing(false)
          }
        }}
        style={{ borderColor: color }}
        className={`no-drag h-7 shrink-0 rounded-[9px] border-2 bg-frame-2 px-2 text-[12.5px] font-semibold text-frame-text outline-none ${
          variant === 'strip' ? 'mb-1.5 w-[120px]' : 'w-full'
        }`}
      />
    )
  }
  const toggle = (): void => void api.invoke('tabGroups:update', group.id, { collapsed: !group.collapsed })
  const menu = (e: React.MouseEvent): void => {
    e.preventDefault()
    void api.invoke('tabGroups:showMenu', group.id)
  }
  if (variant !== 'strip') {
    // In the sidebar: a row (dot, name, chevron) above the group's tabs; folded sidebar: a colored bar.
    return (
      <button
        type="button"
        data-testid="tab-group"
        aria-expanded={!group.collapsed}
        title={group.name || (group.collapsed ? t('Déplier le groupe') : t('Replier le groupe'))}
        onClick={toggle}
        onContextMenu={menu}
        className={
          variant === 'icon'
            ? 'no-drag mt-1 grid h-4 w-full shrink-0 cursor-default place-items-center rounded-full outline-none hover:bg-frame-2'
            : 'no-drag mt-1.5 flex h-7 w-full shrink-0 cursor-default items-center gap-2 rounded-lg px-2 text-[12.5px] font-bold text-frame-text outline-none hover:bg-frame-2 focus-visible:ring-2 focus-visible:ring-frame-text'
        }
      >
        <span aria-hidden style={{ backgroundColor: color }} className={variant === 'icon' ? 'h-1.5 w-6 rounded-full' : 'h-2.5 w-2.5 shrink-0 rounded-full'} />
        {variant === 'row' && (
          <>
            <span className="min-w-0 flex-1 truncate text-left">{group.name}</span>
            <span className="text-frame-sub">
              <ChevronIcon open={!group.collapsed} />
            </span>
          </>
        )}
      </button>
    )
  }
  return (
    <button
      type="button"
      data-testid="tab-group"
      aria-expanded={!group.collapsed}
      title={group.collapsed ? t('Déplier le groupe') : t('Replier le groupe')}
      onClick={toggle}
      onContextMenu={menu}
      style={{ backgroundColor: color }}
      className={`no-drag mb-1.5 flex h-7 max-w-[140px] shrink-0 cursor-default items-center rounded-[9px] text-[12.5px] font-bold text-frame outline-none focus-visible:ring-2 focus-visible:ring-frame-text ${
        group.name ? 'px-2.5' : 'w-4 px-0'
      }`}
    >
      <span className="truncate">{group.name}</span>
    </button>
  )
}

/**
 * Two tabs in a split view (side by side in the page area): one pill, a half per tab. Each half
 * is still a tab: click to use it, drag it away to leave the split view, ✕ to close it.
 */
export function SplitPill({
  split,
  left,
  right,
  activeId,
  group,
  variant = 'strip'
}: {
  split: TabSplitInfo
  left: TabInfo
  right: TabInfo
  activeId: number | null
  group?: TabGroupInfo
  variant?: TabVariant
}): JSX.Element {
  const shown = activeId === left.id || activeId === right.id
  if (variant !== 'strip') {
    // In the sidebar: one row, a half per tab; folded sidebar: the two icons one above the other.
    const row = variant === 'row'
    return (
      <div
        data-testid="split-tab"
        data-split-id={split.id}
        className={`relative flex w-full shrink-0 rounded-[10px] ${row ? 'h-9 items-center' : 'flex-col gap-1 p-1'} ${shown ? 'bg-cream' : 'bg-frame-2'}`}
      >
        {group && (
          <span
            aria-hidden
            data-testid="tab-group-line"
            style={{ backgroundColor: GROUP_COLOR[group.color] }}
            className={`pointer-events-none absolute rounded-full ${row ? 'top-2 bottom-2 left-1 w-[3px]' : 'right-2 bottom-0.5 left-2 h-[3px]'}`}
          />
        )}
        <TabItem tab={left} active={activeId === left.id} inSplit={{ shown }} variant={variant} />
        {row && <span aria-hidden className={`h-4 w-px shrink-0 ${shown ? 'bg-cream-edge' : 'bg-frame-line'}`} />}
        <TabItem tab={right} active={activeId === right.id} inSplit={{ shown }} variant={variant} />
      </div>
    )
  }
  return (
    <div
      data-testid="split-tab"
      data-split-id={split.id}
      className={`relative flex w-[320px] min-w-20 shrink items-center ${
        shown ? 'tab-active z-10 h-9 rounded-t-[12px]' : 'mb-1.5 h-8 rounded-[10px] bg-frame-2'
      }`}
    >
      {group && (
        <span
          aria-hidden
          data-testid="tab-group-line"
          style={{ backgroundColor: GROUP_COLOR[group.color] }}
          className={`pointer-events-none absolute right-2 left-2 h-[3px] rounded-full ${shown ? 'top-0' : 'bottom-0'}`}
        />
      )}
      <TabItem tab={left} active={activeId === left.id} inSplit={{ shown }} />
      <span aria-hidden className={`h-4 w-px shrink-0 ${shown ? 'bg-cream-edge' : 'bg-frame-line'}`} />
      <TabItem tab={right} active={activeId === right.id} inSplit={{ shown }} />
    </div>
  )
}

/**
 * How a tab is drawn: in the top strip; as a row of the sidebar's list (tabs in the sidebar); or as
 * an icon (pinned tabs in the sidebar, every tab when the sidebar is folded).
 */
export type TabVariant = 'strip' | 'row' | 'icon'

export function TabItem({
  tab,
  active,
  group,
  inSplit,
  variant = 'strip'
}: {
  tab: TabInfo
  active: boolean
  group?: TabGroupInfo
  /** Half of a split view's pill; `shown`: the split view is on screen (the pill is the active tab). */
  inSplit?: { shown: boolean }
  variant?: TabVariant
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dndId('tab', tab.id) })
  const mergeTarget = useBrowserStore((s) => s.mergeTarget === tab.id)
  const close = (): void => void api.invoke('tabs:close', tab.id)
  // On cream: the active tab, or both halves of a split view on screen.
  const onCream = (active && !tab.pinned) || inSplit?.shown === true
  const icon = variant === 'icon' || (tab.pinned && variant === 'strip')
  const inRow = variant === 'row'

  // Pinned: an icon that widens on hover to show the site's title.
  const shape =
    variant === 'icon' && !inSplit
      ? `aspect-square w-full justify-center rounded-[10px] ${active ? 'bg-cream text-cream-ink' : 'bg-frame-2 text-frame-text hover:bg-frame-3'}`
      : tab.pinned && variant === 'strip'
        ? `h-8 shrink-0 rounded-[10px] px-2 font-medium ${
            active ? 'bg-cream text-cream-ink' : 'bg-frame-2 text-frame-text hover:bg-frame-3'
          }`
        : inSplit
          ? `min-w-0 flex-1 rounded-[9px] ${variant === 'icon' ? 'aspect-square w-full justify-center' : 'h-full gap-1.5 pr-1.5 pl-2.5'} ${
              inSplit.shown
                ? active
                  ? 'font-semibold text-cream-ink'
                  : 'font-medium text-cream-sub hover:text-cream-ink'
                : 'font-medium text-frame-text hover:bg-frame-3'
            }`
          : inRow
            ? `h-9 w-full gap-2.5 rounded-[10px] pr-1.5 pl-3 text-[13.5px] ${
                active ? 'bg-cream font-semibold text-cream-ink' : 'font-medium text-frame-text hover:bg-frame-2'
              }`
            : `w-[210px] min-w-10 shrink gap-2 pr-2 pl-3 ${
                active
                  ? 'tab-active z-10 h-9 rounded-t-[12px] font-semibold text-cream-ink'
                  : 'mb-1.5 h-8 rounded-[10px] bg-frame-2 font-medium text-frame-text hover:bg-frame-3'
              }`
  // The strip only slides sideways, the sidebar's list only up and down.
  const moved = transform && (variant === 'strip' ? { ...transform, y: 0 } : inRow ? { ...transform, x: 0 } : transform)
  const groupLine = !group
    ? null
    : variant === 'strip'
      ? `right-2 left-2 h-[3px] ${active ? 'top-0' : 'bottom-0'}`
      : inRow
        ? 'top-2 bottom-2 left-1 w-[3px]'
        : 'right-2 bottom-1 left-2 h-[3px]'

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={active}
      // Roving focus, like any tab list: Tab reaches the active tab, arrows move between tabs.
      tabIndex={active ? 0 : -1}
      onKeyDown={(e) => {
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
        if (step === 0 && e.key !== 'Home' && e.key !== 'End') return
        e.preventDefault()
        const all = [...document.querySelectorAll<HTMLElement>('[data-testid="tab"]')]
        const index = all.indexOf(e.currentTarget)
        const next = e.key === 'Home' ? all[0] : e.key === 'End' ? all[all.length - 1] : all[(index + step + all.length) % all.length]
        if (!next) return
        next.focus()
        void api.invoke('tabs:activate', Number(next.dataset['tabId']), false)
      }}
      data-testid="tab"
      data-tab-id={tab.id}
      data-pinned={tab.pinned || undefined}
      data-asleep={tab.asleep || undefined}
      data-merge-target={mergeTarget || undefined}
      title={tab.asleep ? t('{title} (en veille)', { title: tab.title }) : tab.title}
      style={{ transform: CSS.Translate.toString(moved), transition }}
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
        isDragging ? 'opacity-40' : tab.asleep && !active ? 'opacity-60' : ''
      } ${mergeTarget ? 'ring-2 ring-iris ring-inset' : ''}`}
    >
      {mergeTarget && (
        <span aria-hidden className="pointer-events-none absolute -top-1 -right-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-iris text-frame">
          <SplitIcon />
        </span>
      )}
      {group && groupLine && (
        <span
          aria-hidden
          data-testid="tab-group-line"
          style={{ backgroundColor: GROUP_COLOR[group.color] }}
          className={`pointer-events-none absolute rounded-full ${groupLine}`}
        />
      )}
      <Favicon tab={tab} />
      {tab.pinned && variant === 'strip' ? (
        <span
          data-testid="pinned-title"
          className="max-w-0 overflow-hidden whitespace-nowrap transition-[max-width,margin] duration-150 ease-out group-hover:mr-1 group-hover:ml-2 group-hover:max-w-[160px]"
        >
          {tab.title}
        </span>
      ) : (
        !icon && <span className="min-w-0 flex-1 truncate">{tab.title}</span>
      )}
      {(tab.audible || tab.muted) && (
        <span
          // Not a focusable button inside the tab (nested controls): ⌘W and the tab's menu do the same.
          aria-hidden
          data-testid="tab-sound"
          title={tab.muted ? t('Réactiver le son') : t('Couper le son')}
          // In the tab's top left corner, over its icon: a pinned tab widening on hover doesn't move it.
          className={`absolute -top-1 -left-1 z-10 grid h-[17px] w-[17px] place-items-center rounded-full bg-frame ring-2 ring-frame ${
            tab.muted ? 'text-frame-sub' : 'text-pink-soft'
          } hover:bg-frame-3`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void api.invoke('tabs:toggleMute', tab.id)}
        >
          <SpeakerIcon muted={tab.muted} size={11} />
        </span>
      )}
      {!tab.pinned && !icon && (
        <span
          // Not a focusable button inside the tab (nested controls): ⌘W and the tab's menu do the same.
          aria-hidden
          title={t("Fermer l'onglet (⌘W)")}
          data-testid="tab-close"
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${
            onCream
              ? `text-cream-sub hover:bg-black/8 hover:text-cream-ink ${active ? '' : 'opacity-0 group-hover:opacity-100'}`
              : 'text-frame-sub opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-frame-text'
          }`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={close}
        >
          <CloseIcon />
        </span>
      )}
    </div>
  )
}

/** The profile of this window, when there are several (Fichier → Profils). */
export function ProfileBadge({ label }: { label: string }): JSX.Element {
  return (
    <span
      data-testid="profile-badge"
      title={t('Profil : {name}', { name: label })}
      className="mb-[11px] flex h-6 max-w-[160px] shrink-0 items-center rounded-full bg-frame-2 px-2.5 text-[11.5px] font-bold text-frame-text"
    >
      <span className="truncate">{label}</span>
    </span>
  )
}

/** "Privé" pill of private windows (CLAUDE.md §6.3). */
export function PrivateBadge(): JSX.Element {
  return (
    <span
      data-testid="private-badge"
      title={t(
        'Navigation privée : ni historique, ni cookies, ni données de site gardés après la fermeture de la fenêtre. Extensions désactivées.'
      )}
      className="mb-[11px] flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-pink/40 bg-pink/12 px-2.5 text-[11.5px] font-bold text-pink-soft"
    >
      <MaskIcon />
      {t('Privé')}
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
export function TabGhost({ tab, merging }: { tab: TabInfo; merging: boolean }): JSX.Element {
  return (
    <div className="flex h-9 w-[210px] items-center gap-2 rounded-xl bg-cream pr-2 pl-3 font-semibold text-cream-ink shadow-[0_8px_24px_rgb(0_0_0/0.35)]">
      <Favicon tab={tab} />
      <span className="min-w-0 flex-1 truncate">{merging ? t('Côte à côte') : tab.title}</span>
      {merging && (
        <span className="text-iris-ring">
          <SplitIcon />
        </span>
      )}
    </div>
  )
}

export function Favicon({ tab }: { tab: TabInfo }): JSX.Element {
  if (tab.loading) {
    return <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-pink/30 border-t-pink" />
  }
  if (tab.favicon) return <img src={tab.favicon} alt="" draggable={false} className="h-4 w-4 shrink-0 rounded-[4px]" />
  // The new tab page (empty URL) gets the sparkle of the mockup.
  return <span className="shrink-0 text-iris">{tab.url === '' ? <SparkleIcon /> : <GlobeIcon />}</span>
}

/** Broom (CLAUDE.md §6.1, à la Arc): closes every tab but the active and the pinned ones, no confirmation. */
export function CloseAllButton({ closable }: { closable: number }): JSX.Element {
  return (
    <button
      data-testid="close-all"
      title={t("Fermer tous les onglets sauf l'onglet actif (⇧⌘W)")}
      disabled={closable === 0}
      className="no-drag mb-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-frame-sub enabled:hover:bg-frame-3 enabled:hover:text-frame-text disabled:opacity-40"
      onClick={() => void useBrowserStore.getState().closeAll()}
    >
      <BroomIcon />
    </button>
  )
}

/**
 * With the tabs in the sidebar: a thin plum title bar instead of the strip (CLAUDE.md §6.1). It
 * holds the traffic lights (or, elsewhere, the caption buttons drawn over it), the active page's
 * title, the private or profile badge, and moves the window.
 */
export function TitleBar(): JSX.Element {
  const title = useBrowserStore((s) => s.tabs.find((tab) => tab.id === s.activeId)?.title ?? '')
  return (
    <div data-testid="title-bar" className={`drag relative flex h-9 shrink-0 items-center ${isMac ? 'pr-2.5 pl-[84px]' : 'pr-36 pl-3'}`}>
      <span className="pointer-events-none absolute inset-x-[150px] truncate text-center text-[12.5px] font-semibold text-frame-sub">{title}</span>
      <div className="min-w-4 flex-1" />
      {/* The badges sit at the bottom of the strip's row; here, in the middle of the bar. */}
      <div className="flex *:mb-0">{isPrivateWindow ? <PrivateBadge /> : api.profile && <ProfileBadge label={api.profile} />}</div>
    </div>
  )
}
