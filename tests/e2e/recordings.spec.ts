import { mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { launch, serve, visit } from './helpers'

const overlayOf = (app: ElectronApplication): Page | undefined => app.windows().find((p) => p.url().includes('#overlay'))
const windowAt = (app: ElectronApplication, hash: string): Page | undefined => app.windows().find((p) => p.url().includes(hash))

/** A made-up Google: sign-in, token, Drive folder, resumable upload, sharing. */
async function fakeGoogle(): Promise<{ origin: string; close: () => void; uploaded: () => number; calls: string[] }> {
  let received = 0
  const calls: string[] = []
  const LINK = 'https://drive.google.com/file/d/file1/view'
  const { server, origin } = await serve((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    calls.push(`${req.method} ${url.pathname}`)
    const json = (status: number, body: unknown, headers: Record<string, string> = {}): void => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers })
      res.end(JSON.stringify(body))
    }
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      if (url.pathname === '/o/oauth2/v2/auth') {
        expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file')
        expect(url.searchParams.get('code_challenge_method')).toBe('S256')
        const back = new URL(url.searchParams.get('redirect_uri')!)
        back.searchParams.set('code', 'the-code')
        back.searchParams.set('state', url.searchParams.get('state')!)
        res.writeHead(302, { location: back.toString() }).end()
      } else if (url.pathname === '/token') {
        const form = new URLSearchParams(body.toString())
        expect(form.get('client_id')).toBe('test-client.apps.googleusercontent.com')
        json(200, { access_token: 'access', refresh_token: 'refresh', expires_in: 3600 })
      } else if (url.pathname === '/drive/v3/about') json(200, { user: { emailAddress: 'moi@exemple.fr' } })
      else if (url.pathname === '/drive/v3/files' && req.method === 'GET') json(200, { files: [] })
      else if (url.pathname === '/drive/v3/files' && req.method === 'POST') json(200, { id: 'folder1' })
      else if (url.pathname === '/upload/drive/v3/files') {
        expect(JSON.parse(body.toString())).toMatchObject({ parents: ['folder1'], mimeType: expect.stringMatching(/^video\//) })
        res.writeHead(200, { location: `${origin}/upload/session/1` }).end()
      } else if (url.pathname === '/upload/session/1') {
        const [, , end, total] = /bytes (\d+)-(\d+)\/(\d+)/.exec(req.headers['content-range'] ?? '') ?? []
        received += body.length
        if (Number(end) + 1 >= Number(total)) json(200, { id: 'file1', webViewLink: LINK })
        else res.writeHead(308, { range: `bytes=0-${end}` }).end()
      } else if (url.pathname === '/drive/v3/files/file1/permissions') json(200, { id: 'anyone' })
      else if (url.pathname === '/drive/v3/files/file1' && req.method === 'DELETE') res.writeHead(204).end()
      else if (url.pathname === '/revoke') json(200, {})
      else json(404, { error: { message: `unexpected ${req.method} ${url.pathname}` } })
    })
  })
  return { origin, close: () => server.close(), uploaded: () => received, calls }
}

test('a recording is shared through Google Drive: sign in, upload, link copied, unshared', async () => {
  const google = await fakeGoogle()
  const profile = mkdtempSync(join(tmpdir(), 'zak-e2e-recordings-'))
  const downloads = mkdtempSync(join(tmpdir(), 'zak-e2e-recordings-downloads-'))
  writeFileSync(
    join(profile, 'config.json'),
    JSON.stringify({ general: { downloadDir: downloads }, tools: { record: { driveClientId: 'test-client.apps.googleusercontent.com', driveClientSecret: 'secret' } } })
  )
  const { app, chrome } = await launch('recordings', profile, { ZAK_RECORD_FAKE: '1', ZAK_GOOGLE_API: google.origin })
  try {
    // Drive is connected on zak://recordings: the Google page opens in a tab, then closes.
    await visit(chrome, 'zak://recordings')
    await expect.poll(() => app.windows().some((p) => p.url() === 'zak://recordings/')).toBe(true)
    const library = app.windows().find((p) => p.url() === 'zak://recordings/')!
    await library.getByRole('button', { name: 'Connecter Google Drive' }).click()
    await expect(library.getByTestId('drive-status')).toContainText('Connecté à moi@exemple.fr', { timeout: 10_000 })
    await expect(chrome.getByTestId('tab')).toHaveCount(1, { timeout: 10_000 })

    // A recording without the camera.
    await chrome.getByTestId('tool-action-record').click()
    await expect.poll(() => overlayOf(app)?.getByTestId('record-setup').isVisible() ?? false).toBe(true)
    await overlayOf(app)!.getByRole('checkbox', { name: 'Caméra' }).uncheck()
    await overlayOf(app)!.getByRole('button', { name: 'Enregistrer' }).click()
    await expect.poll(() => !!windowAt(app, '#recorder-controls')).toBe(true)
    const controls = windowAt(app, '#recorder-controls')!
    await expect(controls.getByTestId('recorder-time')).toHaveText('0:02', { timeout: 10_000 })
    await controls.getByRole('button', { name: 'Arrêter et enregistrer' }).click()

    // « Partager un lien »: uploaded to the « Zak » folder, open to anyone with the link, copied.
    await expect.poll(() => overlayOf(app)?.getByTestId('recording-share').getAttribute('data-state') ?? null, { timeout: 10_000 }).toBe('none')
    await overlayOf(app)!.getByRole('button', { name: 'Partager un lien (Google Drive)' }).click()
    await expect(overlayOf(app)!.getByTestId('recording-share')).toHaveAttribute('data-state', 'done', { timeout: 10_000 })
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('https://drive.google.com/file/d/file1/view')
    const video = readdirSync(downloads).find((f) => /\.(mp4|webm)$/.test(f))!
    expect(google.uploaded()).toBe(statSync(join(downloads, video)).size)
    expect(google.calls).toContain('POST /drive/v3/files/file1/permissions')

    // The library shows it, shared; « Ne plus partager » removes the Drive copy.
    await library.reload()
    const card = library.getByTestId('recording')
    await expect(card).toHaveCount(1)
    await expect(card).toHaveAttribute('data-share', 'done')
    await expect(card).toContainText('0:0')
    await card.getByRole('button', { name: 'Ne plus partager' }).click()
    await expect(card).toHaveAttribute('data-share', 'none')
    expect(google.calls).toContain('DELETE /drive/v3/files/file1')

    // Disconnected: Zak forgets the account and tells Google.
    await library.getByRole('button', { name: 'Déconnecter' }).click()
    await expect(library.getByRole('button', { name: 'Connecter Google Drive' })).toBeVisible()
    expect(google.calls).toContain('POST /revoke')
  } finally {
    await app.close()
    google.close()
  }
})
