import { expect, test, type Page } from '@playwright/test'
import axe from 'axe-core'
import { launch, pageAt, visit } from './helpers'

interface Violation {
  id: string
  nodes: { target: string[] }[]
}

/** axe-core rules broken by `page` (injected over CDP: the internal pages' CSP allows no scripts). */
async function audit(page: Page): Promise<string[]> {
  await page.evaluate(axe.source)
  const result = (await page.evaluate(() =>
    (window as unknown as { axe: { run: (o: object) => Promise<unknown> } }).axe.run({ resultTypes: ['violations'] })
  )) as { violations: Violation[] }
  return result.violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`))
}

test('the chrome UI and the internal pages pass an accessibility audit', async () => {
  const { app, chrome } = await launch('a11y')
  expect(await audit(chrome)).toEqual([])
  for (const page of ['newtab', 'settings', 'history', 'passwords', 'extensions']) {
    await visit(chrome, `zak://${page}`)
    const internal = await pageAt(app, `zak://${page}`)
    // The page has rendered (and is the one asked: the omnibox navigates the same tab).
    await expect(internal.locator('#root > *').first()).toBeVisible()
    await internal.waitForTimeout(300)
    // The new tab page's pale subtitle (#C8A8A8) is a design choice (CLAUDE.md §7).
    const allowed = page === 'newtab' ? ['color-contrast p'] : []
    expect((await audit(internal)).filter((v) => !allowed.includes(v)), page).toEqual([])
  }
  await app.close()
})

test('tabs can be switched from the keyboard', async () => {
  const { app, chrome } = await launch('a11y-keys')
  await chrome.getByTestId('new-tab').click()
  await expect(chrome.getByTestId('tab')).toHaveCount(2)
  const tabs = chrome.getByRole('tab')
  // locator.press focuses the tab first: no dependence on which app has the OS focus.
  await tabs.nth(1).press('ArrowLeft')
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true')
  await expect(tabs.nth(0)).toBeFocused()
  await tabs.nth(0).press('End')
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  await app.close()
})
