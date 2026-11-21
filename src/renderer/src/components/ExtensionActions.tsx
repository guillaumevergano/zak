import { useEffect, useRef, useState } from 'react'
import type { ExtensionBarSettings } from '@shared/types'
import { shownExtensions } from '@shared/extensionBar'

const PARTITION = 'persist:main'

type ActionState = Awaited<ReturnType<NonNullable<Window['browserAction']>['getState']>>

/** The `<button is="browser-action">` element of electron-chrome-extensions, with its attributes. */
interface BrowserActionButton extends HTMLButtonElement {
  update(): void
}

/**
 * Extension icons at the top of the sidebar, as picked and ordered on zak://settings. Each one
 * is the library's `<button is="browser-action">` (icon, badge, popup, context menu), laid out here
 * instead of in `<browser-action-list>`, which can neither filter nor reorder.
 */
export function ExtensionActions({ bar }: { bar: ExtensionBarSettings }): JSX.Element | null {
  const [state, setState] = useState<ActionState | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const browserAction = window.browserAction
    if (!browserAction) return
    let alive = true
    const onUpdate = (next: ActionState): void => {
      if (alive) setState(next)
    }
    browserAction.addEventListener('update', onUpdate)
    browserAction.addObserver(PARTITION)
    void browserAction.getState(PARTITION).then(onUpdate)
    return () => {
      alive = false
      browserAction.removeEventListener('update', onUpdate)
      browserAction.removeObserver(PARTITION)
    }
  }, [])

  // Icons and badges change without any attribute change: ask each button to redraw.
  useEffect(() => {
    listRef.current?.querySelectorAll<BrowserActionButton>('button[is="browser-action"]').forEach((b) => b.update?.())
  }, [state])

  if (!state) return null
  const actions = shownExtensions(state.actions, bar)
  if (actions.length === 0) return null
  const tab = String(state.activeTabId ?? -1)

  return (
    <div ref={listRef} data-testid="extension-actions" className="flex min-w-0 flex-wrap items-center gap-2">
      {actions.map((action) => (
        <button
          key={action.id}
          is="browser-action"
          id={action.id}
          // With `is`, React 18 treats it as a custom element and sets attributes as written.
          {...({ class: 'ext-action', partition: PARTITION, alignment: 'bottom left', tab } as Record<string, string>)}
        />
      ))}
    </div>
  )
}
