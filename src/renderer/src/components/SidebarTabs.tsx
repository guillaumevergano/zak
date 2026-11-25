import { rectSortingStrategy, SortableContext, verticalListSortingStrategy, type SortingStrategy } from '@dnd-kit/sortable'
import { Fragment } from 'react'
import { t } from '@shared/i18n'
import { useBrowserStore } from '../store/useBrowserStore'
import { dndId } from '../lib/dnd'
import { BroomIcon, PlusIcon } from './Icons'
import { GroupChip, SplitPill, TabItem } from './TabStrip'

const api = window.zak

/** While a dragged tab is held over another one (to show them side by side), the list stays still. */
const stayStill: SortingStrategy = () => null

/**
 * The tabs in the sidebar, under the folders (CLAUDE.md §6.1, setting « Onglets : dans la barre
 * latérale »): « Onglets » with the broom and « + », the pinned tabs as icons, then one tab per row
 * (groups as a row above their tabs, a split view as one row in two halves). Folded sidebar: icons only.
 * Same drag & drop as the strip: reorder, hold over the middle of a tab for a split view, drop on
 * the favorites to make a favorite.
 */
export function SidebarTabs({ collapsed }: { collapsed: boolean }): JSX.Element {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeId = useBrowserStore((s) => s.activeId)
  const groups = useBrowserStore((s) => s.groups)
  const splits = useBrowserStore((s) => s.splits)
  const merging = useBrowserStore((s) => s.mergeTarget !== null)
  const pinned = tabs.filter((tab) => tab.pinned)
  const regular = tabs.filter((tab) => !tab.pinned)
  const closable = regular.filter((tab) => tab.id !== activeId).length
  const variant = collapsed ? 'icon' : 'row'

  const newTab = (
    <button
      data-testid="new-tab"
      title={t('Nouvel onglet (⌘T)')}
      onClick={() => void api.invoke('tabs:create')}
      className={`grid shrink-0 place-items-center rounded-lg text-frame-text hover:bg-frame-2 ${collapsed ? 'h-9 w-full' : 'h-7 w-7'}`}
    >
      <PlusIcon />
    </button>
  )

  return (
    <section aria-label={t('Onglets')} data-testid="sidebar-tabs" className="flex shrink-0 flex-col pb-3">
      {collapsed ? (
        <div className="mb-2">{newTab}</div>
      ) : (
        <div className="mb-2 flex h-7 items-center gap-1 pl-2">
          <span className="flex-1 text-[11.5px] font-bold tracking-[0.6px] text-frame-sub uppercase">{t('Onglets')}</span>
          <button
            data-testid="close-all"
            title={t("Fermer tous les onglets sauf l'onglet actif (⇧⌘W)")}
            disabled={closable === 0}
            onClick={() => void useBrowserStore.getState().closeAll()}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-frame-sub enabled:hover:bg-frame-2 enabled:hover:text-frame-text disabled:opacity-40"
          >
            <BroomIcon />
          </button>
          {newTab}
        </div>
      )}

      {pinned.length > 0 && (
        <SortableContext items={pinned.map((tab) => dndId('tab', tab.id))} strategy={rectSortingStrategy}>
          <div
            role="tablist"
            aria-label={t('Onglets épinglés')}
            data-testid="pinned-tabs"
            className={`mb-2.5 grid gap-2.5 ${collapsed ? 'grid-cols-1' : 'grid-cols-5'}`}
          >
            {pinned.map((tab) => (
              <TabItem key={tab.id} tab={tab} active={tab.id === activeId} variant="icon" />
            ))}
          </div>
        </SortableContext>
      )}

      <SortableContext items={regular.map((tab) => dndId('tab', tab.id))} strategy={merging ? stayStill : verticalListSortingStrategy}>
        <div role="tablist" aria-label={t('Onglets')} aria-orientation="vertical" className="flex flex-col gap-1">
          {regular.map((tab, i) => {
            const group = tab.groupId ? groups.find((g) => g.id === tab.groupId) : undefined
            const startsGroup = group !== undefined && regular[i - 1]?.groupId !== group.id
            // A split view: its two tabs, next to each other, make one row (drawn with the left one).
            const split = splits.find((s) => s.tabs.includes(tab.id))
            if (split && tab.id === split.tabs[1] && regular[i - 1]?.id === split.tabs[0]) return null
            const right = split && tab.id === split.tabs[0] && regular[i + 1]?.id === split.tabs[1] ? regular[i + 1] : undefined
            return (
              <Fragment key={tab.id}>
                {startsGroup && <GroupChip group={group} variant={variant} />}
                {!group?.collapsed &&
                  (split && right ? (
                    <SplitPill split={split} left={tab} right={right} activeId={activeId} group={group} variant={variant} />
                  ) : (
                    <TabItem tab={tab} active={tab.id === activeId} group={group} variant={variant} />
                  ))}
              </Fragment>
            )
          })}
        </div>
      </SortableContext>
    </section>
  )
}
