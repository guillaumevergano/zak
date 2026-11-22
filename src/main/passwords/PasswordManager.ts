import { randomBytes } from 'node:crypto'
import type { WebContents } from 'electron'
import type { SavePasswordChoice } from '@shared/types'
import type { BrowserWindowHandle, WindowManager } from '../windows/WindowManager'
import { loginOrigin, type PasswordStore } from './PasswordStore'
import { PASSWORDS_WORLD_ID, fillScript, pageScript } from './pageScript'

const PROMPT_WIDTH = 340
const PROMPT_HEIGHT = 150
/** A login sent without navigation (failed, or a single-page app): ask anyway after this. */
const PROMPT_FALLBACK_MS = 4000
/** How long the email of a two-step login waits for its password. */
const USER_STEP_MS = 5 * 60_000

interface TabState {
  private: boolean
  nonce: string
  pad: Buffer
  origin: string | null
  /** Email typed on the first page of a two-step login. */
  user: { origin: string; username: string; at: number } | null
  /** Credentials just sent, waiting for the page to change before asking to save them. */
  pending: { origin: string; username: string; password: string; timer: NodeJS.Timeout } | null
}

interface Prompt {
  id: number
  handle: BrowserWindowHandle
  wc: WebContents
  origin: string
  username: string
  password: string
}

/**
 * Built-in password manager (like Chrome's): offers to save what is typed in a login form, lists
 * the saved logins under the field, fills the one picked. Nothing is filled without a click.
 * Private windows can use saved passwords but never save any.
 */
export class PasswordManager {
  private tabs = new WeakMap<WebContents, TabState>()
  private prompts: Prompt[] = []
  private nextId = 1

  constructor(
    private readonly store: PasswordStore,
    private readonly windows: WindowManager,
    private readonly isEnabled: () => boolean
  ) {
    windows.on('tab-created', (wc, window) => this.attach(wc, windows.fromWindow(window)?.private ?? false))
    windows.on('overlay-hidden', (handle, request) => {
      if (request.kind === 'save-password') this.showNext(handle)
    })
    windows.on('tab-selected', (wc) => {
      const handle = windows.fromTab(wc)
      if (handle && !handle.overlay.showing()) this.showNext(handle)
    })
  }

  /** Answer of the « Enregistrer le mot de passe ? » prompt. */
  answer(promptId: number, choice: SavePasswordChoice): void {
    const prompt = this.prompts.find((p) => p.id === promptId)
    if (!prompt) return
    this.prompts = this.prompts.filter((p) => p !== prompt)
    if (choice === 'save') this.store.save(prompt.origin, prompt.username, prompt.password)
    if (choice === 'never') this.store.never(prompt.origin)
    prompt.handle.overlay.close()
    // The open pages of that site now list it (or stop offering to save).
    for (const handle of this.windows.all()) {
      for (const wc of handle.tabs.webContentsList()) if (loginOrigin(wc.getURL()) === prompt.origin) this.inject(wc)
    }
  }

  private attach(wc: WebContents, isPrivate: boolean): void {
    const state: TabState = {
      private: isPrivate,
      nonce: randomBytes(12).toString('hex'),
      pad: randomBytes(64),
      origin: null,
      user: null,
      pending: null
    }
    this.tabs.set(wc, state)
    wc.on('dom-ready', () => this.inject(wc))
    wc.on('console-message', (event) => {
      const prefix = `zakpw:${state.nonce}:`
      if (!event.message.startsWith(prefix) || event.frame !== wc.mainFrame) return
      try {
        this.onMessage(wc, state, JSON.parse(event.message.slice(prefix.length)) as Message)
      } catch {
        /* malformed */
      }
    })
    const navigated = (): void => {
      if (state.pending) this.promptNow(wc, state)
    }
    wc.on('did-navigate', navigated)
    wc.on('did-navigate-in-page', (_e, _url, isMainFrame) => isMainFrame && navigated())
    wc.once('destroyed', () => {
      if (state.pending) clearTimeout(state.pending.timer)
      this.prompts = this.prompts.filter((p) => p.wc !== wc)
    })
  }

  private inject(wc: WebContents): void {
    const state = this.tabs.get(wc)
    if (!state || wc.isDestroyed()) return
    const origin = loginOrigin(wc.getURL())
    state.origin = origin
    if (!origin) return
    const logins = this.store.forOrigin(origin).map((l) => ({ id: l.id, username: l.username }))
    const canSave = this.canSave(state, origin)
    if (logins.length === 0 && !canSave) return
    const code = pageScript({ nonce: state.nonce, pad: state.pad.toString('hex'), logins, canSave })
    void wc.executeJavaScriptInIsolatedWorld(PASSWORDS_WORLD_ID, [{ code }]).catch(() => {})
  }

  /** Offering to save: on in the settings, not in a private window, not a « Jamais » site. */
  private canSave(state: TabState, origin: string): boolean {
    return this.isEnabled() && !state.private && !this.store.isNever(origin)
  }

  private onMessage(wc: WebContents, state: TabState, message: Message): void {
    const origin = loginOrigin(wc.getURL())
    if (!origin || origin !== state.origin) return
    if (message.t === 'user') {
      state.user = { origin, username: String(message.u).slice(0, 500), at: Date.now() }
    } else if (message.t === 'submit') {
      if (!this.canSave(state, origin)) return
      const password = this.reveal(state, String(message.p))
      if (!password || password.length > 1000) return
      let username = String(message.u ?? '').slice(0, 500)
      if (!username && state.user && state.user.origin === origin && Date.now() - state.user.at < USER_STEP_MS) username = state.user.username
      if (this.store.check(origin, username, password) === 'saved') return
      if (state.pending) clearTimeout(state.pending.timer)
      state.pending = { origin, username, password, timer: setTimeout(() => this.promptNow(wc, state), PROMPT_FALLBACK_MS) }
    } else if (message.t === 'fill') {
      const login = this.store.get(String(message.id))
      if (!login || login.origin !== origin) return
      const password = this.store.password(login.id)
      if (password === null) return
      this.store.markUsed(login.id)
      void wc.executeJavaScriptInIsolatedWorld(PASSWORDS_WORLD_ID, [{ code: fillScript(login.username, password) }]).catch(() => {})
    }
  }

  private reveal(state: TabState, hex: string): string | null {
    if (!/^([0-9a-f]{2})*$/.test(hex)) return null
    const bytes = Buffer.from(hex, 'hex')
    for (let i = 0; i < bytes.length; i++) bytes[i] = bytes[i]! ^ state.pad[i % state.pad.length]!
    return bytes.toString('utf8')
  }

  private promptNow(wc: WebContents, state: TabState): void {
    const pending = state.pending
    if (!pending || wc.isDestroyed()) return
    clearTimeout(pending.timer)
    state.pending = null
    const handle = this.windows.fromTab(wc)
    if (!handle) return
    // One prompt per site and username: a newer one replaces it.
    this.prompts = this.prompts.filter((p) => !(p.origin === pending.origin && p.username === pending.username))
    this.prompts.push({ id: this.nextId++, handle, wc, ...pending })
    this.showNext(handle)
  }

  private showNext(handle: BrowserWindowHandle): void {
    if (handle.window.isDestroyed() || handle.overlay.showing()) return
    const next = this.prompts.find((p) => p.handle === handle && !p.wc.isDestroyed() && p.wc.id === handle.tabs.getActiveId())
    if (!next) return
    const { top } = handle.tabs.getInsets()
    const width = handle.window.getContentBounds().width
    const update = this.store.check(next.origin, next.username, next.password) === 'update'
    void handle.overlay.open({
      kind: 'save-password',
      promptId: next.id,
      origin: next.origin,
      username: next.username,
      update,
      frame: { x: Math.max(8, width - PROMPT_WIDTH - 12), y: top + 4, width: PROMPT_WIDTH, height: PROMPT_HEIGHT }
    })
  }
}

type Message = { t: 'user'; u: string } | { t: 'submit'; u: string; p: string } | { t: 'fill'; id: string }
