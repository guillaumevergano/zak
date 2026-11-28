import { normalizeHex } from '@shared/colors'
import type { InternalApiRoutes } from '@shared/ipc'
import type { ColorsStore } from '../store/colors'
import type { SettingsStore } from '../store/settings'
import type { WindowManager } from '../windows/WindowManager'
import type { ColorTool } from './ColorTool'

type Routes = {
  [R in keyof InternalApiRoutes as R extends `colors/${string}` ? R : never]: (
    body: InternalApiRoutes[R]['body']
  ) => InternalApiRoutes[R]['result'] | Promise<InternalApiRoutes[R]['result']>
}

/** zak://colors (CLAUDE.md §6.8): the eyedropper's colors, the brand kits and their folders. */
export function colorRoutes(store: ColorsStore, tool: ColorTool, settings: SettingsStore, windows: WindowManager): Routes {
  return {
    'colors/state': () => ({ colors: store.colors(), kits: store.kits(), folders: store.folders(), format: tool.format() }),
    'colors/pick': () => {
      void tool.pick(windows.focusedNormal())
      return null
    },
    'colors/setFormat': ({ format }) => {
      const tools = settings.getTools()
      settings.setTools({ ...tools, colors: { ...tools.colors, format } })
      return null
    },
    'colors/setFavorite': ({ id, favorite }) => {
      store.setFavorite(id, favorite)
      return store.colors()
    },
    'colors/addFavorite': ({ hex, sourceUrl, sourceTitle }) => {
      const clean = normalizeHex(hex)
      if (clean) store.pick(clean, sourceUrl ? { url: sourceUrl, title: sourceTitle ?? sourceUrl } : null, true)
      return store.colors()
    },
    'colors/rename': ({ id, name }) => {
      store.rename(id, name)
      return store.colors()
    },
    'colors/remove': ({ id }) => {
      store.remove(id)
      return store.colors()
    },
    'colors/clearHistory': () => {
      store.clearHistory()
      return store.colors()
    },
    'colors/kit': ({ id }) => store.kit(id),
    'colors/updateKit': ({ id, ...patch }) => store.updateKit(id, patch),
    'colors/removeKit': ({ id }) => {
      store.removeKit(id)
      return null
    },
    'colors/createFolder': ({ name, emoji }) => {
      store.createFolder(name, emoji)
      return store.folders()
    },
    'colors/updateFolder': ({ id, name, emoji }) => {
      store.updateFolder(id, name, emoji)
      return store.folders()
    },
    'colors/removeFolder': ({ id }) => {
      store.removeFolder(id)
      return store.folders()
    }
  }
}
