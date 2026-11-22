import { expect, test } from '@playwright/test'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, pageAt, visit } from './helpers'

const examples = join(__dirname, '../../docs/customize/mods')

test('mods change the theme and the new tab page, and update as their files change', async () => {
  const { app, chrome, profile } = await launch('mods')
  // Installing a mod = copying its folder into the mods folder.
  cpSync(join(examples, 'nuit-bleue'), join(profile, 'mods', 'nuit-bleue'), { recursive: true })
  cpSync(join(examples, 'accueil-minimal'), join(profile, 'mods', 'accueil-minimal'), { recursive: true })

  await visit(chrome, 'zak://settings')
  const settings = await pageAt(app, 'zak://settings')
  const theme = settings.getByRole('combobox', { name: 'Thème de Zak' })
  // The folder is watched; the settings page reads it when it opens (or gets the focus).
  await expect.poll(async () => {
    await settings.reload()
    return theme.locator('option').count()
  }).toBe(2)
  await theme.selectOption('nuit-bleue')

  // The browser's interface takes the theme's colors.
  const frame = (): Promise<string> => chrome.evaluate(() => getComputedStyle(document.body).getPropertyValue('--color-frame').trim())
  await expect.poll(frame).toBe('#14213d')

  // Edited (by hand or by an agent): applied at once.
  const css = join(profile, 'mods', 'nuit-bleue', 'theme.css')
  writeFileSync(css, readFileSync(css, 'utf8').replace('#14213d', '#000080'))
  await expect.poll(frame).toBe('#000080')

  // The new tab page of the other mod.
  await settings.getByRole('combobox', { name: 'Page Nouvel onglet' }).selectOption('accueil-minimal')
  await chrome.getByTestId('new-tab').click()
  const newtab = app.windows().find((p) => p.url().startsWith('zak://newtab') && p !== settings)
  await expect.poll(() => app.windows().filter((p) => p.url().startsWith('zak://newtab')).length).toBeGreaterThan(0)
  const page = app.windows().filter((p) => p.url().startsWith('zak://newtab')).pop()!
  void newtab
  await expect(page.locator('#time')).not.toBeEmpty()
  // Sandboxed: no network from a new tab mod.
  const reached = await page.evaluate(() => fetch('https://example.com/').then(() => true, () => false))
  expect(reached).toBe(false)

  // Back to Zak's own.
  await settings.getByRole('combobox', { name: 'Thème de Zak' }).selectOption('')
  await expect.poll(frame).toBe('#2e1f2d')
  await app.close()
})
