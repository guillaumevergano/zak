import { t } from '@shared/i18n'
import { readFile, writeFile } from 'node:fs/promises'
import { dialog, safeStorage, systemPreferences } from 'electron'
import type { InternalApiRoutes } from '@shared/ipc'
import { parseLoginsCsv, toLoginsCsv } from './csv'
import { loginOrigin, type Cipher, type PasswordStore } from './PasswordStore'

/** The OS keychain (macOS Keychain, Windows DPAPI, libsecret on Linux) through safeStorage. */
export const keychainCipher: Cipher = {
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (data) => safeStorage.decryptString(data)
}

/** Asking again for each password would be tiresome: an unlock lasts a minute, like Chrome. */
const UNLOCK_MS = 60_000
let unlockedUntil = 0

/** Touch ID (macOS) before showing or exporting passwords; elsewhere the session is trusted. */
async function unlock(reason: string): Promise<boolean> {
  if (Date.now() < unlockedUntil) return true
  // e2e tests (ZAK_E2E) can't touch the sensor.
  if (process.platform === 'darwin' && process.env['ZAK_E2E'] !== '1' && systemPreferences.canPromptTouchID()) {
    try {
      await systemPreferences.promptTouchID(reason)
    } catch {
      return false
    }
  }
  unlockedUntil = Date.now() + UNLOCK_MS
  return true
}

type Routes = {
  [R in keyof InternalApiRoutes as R extends `passwords/${string}` ? R : never]: (
    body: InternalApiRoutes[R]['body']
  ) => InternalApiRoutes[R]['result'] | Promise<InternalApiRoutes[R]['result']>
}

/** zak://passwords. */
export function passwordRoutes(store: PasswordStore): Routes {
  return {
    'passwords/list': () => store.list(),
    'passwords/reveal': async ({ id }) => ((await unlock(t('afficher un mot de passe enregistré'))) ? store.password(id) : null),
    'passwords/add': ({ url, username, password }) => {
      const origin = loginOrigin(/^https?:\/\//i.test(url) ? url : `https://${url}`)
      if (!origin || password === '') throw new Error(t('Adresse ou mot de passe manquant'))
      store.save(origin, username.trim(), password)
      return store.list()
    },
    'passwords/update': ({ id, username, password }) => {
      store.update(id, { username: username?.trim(), password })
      return store.list()
    },
    'passwords/remove': ({ id }) => {
      store.remove(id)
      return store.list()
    },
    'passwords/import': async () => {
      const result = await dialog.showOpenDialog({
        title: t('Importer des mots de passe'),
        properties: ['openFile'],
        filters: [{ name: t('Mots de passe (CSV)'), extensions: ['csv'] }]
      })
      if (result.canceled || !result.filePaths[0]) return null
      return { count: store.importLogins(parseLoginsCsv(await readFile(result.filePaths[0], 'utf8'))) }
    },
    'passwords/export': async () => {
      if (!(await unlock(t('exporter vos mots de passe')))) return null
      const result = await dialog.showSaveDialog({
        title: t('Exporter les mots de passe'),
        defaultPath: t('Mots de passe Zak.csv'),
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (result.canceled || !result.filePath) return null
      const logins = store.exportLogins()
      await writeFile(result.filePath, toLoginsCsv(logins), { mode: 0o600 })
      return { count: logins.length }
    }
  }
}
