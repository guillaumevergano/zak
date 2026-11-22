import { expect, test } from '@playwright/test'
import { activeTabTitle, launch, pageAt, serve, visit } from './helpers'

const LOGIN = `<title>Connexion</title>
<form action="/welcome" method="post">
  <input name="email" type="email" autocomplete="username">
  <input name="password" type="password">
  <button>Se connecter</button>
</form>`

test('a login is offered for saving, then listed under the field and filled on click', async () => {
  const { server, origin } = await serve((req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(req.url === '/welcome' ? '<title>Bienvenue</title>' : LOGIN)
  })
  const { app, chrome } = await launch('passwords')
  const tabPage = async (title: string) => {
    await expect.poll(() => activeTabTitle(chrome)).toBe(title)
    return app.windows().find((p) => p.url().startsWith(origin))!
  }

  // Log in: Zak offers to save.
  await visit(chrome, `${origin}/login`)
  let page = await tabPage('Connexion')
  await page.locator('input[type=email]').fill('ana@site.test')
  await page.locator('input[type=password]').fill('s3cret!')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await tabPage('Bienvenue')
  // The prompt is drawn by the overlay view (same bundle as the chrome UI, #overlay).
  await expect
    .poll(async () => {
      const overlay = app.windows().find((p) => p.url().includes('#overlay'))
      return overlay ? overlay.getByTestId('save-password-prompt').count() : 0
    })
    .toBe(1)
  const withPrompt = app.windows().find((p) => p.url().includes('#overlay'))!
  await expect(withPrompt.getByTestId('save-password-prompt')).toContainText('ana@site.test')
  await withPrompt.getByRole('button', { name: 'Enregistrer' }).click()

  // Back on the login page: the saved login is listed under the field, and fills it on click.
  await visit(chrome, `${origin}/login`)
  page = await tabPage('Connexion')
  await page.locator('input[type=email]').click()
  const option = page.locator('zak-passwords')
  await expect(option).toHaveCount(1)
  // Closed shadow root: click where the first login is (under the field).
  const box = (await page.locator('input[type=email]').boundingBox())!
  await page.mouse.click(box.x + 40, box.y + box.height + 4 + 34)
  await expect(page.locator('input[type=email]')).toHaveValue('ana@site.test')
  await expect(page.locator('input[type=password]')).toHaveValue('s3cret!')

  // Listed on zak://passwords, password hidden until asked.
  await visit(chrome, 'zak://passwords')
  const passwords = await pageAt(app, 'zak://passwords')
  const row = passwords.getByTestId('password-row')
  await expect(row).toContainText('127.0.0.1')
  await expect(row).toContainText('ana@site.test')
  await expect(row.getByTestId('password-value')).toHaveText('••••••••')
  await row.getByRole('button', { name: 'Afficher' }).click()
  await expect(row.getByTestId('password-value')).toHaveText('s3cret!')

  await app.close()
  server.close()
})
