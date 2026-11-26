import { expect, test } from '@playwright/test'
import { clickMenu, forceClose, launch } from './helpers'

// Keyboard focus between windows and pages needs a window really in front, and macOS only
// gives it to an app the user isn't working away from: this test alone brings Zak forward (the
// others run in quiet mode, src/main/windows/quietMode.ts). Run it on purpose, hands off:
// ZAK_E2E_FOREGROUND=1 npx playwright test focus
test.skip(process.env['ZAK_E2E_FOREGROUND'] !== '1', 'needs the window in front: ZAK_E2E_FOREGROUND=1')

test('a new tab keeps the focus in the omnibox while its page loads', async () => {
  const { app, chrome } = await launch('focus')
  try {
    // Start from a focused page: the new tab page used to take the focus back once loaded.
    const omnibox = chrome.getByTestId('omnibox')
    await omnibox.fill('data:text/html,<title>Focus</title><h1>Focus</h1>')
    await omnibox.press('Enter')
    await expect(chrome.getByTestId('tab').last()).toHaveAttribute('title', 'Focus')
    const focusedUrl = (): Promise<string | undefined> =>
      app.evaluate(({ webContents }) => webContents.getFocusedWebContents()?.getURL())
    await expect.poll(focusedUrl).toContain('Focus')
    await clickMenu(app, 'Nouvel onglet')
    await expect(chrome.getByTestId('tab').last()).toHaveAttribute('title', 'Nouvel onglet')
    await new Promise((r) => setTimeout(r, 1000))
    expect(await focusedUrl()).not.toMatch(/^zak:|^data:/)
    await expect(omnibox).toBeFocused()
  } finally {
    await forceClose(app)
  }
})
