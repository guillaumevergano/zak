import { contextBridge, ipcRenderer } from 'electron'
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'
import { EVENT_CHANNELS, INVOKE_CHANNELS, SEND_CHANNELS, type ZakApi } from '@shared/ipc'
import { isLang } from '@shared/languages'

// Registers the <browser-action-list> custom element (extension icons + popups).
injectBrowserAction()

const allowed = <T extends string>(list: readonly T[], channel: string): channel is T =>
  (list as readonly string[]).includes(channel)

// Interface language, chosen by main (`additionalArguments`).
const langArg = process.argv.find((arg) => arg.startsWith('--zak-lang='))
const langValue = langArg?.slice('--zak-lang='.length)
const lang = isLang(langValue) ? langValue : 'fr'

const profileArg = process.argv.find((arg) => arg.startsWith('--zak-profile-label='))
const profile = profileArg?.slice('--zak-profile-label='.length) || null

const api: ZakApi = {
  lang,
  profile,
  invoke(channel, ...args) {
    if (!allowed(INVOKE_CHANNELS, channel)) throw new Error(`Unknown channel ${channel}`)
    return ipcRenderer.invoke(channel, ...args)
  },
  send(channel, payload) {
    if (!allowed(SEND_CHANNELS, channel)) throw new Error(`Unknown channel ${channel}`)
    ipcRenderer.send(channel, payload)
  },
  on(channel, listener) {
    if (!allowed(EVENT_CHANNELS, channel)) throw new Error(`Unknown channel ${channel}`)
    const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown): void =>
      listener(payload as Parameters<typeof listener>[0])
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('zak', api)
