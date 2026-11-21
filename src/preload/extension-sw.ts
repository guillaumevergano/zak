/**
 * Preload for Chrome extension service workers only (never loaded into web pages).
 *
 * Works around two gaps that keep Dashlane from autofilling (see docs/EXTENSIONS.md):
 * 1. Electron builds `sender.tab` for runtime messages with `active: false`, `windowId: 0`.
 *    We correct `active` / `highlighted` / `windowId` / `index` from the tab state main pushes.
 * 2. `chrome.tabs.onHighlighted` is never dispatched. We replace it with an event fed by main.
 *
 * Also stubs `chrome.commands` (absent in electron-chrome-extensions): uBlock Origin Lite calls
 * `commands.onCommand.addListener` at top level and its worker fails to register without it.
 * Keyboard shortcuts of extensions stay inactive.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { EXT_GET_TABS, EXT_HIGHLIGHTED, EXT_TABS, type ExtensionTabState } from '@shared/ipc'

type Tabs = Record<number, ExtensionTabState>

// `location` is not available in the preload realm; the scheme is checked in the main world.
if (process.type === 'service-worker') {
  const bridge = {
    getTabs: (): Promise<Tabs> => ipcRenderer.invoke(EXT_GET_TABS),
    onTabs: (cb: (tabs: Tabs) => void): void => {
      ipcRenderer.on(EXT_TABS, (_e, tabs: Tabs) => cb(tabs))
    },
    onHighlighted: (cb: (info: { windowId: number; tabIds: number[] }) => void): void => {
      ipcRenderer.on(EXT_HIGHLIGHTED, (_e, info) => cb(info))
    }
  }

  contextBridge.executeInMainWorld({
    args: [bridge],
    func: (nk: typeof bridge) => {
      if ((globalThis as unknown as { location: { protocol: string } }).location.protocol !== 'chrome-extension:') return
      let tabs: Tabs = {}
      nk.getTabs().then((t) => (tabs = t))
      nk.onTabs((t) => (tabs = t))

      const fixSender = (sender: chrome.runtime.MessageSender | undefined): void => {
        const tab = sender?.tab
        const state = tab && typeof tab.id === 'number' ? tabs[tab.id] : undefined
        if (!tab || !state) return
        tab.active = state.active
        tab.highlighted = state.active
        tab.selected = state.active
        tab.windowId = state.windowId
        tab.index = state.index
      }

      // Wrap runtime.onMessage / onConnect so every listener sees the corrected sender.
      const wrapEvent = (event: any, wrap: (fn: any) => any): void => {
        if (!event) return
        const wrapped = new Map<any, any>()
        const add = event.addListener.bind(event)
        const remove = event.removeListener.bind(event)
        const has = event.hasListener.bind(event)
        event.addListener = (fn: any) => {
          if (wrapped.has(fn)) return
          const w = wrap(fn)
          wrapped.set(fn, w)
          add(w)
        }
        event.removeListener = (fn: any) => {
          const w = wrapped.get(fn)
          if (w) remove(w)
          wrapped.delete(fn)
        }
        event.hasListener = (fn: any) => (wrapped.has(fn) ? has(wrapped.get(fn)) : false)
      }
      wrapEvent(chrome.runtime?.onMessage, (fn) => (msg: unknown, sender: chrome.runtime.MessageSender, respond: unknown) => {
        fixSender(sender)
        return fn(msg, sender, respond)
      })
      wrapEvent(chrome.runtime?.onConnect, (fn) => (port: chrome.runtime.Port) => {
        fixSender(port.sender)
        return fn(port)
      })

      const makeEvent = <T extends (...args: any[]) => void>(listeners: Set<T>) => ({
        addListener: (fn: T) => void listeners.add(fn),
        removeListener: (fn: T) => void listeners.delete(fn),
        hasListener: (fn: T) => listeners.has(fn),
        hasListeners: () => listeners.size > 0
      })

      // A working chrome.tabs.onHighlighted.
      const listeners = new Set<(info: { windowId: number; tabIds: number[] }) => void>()
      const onHighlighted = makeEvent(listeners)
      nk.onHighlighted((info) => {
        for (const fn of listeners) {
          try {
            fn(info)
          } catch (err) {
            console.error(err)
          }
        }
      })
      try {
        Object.defineProperty(chrome.tabs, 'onHighlighted', { value: onHighlighted, configurable: true, enumerable: true })
      } catch (err) {
        console.warn('[zak] could not install chrome.tabs.onHighlighted', err)
      }

      // Inert chrome.commands: listeners are accepted but never fire.
      if (!(chrome as any).commands) {
        const declared = (chrome.runtime.getManifest() as { commands?: Record<string, { description?: string }> }).commands ?? {}
        const all = Object.entries(declared).map(([name, c]) => ({ name, description: c.description ?? '', shortcut: '' }))
        ;(chrome as any).commands = {
          onCommand: makeEvent(new Set<(...args: any[]) => void>()),
          getAll: (cb?: (commands: typeof all) => void) => (cb ? void cb(all) : Promise.resolve(all))
        }
      }
      // Electron also exposes a distinct `browser` namespace (used by uBO Lite).
      const browserNs = (globalThis as any).browser
      if (browserNs && browserNs !== chrome && !browserNs.commands) browserNs.commands = (chrome as any).commands
    }
  })
}
