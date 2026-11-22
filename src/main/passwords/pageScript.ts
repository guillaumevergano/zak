/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * Scripts run in the page's isolated world (never visible to the page's own scripts), the only
 * way in: tabs get no custom preload (CLAUDE.md §3).
 *
 * The page talks back through `console.debug('zakpw:<nonce>:<json>')`, read by main on the tab's
 * `console-message` event. The nonce only lives in the isolated world, so the page can't forge
 * these messages; passwords travel XOR-ed with a one-time pad so they don't show as plain text in
 * the DevTools console.
 */
export const PASSWORDS_WORLD_ID = 2001

export interface PageScriptConfig {
  nonce: string
  /** Hex pad for the passwords sent to main. */
  pad: string
  /** Saved logins of this site (usernames only: passwords come at fill time). */
  logins: { id: string; username: string }[]
  /** False in private windows and on « Jamais pour ce site » sites. */
  canSave: boolean
  /** Texts of the list, in the interface language. */
  text: { title: string; noUsername: string }
}

export function pageScript(config: PageScriptConfig): string {
  return `(${install.toString()})(${JSON.stringify(config)})`
}

/** Fills the last login form the user was in (run in the same isolated world). */
export function fillScript(username: string, password: string): string {
  return `(${fill.toString()})(${JSON.stringify(username)}, ${JSON.stringify(password)})`
}

// ─── Below: page code (no imports, no closures over module scope) ──────────────────────────────

interface State {
  config: PageScriptConfig
  lastField: HTMLInputElement | null
}

function install(config: PageScriptConfig): void {
  const g = globalThis as unknown as { __zakPasswords?: State }
  if (g.__zakPasswords) {
    // Same document (logins saved meanwhile, or a new nonce): update, listeners are in place.
    g.__zakPasswords.config = config
    return
  }
  const state: State = { config, lastField: null }
  g.__zakPasswords = state

  const send = (payload: object): void => console.debug(`zakpw:${state.config.nonce}:${JSON.stringify(payload)}`)
  const hide = (input: HTMLInputElement): string => {
    const pad = state.config.pad
    const bytes = new TextEncoder().encode(input.value)
    let out = ''
    for (let i = 0; i < bytes.length; i++) {
      const key = parseInt(pad.substr((i * 2) % pad.length, 2), 16)
      out += (bytes[i]! ^ key).toString(16).padStart(2, '0')
    }
    return out
  }
  const visible = (el: HTMLElement): boolean => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
  }
  const isPassword = (el: unknown): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === 'password'
  const isUsername = (el: unknown): el is HTMLInputElement => {
    if (!(el instanceof HTMLInputElement) || !['text', 'email', 'tel', ''].includes(el.type)) return false
    const hint = `${el.autocomplete} ${el.name} ${el.id} ${el.getAttribute('aria-label') ?? ''} ${el.placeholder}`.toLowerCase()
    if (/username|email|e-mail|login|identifiant|utilisateur|user|courriel|phone|téléphone/.test(hint)) return true
    // The text field right before a password field.
    const scope = el.form ?? document
    const inputs = [...scope.querySelectorAll('input')]
    const next = inputs.slice(inputs.indexOf(el) + 1).find((i) => i.type !== 'hidden' && visible(i))
    return isPassword(next)
  }

  /** Username and password of a form being sent, if it has a filled password. */
  const capture = (scope: ParentNode): void => {
    if (!state.config.canSave) return
    const inputs = [...scope.querySelectorAll('input')].filter((i) => i.type !== 'hidden')
    const passwords = inputs.filter((i) => isPassword(i) && i.value !== '')
    if (passwords.length === 0) {
      // First step of a two-step login (email, then password on the next page).
      const user = inputs.find((i) => isUsername(i) && i.value.trim() !== '')
      if (user) send({ t: 'user', u: user.value.trim() })
      return
    }
    // Change-password and sign-up forms: the new password is the last one.
    const password = passwords[passwords.length - 1]!
    const before = inputs.slice(0, inputs.indexOf(passwords[0]!))
    const user = [...before].reverse().find((i) => i.type !== 'password' && i.value.trim() !== '' && visible(i))
    send({ t: 'submit', u: user ? user.value.trim() : '', p: hide(password) })
  }

  document.addEventListener('submit', (e) => capture(e.target as HTMLFormElement), true)
  document.addEventListener(
    'click',
    (e) => {
      const button = (e.target as Element | null)?.closest?.('button, input[type=submit], input[type=button], [role=button]')
      if (!button) return
      const form = (button as HTMLButtonElement).form ?? button.closest('form')
      if (form) capture(form)
      else if (document.querySelector('input[type=password]')) capture(document)
    },
    true
  )
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter') return
      const field = e.target as HTMLInputElement
      if (isPassword(field) || isUsername(field)) capture(field.form ?? document)
    },
    true
  )

  // ── Saved logins under the field ──
  let host: HTMLElement | null = null
  const close = (): void => {
    host?.remove()
    host = null
  }
  const open = (field: HTMLInputElement): void => {
    close()
    const logins = state.config.logins
    if (logins.length === 0) return
    host = document.createElement('zak-passwords')
    const root = host.attachShadow({ mode: 'closed' })
    const r = field.getBoundingClientRect()
    const style = document.createElement('style')
    style.textContent = `
      :host { all: initial; position: fixed; z-index: 2147483647; left: ${Math.round(r.left)}px; top: ${Math.round(r.bottom + 4)}px; }
      div { min-width: ${Math.max(220, Math.round(r.width))}px; max-width: 360px; background: #fff; border: 1px solid #decfd6;
            border-radius: 12px; box-shadow: 0 8px 24px rgb(46 31 45 / 0.18); padding: 4px; font: 13px system-ui, sans-serif; color: #2a1a26; }
      p { margin: 6px 10px 4px; font-size: 11px; color: #6f5b68; }
      button { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none; padding: 8px 10px;
               border-radius: 8px; font: inherit; color: inherit; text-align: left; cursor: pointer; }
      button:hover, button:focus { background: #f3edea; outline: none; }
      span.k { font-size: 15px; }
      span.d { color: #a3919b; margin-left: auto; letter-spacing: 1px; }`
    const box = document.createElement('div')
    box.setAttribute('role', 'listbox')
    const title = document.createElement('p')
    title.textContent = state.config.text.title
    box.append(title)
    for (const login of logins) {
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'option')
      button.dataset['zakLogin'] = login.id
      const key = document.createElement('span')
      key.className = 'k'
      key.textContent = '🔑'
      const name = document.createElement('span')
      name.textContent = login.username || state.config.text.noUsername
      const dots = document.createElement('span')
      dots.className = 'd'
      dots.textContent = '••••••'
      button.append(key, name, dots)
      button.addEventListener('mousedown', (e) => e.preventDefault()) // keep the focus in the field
      button.addEventListener('click', (e) => {
        if (!e.isTrusted) return // a click from the page's scripts
        state.lastField = field
        close()
        send({ t: 'fill', id: login.id })
      })
      box.append(button)
    }
    root.append(style, box)
    document.documentElement.append(host)
  }

  document.addEventListener(
    'focusin',
    (e) => {
      const field = e.target
      if (isPassword(field) || isUsername(field)) {
        state.lastField = field
        if (field.value === '') open(field)
      } else if (e.target !== host) close()
    },
    true
  )
  document.addEventListener('input', (e) => e.target === state.lastField && close(), true)
  document.addEventListener('focusout', () => setTimeout(() => document.activeElement !== host && close(), 150), true)
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close(), true)
  window.addEventListener('scroll', close, true)
  window.addEventListener('resize', close)
}

function fill(username: string, password: string): void {
  const state = (globalThis as unknown as { __zakPasswords?: State }).__zakPasswords
  const field = state?.lastField
  const scope: ParentNode = field?.form ?? document
  const inputs = [...scope.querySelectorAll('input')].filter((i) => i.type !== 'hidden' && !i.disabled && !i.readOnly)
  const passwordField = inputs.find((i) => i.type === 'password')
  const before = passwordField ? inputs.slice(0, inputs.indexOf(passwordField)) : inputs
  const userField =
    field && field.type !== 'password' ? field : [...before].reverse().find((i) => ['text', 'email', 'tel', ''].includes(i.type))
  const set = (input: HTMLInputElement | undefined, value: string): void => {
    if (!input) return
    input.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  if (username) set(userField, username)
  set(passwordField, password)
}
