import { useEffect, useRef, useState } from 'react'
import type { ExtensionBarSettings } from '@shared/types'
import { toolActions, type ToolAction, type ZakToolId } from '@shared/tools'
import { barToolOf, shownExtensions, toolBarId } from '@shared/extensionBar'
import { t } from '@shared/i18n'
import { CameraIcon, PaletteIcon, PipetteIcon, RecordIcon, TranslateIcon } from './Icons'

const PARTITION = 'persist:main'

type ActionState = Awaited<ReturnType<NonNullable<Window['browserAction']>['getState']>>

/** The `<button is="browser-action">` element of electron-chrome-extensions, with its attributes. */
interface BrowserActionButton extends HTMLButtonElement {
  update(): void
}

/**
 * Extension icons at the top of the sidebar, as picked and ordered on zak://settings. Each one
 * is the library's `<button is="browser-action">` (icon, badge, popup, context menu), laid out here
 * instead of in `<browser-action-list>`, which can neither filter nor reorder. Zak's own tools
 * (CLAUDE.md §6.8) take their place among them, in the same order.
 */
export function ExtensionActions({ bar, tools }: { bar: ExtensionBarSettings; tools: ZakToolId[] }): JSX.Element | null {
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

  const items = shownExtensions([...toolActions(tools).map((action) => ({ id: toolBarId(action) })), ...(state?.actions ?? [])], bar)
  if (items.length === 0) return null
  const tab = String(state?.activeTabId ?? -1)

  return (
    <div ref={listRef} data-testid="extension-actions" className="flex min-w-0 flex-wrap items-center gap-2">
      {items.map(({ id }) => {
        const tool = barToolOf(id)
        if (tool) return <ToolButton key={id} tool={tool} />
        return (
          <button
            key={id}
            is="browser-action"
            id={id}
            // With `is`, React 18 treats it as a custom element and sets attributes as written.
            {...({ class: 'ext-action', partition: PARTITION, alignment: 'bottom left', tab } as Record<string, string>)}
          />
        )
      })}
    </div>
  )
}

const ACTION_LABELS: Record<ToolAction, () => string> = {
  screenshot: () => t('Capture d’écran…'),
  record: () => t('Enregistrer l’écran…'),
  translate: () => t('Traduire cette page'),
  colors: () => t('Prendre une couleur ({shortcut})', { shortcut: navigator.platform.startsWith('Mac') ? '⌘⇧K' : t('Ctrl+Maj+K') }),
  brand: () => t('Analyser la charte graphique du site')
}

const ACTION_ICONS: Record<ToolAction, () => JSX.Element> = {
  screenshot: CameraIcon,
  record: RecordIcon,
  translate: TranslateIcon,
  colors: PipetteIcon,
  brand: PaletteIcon
}

function ToolButton({ tool }: { tool: ToolAction }): JSX.Element {
  const label = ACTION_LABELS[tool]()
  const ActionIcon = ACTION_ICONS[tool]
  return (
    <button
      type="button"
      data-testid={`tool-action-${tool}`}
      title={label}
      aria-label={label}
      onClick={() => void window.zak.invoke('tools:run', tool)}
      className="ext-action grid place-items-center text-cream-ink"
    >
      <ActionIcon />
    </button>
  )
}
