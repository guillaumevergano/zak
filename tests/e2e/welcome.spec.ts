import { expect, test } from '@playwright/test'
import { activeTabTitle, launch, pageAt } from './helpers'
import { fakeChromeHome } from '../fixtures/chromeProfile'

test('the first launch opens the welcome page, which imports from another browser', async () => {
  const { app, chrome } = await launch('welcome', undefined, { ZAK_ONBOARDING: '1', ZAK_IMPORT_HOME: fakeChromeHome() })
  const welcome = await pageAt(app, 'zak://welcome')
  await expect(welcome.getByRole('heading', { name: 'Bienvenue dans Zak.' })).toBeVisible()
  await welcome.getByRole('button', { name: 'Importer' }).click()
  await expect(welcome.getByRole('status')).toContainText('4 favoris et 1 page d’historique importés.')
  await welcome.getByRole('link', { name: 'Commencer' }).click()
  await expect.poll(() => activeTabTitle(chrome)).toBe('Nouvel onglet')
  await app.close()
})

test('the interface speaks English when asked', async () => {
  const { app, chrome } = await launch('english', undefined, { ZAK_LANG: 'en' })
  await expect.poll(() => activeTabTitle(chrome)).toBe('New tab')
  const menus = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.map((i) => i.label))
  expect(menus).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'History', 'Tabs', 'Window', 'Help']))
  const newtab = await pageAt(app, 'zak://newtab')
  await expect(newtab.locator('html')).toHaveAttribute('lang', 'en')
  await app.close()
})
