import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { firstChrome, forceClose } from './helpers'

const root = join(__dirname, '../..')
const electronPath = require('electron') as unknown as string

let app: ElectronApplication
let chrome: Page

test.beforeAll(async () => {
  // Fresh profile: an empty favorites database.
  const profile = mkdtempSync(join(tmpdir(), 'zak-e2e-sidebar-'))
  app = await electron.launch({
    executablePath: electronPath,
    args: [root],
    env: { ...process.env, ZAK_USER_DATA: profile, ZAK_LANG: 'fr', ZAK_E2E: '1' }
  })
  chrome = await firstChrome(app)
  await expect(chrome.getByTestId('tab')).toHaveCount(1)
})

test.afterAll(async () => {
  if (app) await forceClose(app)
})

/** The transparent view that hosts popovers above the page. */
async function overlay(): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().endsWith('#overlay'))).toBe(true)
  return app.windows().find((p) => p.url().endsWith('#overlay'))!
}

test('add a favorite with the star, create a folder, move the favorite into it', async () => {
  const sidebar = chrome.getByTestId('sidebar')
  const before = 0
  await expect(sidebar.getByTestId('favorite')).toHaveCount(0)

  // Open a page and save it with ★.
  const omnibox = chrome.getByTestId('omnibox')
  await chrome.getByTestId('new-tab').click()
  await omnibox.fill('https://example.com/')
  await omnibox.press('Enter')
  await expect(chrome.getByTestId('tab').last()).toHaveAttribute('title', 'Example Domain')
  await chrome.getByTestId('favorite-star').click()

  const pop = await overlay()
  const editor = pop.getByTestId('favorite-editor')
  await expect(editor).toBeVisible()
  await expect(pop.getByTestId('favorite-title')).toHaveValue('Example Domain')
  await editor.getByRole('button', { name: 'Ajouter' }).click()
  await expect(sidebar.getByTestId('favorite')).toHaveCount(before + 1)
  // Its tile is the highlighted one, and the star is now filled (edit mode).
  const tile = sidebar.getByRole('button', { name: 'Example Domain' })
  await expect(tile).toBeVisible()
  await expect(chrome.getByTestId('favorite-star')).toHaveAttribute('title', 'Modifier le favori')

  // New folder.
  const folderName = `Dossier ${Date.now()}`
  await chrome.getByTestId('new-folder').click()
  await pop.getByTestId('folder-name').fill(folderName)
  await pop.getByTestId('folder-editor').getByRole('button', { name: 'Créer' }).click()
  const folder = sidebar.getByTestId('folder').filter({ hasText: folderName })
  await expect(folder).toBeVisible()

  // Edit the favorite through ★ and move it into the folder.
  await chrome.getByTestId('favorite-star').click()
  await pop.getByTestId('favorite-editor').getByRole('combobox').selectOption({ label: `📁 ${folderName}` })
  await pop.getByTestId('favorite-editor').getByRole('button', { name: 'Enregistrer' }).click()
  await expect(folder.getByRole('button', { name: 'Example Domain' })).toBeVisible()

  // Delete it from the editor.
  await chrome.getByTestId('favorite-star').click()
  await pop.getByTestId('favorite-editor').getByRole('button', { name: 'Supprimer' }).click()
  await expect(sidebar.getByTestId('favorite')).toHaveCount(before)
  await expect(chrome.getByTestId('favorite-star')).toHaveAttribute('title', 'Ajouter aux favoris de la barre latérale')
})

/** Drags with the mouse in small steps, like a person (dnd-kit needs a 6 px move to start). */
async function drag(from: ReturnType<Page['locator']>, to: ReturnType<Page['locator']>): Promise<void> {
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await chrome.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await chrome.mouse.down()
  await chrome.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 4 })
  await chrome.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  await chrome.mouse.up()
}

test('drag favorites into an empty folder and onto a folder title', async () => {
  const sidebar = chrome.getByTestId('sidebar')
  await chrome.evaluate(async () => {
    const api = window.zak
    await api.invoke('favorites:add', { title: 'Un', url: 'https://un.test/', emoji: '1️⃣', folderId: null })
    await api.invoke('favorites:add', { title: 'Deux', url: 'https://deux.test/', emoji: '2️⃣', folderId: null })
    await api.invoke('folders:add', { name: 'Cible', emoji: '🎯' })
  })
  const folder = sidebar.getByTestId('folder').filter({ hasText: 'Cible' })
  await expect(folder).toContainText('Glisse un favori ou un onglet ici')

  // Onto the empty folder's drop zone.
  await drag(sidebar.getByRole('button', { name: 'Un', exact: true }), folder.getByTestId('mosaic'))
  await expect(folder.getByRole('button', { name: 'Un', exact: true })).toBeVisible()

  // Onto the folder's title.
  await drag(sidebar.getByRole('button', { name: 'Deux', exact: true }), folder.getByRole('button', { name: /Cible/ }))
  await expect(folder.getByRole('button', { name: 'Deux', exact: true })).toBeVisible()
})
