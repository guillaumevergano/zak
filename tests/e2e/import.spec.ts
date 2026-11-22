import { expect, test } from '@playwright/test'
import { launch, pageAt, visit } from './helpers'
import { fakeChromeHome } from '../fixtures/chromeProfile'

test('favorites and history are imported from another browser on this computer', async () => {
  const home = fakeChromeHome(process.platform === 'win32' ? 'win32' : 'darwin')
  const { app, chrome } = await launch('import', undefined, { ZAK_IMPORT_HOME: home })
  await visit(chrome, 'zak://settings')
  const settings = await pageAt(app, 'zak://settings')
  await expect(settings.getByRole('combobox', { name: 'Navigateur à importer' })).toHaveValue(/Default$/)
  await settings.getByRole('button', { name: 'Importer', exact: true }).click()
  await expect(settings.getByText('Importé : 4 favoris, 2 dossiers, 1 page d\'historique.')).toBeVisible()

  // In the sidebar: Gmail at the root, the folders below.
  await expect(chrome.locator('[data-testid="favorite"][title="Gmail"], [data-testid="favorite"]:has-text("Gmail")')).toHaveCount(1)
  await expect(chrome.getByText('Travail')).toBeVisible()
  await expect(chrome.getByText('Autres favoris')).toBeVisible()

  // In the history page.
  await visit(chrome, 'zak://history')
  const history = await pageAt(app, 'zak://history')
  await expect(history.getByText('Example', { exact: true }).first()).toBeVisible()
  await app.close()
})
