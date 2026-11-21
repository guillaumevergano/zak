import type { OmniboxSuggestion, OverlayRequest } from '@shared/types'
import { GlobeIcon, SearchIcon } from '../components/Icons'

const api = window.zak

/** Omnibox dropdown (CLAUDE.md §6.7). The focus stays in the omnibox, which drives the selection. */
export function Suggestions({ request }: { request: Extract<OverlayRequest, { kind: 'suggestions' }> }): JSX.Element {
  const pick = (item: OmniboxSuggestion): void => {
    void api.invoke('overlay:hide', 'suggestions')
    void api.invoke('tabs:navigate', request.tabId, item.url)
  }

  return (
    <div
      role="listbox"
      aria-label="Suggestions"
      data-testid="suggestions"
      className="fixed inset-x-1 top-0 bottom-1.5 flex flex-col overflow-hidden rounded-[16px] border border-cream-edge bg-cream py-1.5 text-cream-ink shadow-[0_2px_6px_rgb(0_0_0/0.14)]"
    >
      {request.items.map((item, i) => (
        <div
          key={`${item.kind} ${item.url}`}
          role="option"
          aria-selected={i === request.selected}
          data-testid="suggestion"
          // mousedown: before the omnibox loses the focus (which hides this list).
          onMouseDown={(e) => {
            e.preventDefault()
            pick(item)
          }}
          className={`mx-1.5 flex h-9 shrink-0 cursor-default items-center gap-3 rounded-[10px] px-3 ${
            i === request.selected ? 'bg-cream-2' : 'hover:bg-cream-2/60'
          }`}
        >
          <span className="grid w-4 shrink-0 place-items-center text-cream-sub">
            {item.kind === 'search' ? (
              <SearchIcon />
            ) : item.emoji ? (
              <span className="emoji text-[14px] leading-none">{item.emoji}</span>
            ) : item.favicon ? (
              <img src={item.favicon} alt="" className="size-4 rounded" />
            ) : (
              <GlobeIcon />
            )}
          </span>
          <span className="min-w-0 truncate text-[13.5px]">
            {item.kind === 'search' ? (
              <>
                {item.title} <span className="text-cream-sub">— Rechercher</span>
              </>
            ) : (
              item.title
            )}
          </span>
          {(item.kind === 'history' || item.kind === 'favorite') && (
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-cream-sub">
              {item.url.replace(/^https?:\/\/(www\.)?/, '')}
            </span>
          )}
          {item.kind === 'favorite' && <span className="shrink-0 text-[11px] font-semibold text-iris">Favori</span>}
        </div>
      ))}
    </div>
  )
}
