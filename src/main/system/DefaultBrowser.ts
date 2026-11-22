import { existsSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, shell } from 'electron'
import type { DefaultBrowserStatus } from '@shared/types'

const WEB_SCHEMES = ['http', 'https'] as const
const PAGE_EXTENSIONS = new Set(['.html', '.htm', '.xhtml'])

/**
 * Turns what the system hands the app (a link clicked in another app, a page opened from the
 * Finder or Explorer) into a URL to open, or null when it is something else (a Chromium flag…).
 */
export function toOpenableUrl(arg: string, cwd = process.cwd()): string | null {
  if (/^https?:\/\//i.test(arg) || /^file:\/\//i.test(arg)) return arg
  if (arg.startsWith('-') || !PAGE_EXTENSIONS.has(extname(arg).toLowerCase())) return null
  const path = resolve(cwd, arg)
  return existsSync(path) ? pathToFileURL(path).href : null
}

/**
 * Links and pages the system sends to Zak once it is the default browser (CLAUDE.md §6.7):
 * macOS uses `open-url` / `open-file` (which can fire before `ready`, even to launch the app);
 * Windows and Linux start a second process with the URL in its arguments, which hands it over to
 * the running one and quits.
 */
export class LinkReceiver {
  private queue: string[] = []
  private open: ((urls: string[]) => void) | null = null

  /** Must run before `ready`. Returns false when another instance already runs (this one quits). */
  install(): boolean {
    if (!app.requestSingleInstanceLock()) {
      app.quit()
      return false
    }
    app.on('will-finish-launching', () => {
      app.on('open-url', (event, url) => {
        event.preventDefault()
        this.receive([url])
      })
      app.on('open-file', (event, path) => {
        event.preventDefault()
        const url = toOpenableUrl(path)
        if (url) this.receive([url])
      })
    })
    app.on('second-instance', (_event, argv, cwd) => this.receive(this.fromArgv(argv, cwd), true))
    this.queue.push(...this.fromArgv(process.argv.slice(1)))
    return true
  }

  /** URLs received before the first window, to open at launch instead of a new tab. */
  takePending(): string[] {
    return this.queue.splice(0)
  }

  /** From now on, received URLs open right away. */
  start(open: (urls: string[]) => void): void {
    this.open = open
    const pending = this.takePending()
    if (pending.length > 0) open(pending)
  }

  private receive(urls: string[], always = false): void {
    if (urls.length === 0 && !always) return
    if (this.open) this.open(urls)
    else this.queue.push(...urls)
  }

  private fromArgv(argv: string[], cwd?: string): string[] {
    // Packaged: argv = [exe, …args]. In development, Electron's own arguments come first.
    const args = app.isPackaged ? argv.slice(1) : argv.slice(2)
    return args.map((arg) => toOpenableUrl(arg, cwd)).filter((url): url is string => url !== null)
  }
}

/** Whether Zak handles web links, and whether this build can claim them. */
export function defaultBrowserStatus(): DefaultBrowserStatus {
  // In development the process is Electron.app: registering it would hijack every link.
  if (!app.isPackaged) return 'unavailable'
  return WEB_SCHEMES.every((scheme) => app.isDefaultProtocolClient(scheme)) ? 'default' : 'other'
}

/**
 * macOS asks the user to confirm (system dialog). Windows 10+ only lets the user change it in the
 * system settings: open them at Zak's entry (the installer registers the app, build/installer.nsh).
 */
export async function makeDefaultBrowser(): Promise<DefaultBrowserStatus> {
  if (!app.isPackaged) return 'unavailable'
  if (process.platform === 'win32') {
    await shell.openExternal('ms-settings:defaultapps?registeredAppUser=Zak')
    return defaultBrowserStatus()
  }
  for (const scheme of WEB_SCHEMES) app.setAsDefaultProtocolClient(scheme)
  return defaultBrowserStatus()
}
