import { t } from '@shared/i18n'
import { createHash, randomBytes } from 'node:crypto'
import { open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import type { DriveStatus } from '@shared/recordings'

/**
 * The user's own Google Drive (CLAUDE.md §6.8), to share screen recordings by a link.
 *
 * - Sign-in: OAuth for installed apps (PKCE, redirect to a one-off server on 127.0.0.1), the Google
 *   page in a Zak tab. Scope `drive.file`: Zak only sees the files it created, nothing else of the
 *   Drive. The refresh token is kept encrypted by the system keychain (safeStorage).
 * - Upload: resumable, by pieces (a long video survives a network hiccup), into a « Zak » folder;
 *   then « anyone with the link can view » when asked.
 *
 * E2E tests point every Google address at a local fake (ZAK_GOOGLE_API).
 */

const FAKE_API = process.env['ZAK_E2E'] === '1' ? process.env['ZAK_GOOGLE_API'] : undefined
const AUTH_URL = FAKE_API ? `${FAKE_API}/o/oauth2/v2/auth` : 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = FAKE_API ? `${FAKE_API}/token` : 'https://oauth2.googleapis.com/token'
const REVOKE_URL = FAKE_API ? `${FAKE_API}/revoke` : 'https://oauth2.googleapis.com/revoke'
const API = FAKE_API ? `${FAKE_API}/drive/v3` : 'https://www.googleapis.com/drive/v3'
const UPLOAD = FAKE_API ? `${FAKE_API}/upload/drive/v3` : 'https://www.googleapis.com/upload/drive/v3'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
/** Pieces of the upload: a multiple of 256 KiB, as Drive asks. */
const CHUNK = 8 * 1024 * 1024
const SIGN_IN_TIMEOUT = 5 * 60_000

/** Built into release builds (MAIN_VITE_GOOGLE_CLIENT_ID / _SECRET at build time, see docs/DRIVE.md). */
const BUILT_IN = {
  id: import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID ?? '',
  secret: import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? ''
}

interface Saved {
  refreshToken: string
  email: string | null
  folderId: string | null
  /** The client it was given to: another client's token is no use. */
  clientId: string
}

export interface DriveClient {
  id: string
  secret: string
}

/** A tab showing the Google page, closed once the answer came. */
export type OpenSignInPage = (url: string) => { close: () => void }

export class GoogleDrive {
  private saved: Saved | null | undefined = undefined
  private access: { token: string; until: number } | null = null
  private signIn: { server: Server; done: Promise<DriveStatus> } | null = null

  constructor(
    private readonly dir: string,
    /** The client pasted on zak://recordings, if any (else the built-in one). */
    private readonly ownClient: () => DriveClient
  ) {}

  private get file(): string {
    return join(this.dir, 'google-drive.bin')
  }

  client(): DriveClient | null {
    const own = this.ownClient()
    if (own.id) return own
    return BUILT_IN.id ? BUILT_IN : null
  }

  async status(): Promise<DriveStatus> {
    const saved = await this.load()
    const client = this.client()
    return {
      configured: !!client,
      ownClient: !!this.ownClient().id,
      connected: !!saved && !!client && saved.clientId === client.id,
      email: saved?.email ?? null
    }
  }

  /** Signs in (the Google page in a Zak tab); resolves once Zak has its token, or the user gave up. */
  async connect(openPage: OpenSignInPage): Promise<DriveStatus> {
    if (this.signIn) return this.signIn.done
    const client = this.client()
    if (!client) throw new Error(t('Aucun identifiant client Google n’est configuré.'))
    const verifier = randomBytes(48).toString('base64url')
    const state = randomBytes(16).toString('base64url')
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const redirect = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const url = new URL(AUTH_URL)
    url.search = new URLSearchParams({
      client_id: client.id,
      redirect_uri: redirect,
      response_type: 'code',
      scope: SCOPE,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state,
      // A refresh token every time (and the account chooser).
      access_type: 'offline',
      prompt: 'consent select_account'
    }).toString()

    let page: { close: () => void } | null = null
    const done = new Promise<DriveStatus>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error(t('La connexion à Google Drive a expiré.'))), SIGN_IN_TIMEOUT)
      const finish = (error: Error | null): void => {
        clearTimeout(timer)
        server.close()
        this.signIn = null
        // The page says it worked a moment, then its tab goes.
        setTimeout(() => page?.close(), error ? 4000 : 1500)
        if (error) reject(error)
        else void this.status().then(resolve, reject)
      }
      server.on('request', (req, res) => {
        const answer = new URL(req.url ?? '/', redirect)
        if (answer.pathname !== '/') {
          res.writeHead(404).end()
          return
        }
        const reply = (ok: boolean, text: string): void => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(
            `<!doctype html><meta charset="utf-8"><title>Zak</title><body style="font:16px system-ui;display:grid;place-items:center;height:90vh;margin:0;background:#F3EDEA;color:#2A1A26"><p>${ok ? '✓' : '✕'} ${escapeHtml(text)}</p></body>`
          )
        }
        if (answer.searchParams.get('state') !== state) {
          reply(false, t('Réponse inattendue : recommencez depuis Zak.'))
          return
        }
        const code = answer.searchParams.get('code')
        if (!code) {
          reply(false, t('Connexion annulée.'))
          finish(new Error(t('Connexion annulée.')))
          return
        }
        void this.exchange(client, code, verifier, redirect)
          .then(() => {
            reply(true, t('Zak est connecté à votre Google Drive. Vous pouvez fermer cet onglet.'))
            finish(null)
          })
          .catch((err: unknown) => {
            reply(false, t('La connexion a échoué.'))
            finish(err instanceof Error ? err : new Error(String(err)))
          })
      })
    })
    this.signIn = { server, done }
    page = openPage(url.toString())
    return done
  }

  /** Forgets the account (and tells Google the token is no longer wanted). */
  async disconnect(): Promise<DriveStatus> {
    const saved = await this.load()
    this.saved = null
    this.access = null
    await rm(this.file, { force: true })
    if (saved) await fetch(`${REVOKE_URL}?token=${encodeURIComponent(saved.refreshToken)}`, { method: 'POST' }).catch(() => {})
    return this.status()
  }

  /**
   * Uploads a file into the « Zak » folder; `publicLink`: anyone with the link can watch. Returns
   * the file's id and its link.
   */
  async upload(path: string, name: string, mimeType: string, publicLink: boolean, onProgress: (fraction: number) => void): Promise<{ id: string; link: string }> {
    const folder = await this.folder()
    const size = (await stat(path)).size
    const start = await this.api(`${UPLOAD}/files?uploadType=resumable&fields=id,webViewLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(size) },
      body: JSON.stringify({ name, mimeType, parents: [folder] })
    })
    const session = start.headers.get('location')
    if (!session) throw new Error(t('Google Drive n’a pas accepté l’envoi.'))

    const handle = await open(path, 'r')
    let file: { id: string; webViewLink?: string } | null = null
    try {
      let offset = 0
      onProgress(0)
      while (!file) {
        const length = Math.min(CHUNK, size - offset)
        const buffer = Buffer.alloc(length)
        await handle.read(buffer, 0, length, offset)
        const res = await this.put(session, buffer, offset, size)
        if (res.status === 200 || res.status === 201) file = (await res.json()) as { id: string; webViewLink?: string }
        else if (res.status === 308) {
          // What Drive has so far (it may have kept less than sent).
          const range = /bytes=0-(\d+)/.exec(res.headers.get('range') ?? '')
          offset = range ? Number(range[1]) + 1 : offset
          onProgress(size ? offset / size : 1)
        } else throw new Error(`${t('Envoi interrompu')} (${res.status})`)
      }
    } finally {
      await handle.close()
    }
    if (publicLink) {
      await this.api(`${API}/files/${encodeURIComponent(file.id)}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      })
    }
    onProgress(1)
    return { id: file.id, link: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view` }
  }

  /** Sends one piece, again a few times when the network hiccups. */
  private async put(session: string, buffer: Buffer, offset: number, size: number): Promise<Response> {
    let lastError: unknown = null
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(session, {
          method: 'PUT',
          // 308 here means « go on », not a redirect.
          redirect: 'manual',
          headers: {
            Authorization: `Bearer ${await this.token()}`,
            'Content-Range': buffer.length ? `bytes ${offset}-${offset + buffer.length - 1}/${size}` : `bytes */${size}`
          },
          body: new Uint8Array(buffer)
        })
        if (res.status < 500) return res
        lastError = new Error(String(res.status))
      } catch (err) {
        lastError = err
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
    }
    throw lastError instanceof Error ? lastError : new Error(t('Envoi interrompu'))
  }

  /** Removes a file Zak put on the Drive (gone already: fine). */
  async remove(fileId: string): Promise<void> {
    const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${await this.token()}` } })
    if (!res.ok && res.status !== 404) throw new Error(`Drive ${res.status}`)
  }

  /** The « Zak » folder of the Drive (made once; Zak only sees what it made). */
  private async folder(): Promise<string> {
    const saved = await this.requireSaved()
    if (saved.folderId) {
      const res = await fetch(`${API}/files/${encodeURIComponent(saved.folderId)}?fields=id,trashed`, { headers: { Authorization: `Bearer ${await this.token()}` } })
      if (res.ok && !((await res.json()) as { trashed?: boolean }).trashed) return saved.folderId
    }
    const query = encodeURIComponent(`name = 'Zak' and mimeType = '${FOLDER_MIME}' and trashed = false`)
    const found = (await (await this.api(`${API}/files?q=${query}&fields=files(id)&spaces=drive`, {})).json()) as { files?: { id: string }[] }
    const id =
      found.files?.[0]?.id ??
      ((await (
        await this.api(`${API}/files?fields=id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Zak', mimeType: FOLDER_MIME })
        })
      ).json()) as { id: string }).id
    await this.save({ ...saved, folderId: id })
    return id
  }

  /** A call to the API, with the token; an error tells what went wrong. */
  private async api(url: string, init: RequestInit): Promise<Response> {
    const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${await this.token()}` } })
    if (res.ok) return res
    if (res.status === 401) this.access = null
    let message = `Drive ${res.status}`
    try {
      message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? message
    } catch {
      /* not JSON */
    }
    throw new Error(message)
  }

  private async token(): Promise<string> {
    if (this.access && Date.now() < this.access.until) return this.access.token
    const saved = await this.requireSaved()
    const client = this.client()!
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, refresh_token: saved.refreshToken, grant_type: 'refresh_token' })
    })
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string }
    if (!res.ok || !body.access_token) {
      // Access taken back from the Google account: sign in again.
      if (body.error === 'invalid_grant') await this.disconnect()
      throw new Error(t('Google Drive est déconnecté : reconnectez-le sur la page des enregistrements.'))
    }
    this.access = { token: body.access_token, until: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 }
    return this.access.token
  }

  private async exchange(client: DriveClient, code: string, verifier: string, redirect: string): Promise<void> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, code, code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' })
    })
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string }
    if (!res.ok || !body.refresh_token || !body.access_token) throw new Error(body.error_description ?? t('La connexion a échoué.'))
    this.access = { token: body.access_token, until: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 }
    // Whose Drive it is (drive.file is enough for this).
    const about = await fetch(`${API}/about?fields=user(emailAddress)`, { headers: { Authorization: `Bearer ${body.access_token}` } })
      .then((r) => r.json() as Promise<{ user?: { emailAddress?: string } }>)
      .catch(() => ({}) as { user?: { emailAddress?: string } })
    await this.save({ refreshToken: body.refresh_token, email: about.user?.emailAddress ?? null, folderId: null, clientId: client.id })
  }

  private async requireSaved(): Promise<Saved> {
    const saved = await this.load()
    if (!saved || saved.clientId !== this.client()?.id) throw new Error(t('Connectez d’abord Google Drive.'))
    return saved
  }

  private async load(): Promise<Saved | null> {
    if (this.saved !== undefined) return this.saved
    try {
      const data = await readFile(this.file)
      const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString('utf8')
      this.saved = JSON.parse(json) as Saved
    } catch {
      this.saved = null
    }
    return this.saved
  }

  private async save(saved: Saved): Promise<void> {
    this.saved = saved
    const json = JSON.stringify(saved)
    await writeFile(this.file, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json), { mode: 0o600 })
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
