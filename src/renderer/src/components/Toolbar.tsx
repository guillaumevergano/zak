import type { ReactNode } from 'react'
import type { WidevineStatus } from '@shared/types'
import { selectActiveTab, useBrowserStore } from '../store/useBrowserStore'
import { isPrivateWindow } from '../lib/env'
import { BackIcon, ForwardIcon, ReloadIcon, StopIcon } from './Icons'
import { DownloadsButton } from './DownloadsButton'
import { ExtensionActions } from './ExtensionActions'
import { Omnibox } from './Omnibox'

const api = window.zak

/**
 * Cream toolbar across the window (CLAUDE.md §7): navigation buttons, omnibox, then the extension
 * icons and the downloads button at its end, above the sidebar. No extensions in private windows (§6.3).
 */
export function Toolbar({ widevine }: { widevine: WidevineStatus | null }): JSX.Element {
  const tab = useBrowserStore(selectActiveTab)
  const sidebar = useBrowserStore((s) => s.sidebar)
  const collapsed = sidebar?.layout.collapsed ?? false

  return (
    <div
      data-testid="toolbar"
      className="no-drag relative mx-2 flex h-[52px] shrink-0 items-center rounded-t-[14px] rounded-br-[14px] bg-cream text-cream-ink"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 pr-3 pl-2.5">
        <ToolButton title="Page précédente (⌘[)" disabled={!tab?.canGoBack} onClick={() => tab && api.invoke('tabs:back', tab.id)}>
          <BackIcon />
        </ToolButton>
        <ToolButton
          title="Page suivante (⌘])"
          disabled={!tab?.canGoForward}
          onClick={() => tab && api.invoke('tabs:forward', tab.id)}
        >
          <ForwardIcon />
        </ToolButton>
        {tab?.loading ? (
          <ToolButton title="Arrêter le chargement" onClick={() => api.invoke('tabs:stop', tab.id)}>
            <StopIcon />
          </ToolButton>
        ) : (
          <ToolButton title="Recharger (⌘R)" disabled={!tab} onClick={() => tab && api.invoke('tabs:reload', tab.id)}>
            <ReloadIcon />
          </ToolButton>
        )}
        <Omnibox tab={tab} />
        {widevine && !widevine.ready && (
          <span
            title={widevine.detail}
            className="shrink-0 rounded-full bg-pink/10 px-3 py-1 text-xs font-semibold whitespace-nowrap text-pink-button"
          >
            Lecteur vidéo DRM indisponible
          </span>
        )}
      </div>
      <div data-testid="toolbar-actions" className="flex shrink-0 items-center gap-1.5 pr-2.5">
        {sidebar && !isPrivateWindow && !collapsed && <ExtensionActions bar={sidebar.extensionBar} />}
        <DownloadsButton />
      </div>
      {tab?.loading && (
        <div className="absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full bg-pink/15">
          <div className="loading-bar h-full w-2/5 bg-pink" />
        </div>
      )}
    </div>
  )
}

function ToolButton(props: { title: string; disabled?: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] text-cream-ink hover:bg-black/6 disabled:text-cream-dim disabled:hover:bg-transparent"
    >
      {props.children}
    </button>
  )
}
