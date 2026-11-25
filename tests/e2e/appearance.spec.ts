import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { forceClose, launch, pageAt, visit } from './helpers'

test('zak://appearance changes the window’s colors and fonts as you go, and keeps them', async () => {
  let { app, chrome, profile } = await launch('appearance')
  const sidebarColor = (): Promise<string> => chrome.getByTestId('sidebar').evaluate((el) => getComputedStyle(el).backgroundColor)
  const chromeFont = (): Promise<string> => chrome.evaluate(() => getComputedStyle(document.body).fontFamily)
  try {
    // From the settings page.
    await visit(chrome, 'zak://settings')
    const settings = await pageAt(app, 'zak://settings')
    await settings.getByTestId('open-appearance').click()
    const page = await pageAt(app, 'zak://appearance')
    await expect(page.getByRole('heading', { name: 'Apparence', level: 1 })).toBeVisible()
    expect(await sidebarColor()).toBe('rgb(46, 31, 45)')

    // A color typed in: the sidebar around the page changes at once.
    const frame = page.getByRole('textbox', { name: 'Cadre, code hexadécimal' })
    await frame.fill('#14213d')
    await frame.press('Enter')
    await expect.poll(sidebarColor).toBe('rgb(20, 33, 61)')
    await expect(page.getByTestId('color-row').filter({ hasText: 'Cadre' }).first()).toContainText('modifiée')

    // A font: the interface uses it (the page itself too).
    await page.getByRole('combobox', { name: 'Police : Interface' }).selectOption('Verdana')
    await expect.poll(chromeFont).toContain('Verdana')
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Verdana')

    // Saved in the settings file.
    await expect
      .poll(() => JSON.parse(readFileSync(join(profile, 'config.json'), 'utf8')).appearance)
      .toEqual({ colors: { light: { frame: '#14213d' }, dark: {} }, fonts: { ui: 'Verdana', display: null, mono: null } })
  } finally {
    await forceClose(app)
  }

  // Next launch: still there; « Tout rétablir » brings Zak's own look back.
  ;({ app, chrome } = await launch('appearance', profile))
  try {
    await expect.poll(sidebarColor).toBe('rgb(20, 33, 61)')
    await visit(chrome, 'zak://appearance')
    const page = await pageAt(app, 'zak://appearance')
    await page.getByRole('button', { name: 'Tout rétablir' }).click()
    await expect.poll(sidebarColor).toBe('rgb(46, 31, 45)')
    await expect.poll(chromeFont).toContain('DM Sans')
  } finally {
    await forceClose(app)
  }
})
