import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { activeTabTitle, forceClose, launch, pageAt, visit } from './helpers'

test('the sidebar goes left or right, and the tabs into it, from the settings page', async () => {
  let { app, chrome, profile } = await launch('sidebar-layout')
  try {
    await visit(chrome, 'zak://settings')
    const settings = await pageAt(app, 'zak://settings')
    const left = (testId: string): Promise<number> => chrome.getByTestId(testId).evaluate((el) => el.getBoundingClientRect().left)

    // Left: the sidebar before the page; the scroll gutter stays on the page's right.
    expect(await left('sidebar')).toBeGreaterThan(await left('page-gutter'))
    await settings.getByRole('combobox', { name: 'Position de la barre latérale' }).selectOption('left')
    await expect.poll(() => left('sidebar')).toBe(0)
    expect(await left('page-gutter')).toBeGreaterThan(await chrome.getByTestId('sidebar').evaluate((el) => el.getBoundingClientRect().right))

    // Tabs in the sidebar: a title bar instead of the strip, one row per tab.
    await settings.getByRole('combobox', { name: 'Position des onglets' }).selectOption('sidebar')
    const tabs = chrome.getByTestId('sidebar-tabs')
    await expect(chrome.getByTestId('title-bar')).toHaveText('Réglages')
    await expect(tabs.getByTestId('tab')).toHaveCount(1)
    await tabs.getByTestId('new-tab').click()
    await expect(tabs.getByTestId('tab')).toHaveCount(2)
    await tabs.getByTestId('tab').filter({ hasText: 'Réglages' }).click()
    await expect.poll(() => activeTabTitle(chrome)).toBe('Réglages')
    await expect(chrome.getByTestId('title-bar')).toHaveText('Réglages')

    // Drag a row onto the middle of another: side by side (split view), as from the strip.
    const rows = tabs.getByTestId('tab')
    const a = (await rows.nth(1).boundingBox())!
    const b = (await rows.nth(0).boundingBox())!
    await chrome.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await chrome.mouse.down()
    await chrome.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 8, { steps: 4 })
    await chrome.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await chrome.mouse.up()
    await expect(tabs.getByTestId('split-tab')).toBeVisible()

    // Saved in the settings file (also editable by hand, docs/customize/).
    const saved = JSON.parse(readFileSync(join(profile, 'config.json'), 'utf8')).sidebar
    expect(saved).toMatchObject({ side: 'left', tabs: 'sidebar' })
  } finally {
    await forceClose(app)
  }

  // Next launch: same layout.
  ;({ app, chrome } = await launch('sidebar-layout', profile))
  try {
    await expect(chrome.getByTestId('sidebar-tabs')).toBeVisible()
    await expect.poll(() => chrome.getByTestId('sidebar').evaluate((el) => el.getBoundingClientRect().left)).toBe(0)
  } finally {
    await forceClose(app)
  }
})
