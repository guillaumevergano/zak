import { expect, test } from '@playwright/test'
import { forceClose, launch, pageAt, visit } from './helpers'

test('the new tab page shows one of the sources ticked under its logo, at random', async () => {
  const { app, chrome } = await launch('newtab-headline')
  try {
    const open = async () => {
      await visit(chrome, 'zak://newtab')
      const page = await pageAt(app, 'zak://newtab')
      await page.getByTestId('newtab-headline').or(page.getByRole('heading', { name: 'Nouvel onglet' })).first().waitFor()
      return page
    }
    const settings = async () => {
      await visit(chrome, 'zak://settings')
      return pageAt(app, 'zak://settings')
    }
    const box = (page: Awaited<ReturnType<typeof settings>>, name: string) =>
      page.getByRole('group', { name: 'Sous le logo' }).getByRole('checkbox', { name, exact: true })

    // Zak's own words by default.
    let page = await open()
    await expect(page.getByTestId('newtab-headline')).toHaveAttribute('data-kind', 'zak')
    await expect(page.getByTestId('newtab-headline')).toContainText('Un peu d’espace.')

    // Quotes only: a quote, with its author.
    let s = await settings()
    await box(s, '« Un peu d’espace. »').uncheck()
    await box(s, 'Une citation').check()
    page = await open()
    await expect(page.getByTestId('newtab-headline')).toHaveAttribute('data-kind', 'quote')
    await expect(page.getByTestId('newtab-headline').locator('p')).toContainText('— ')

    // Quotes and proverbs: one or the other, at random, tab after tab.
    s = await settings()
    await box(s, 'Un proverbe').check()
    const kinds = new Set<string>()
    for (let i = 0; i < 12 && kinds.size < 2; i++) {
      page = await open()
      kinds.add((await page.getByTestId('newtab-headline').getAttribute('data-kind'))!)
    }
    expect([...kinds].sort()).toEqual(['proverb', 'quote'])

    // Own text only.
    s = await settings()
    await box(s, 'Une citation').uncheck()
    await box(s, 'Un proverbe').uncheck()
    await box(s, 'Mon texte').check()
    await s.getByRole('textbox', { name: 'Titre', exact: true }).fill('Bonjour.')
    await s.getByRole('textbox', { name: 'Sous-titre' }).fill('Belle journée.')
    await s.getByRole('textbox', { name: 'Titre', exact: true }).focus()
    page = await open()
    await expect(page.getByTestId('newtab-headline')).toContainText('Bonjour.')
    await expect(page.getByTestId('newtab-headline')).toContainText('Belle journée.')

    // Nothing ticked: nothing (the page keeps a title for screen readers).
    s = await settings()
    await box(s, 'Mon texte').uncheck()
    page = await open()
    await expect(page.getByTestId('newtab-headline')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nouvel onglet')
  } finally {
    await forceClose(app)
  }
})
