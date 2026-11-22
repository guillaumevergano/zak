import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { firstChrome, launch, pageAt, visit } from './helpers'

const root = join(__dirname, '../..')
const electronPath = require('electron') as unknown as string

test('a new profile is created from the settings and opens as a separate Zak', async () => {
  const profilesDir = mkdtempSync(join(tmpdir(), 'zak-e2e-profiles-'))
  const { app, chrome } = await launch('profiles', undefined, { ZAK_PROFILES_DIR: profilesDir })
  await visit(chrome, 'zak://settings#profiles')
  const settings = await pageAt(app, 'zak://settings')
  await expect(settings.getByTestId('profile-row')).toHaveCount(1)
  await settings.getByRole('textbox', { name: 'Nom du nouveau profil' }).fill('Travail')
  await settings.getByRole('button', { name: 'Créer et ouvrir' }).click()
  await expect(settings.getByTestId('profile-row')).toHaveCount(2)
  const opened = await app.evaluate(() => (globalThis as { zakOpenedProfiles?: string[] }).zakOpenedProfiles)
  expect(opened).toHaveLength(1)
  // The menu lists both.
  const menu = await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()!.items.find((i) => i.label === 'Fichier')!.submenu!.items.find((i) => i.label === 'Profils')!.submenu!.items.map((i) => i.label)
  )
  expect(menu).toEqual(['🏠 Perso', '💼 Travail', '', 'Gérer les profils…'])
  await app.close()

  // What « Ouvrir » launches: Zak on the profile's own folder, which says which profile it is.
  const work = await electron.launch({
    executablePath: electronPath,
    args: [root, `--zak-profile=${opened![0]}`],
    env: { ...process.env, ZAK_PROFILES_DIR: profilesDir, ZAK_LANG: 'fr', ZAK_E2E: '1' }
  })
  try {
    const workChrome = await firstChrome(work)
    await expect(workChrome.getByTestId('profile-badge')).toHaveText('💼 Travail')
    expect(await work.evaluate(({ app: a }) => a.getPath('userData'))).toBe(join(profilesDir, opened![0]!))
  } finally {
    // Closed even on failure: a stuck app makes the worker's teardown time out (and fails the run).
    await work.close().catch(() => {})
  }
})
