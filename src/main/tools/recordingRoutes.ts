import type { InternalApiRoutes } from '@shared/ipc'
import type { GoogleDrive } from '../drive/GoogleDrive'
import type { SettingsStore } from '../store/settings'
import type { WindowManager } from '../windows/WindowManager'
import type { Recordings } from './Recordings'
import type { RecordTool } from './RecordTool'

type Routes = {
  [R in keyof InternalApiRoutes as R extends `recordings/${string}` ? R : never]: (
    body: InternalApiRoutes[R]['body']
  ) => InternalApiRoutes[R]['result'] | Promise<InternalApiRoutes[R]['result']>
}

/** zak://recordings (CLAUDE.md §6.8): the screen recordings and Google Drive sharing. */
export function recordingRoutes(recordings: Recordings, drive: GoogleDrive, settings: SettingsStore, windows: WindowManager, recorder: RecordTool): Routes {
  return {
    'recordings/state': () => recordings.page(),
    'recordings/share': ({ id }) => {
      void recordings.share(id)
      return null
    },
    'recordings/copyLink': ({ id }) => {
      recordings.copyLink(id)
      return null
    },
    'recordings/reveal': ({ id }) => {
      recordings.reveal(id)
      return null
    },
    'recordings/play': async ({ id }) => {
      await recordings.play(id)
      return null
    },
    'recordings/remove': async ({ id, fromDrive }) => {
      await recordings.remove(id, fromDrive)
      return null
    },
    'recordings/unshare': async ({ id }) => {
      await recordings.unshare(id)
      return null
    },
    'recordings/connect': async () => {
      await recordings.connect()
      return drive.status()
    },
    'recordings/disconnect': () => drive.disconnect(),
    'recordings/setOptions': (patch) => {
      const tools = settings.getTools()
      settings.setTools({ ...tools, record: { ...tools.record, ...patch } })
      return recordings.page()
    },
    'recordings/record': () => {
      recorder.start(windows.focusedNormal())
      return null
    }
  }
}
