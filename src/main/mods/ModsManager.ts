import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { app, webContents as allWebContents, type WebContents } from 'electron'
import type { ModInfo } from '@shared/types'
import { INTERNAL_SCHEME } from '@shared/ipc'

/**
 * Mods (docs/customize/): folders in the profile's « mods » folder that reshape Zak itself, with no
 * code running in the browser's own interface:
 * - a THEME is a CSS file, added to the browser's interface and internal pages (it usually
 *   redefines the color tokens of src/renderer/src/styles.css);
 * - a NEW TAB is an HTML page (+ its files) shown instead of zak://newtab. It runs sandboxed: its
 *   own files only, no network (CSP), and only the new tab's API (recent sites, suggestions).
 * One theme and one new tab at a time. The folder is watched: edits show at once.
 *
 * mod.json: { "name": "…", "version": "1.0", "description": "…", "theme": "theme.css", "newtab": "newtab.html" }
 */
interface ModManifest {
  name?: string
  version?: string
  description?: string
  theme?: string
  newtab?: string
}

export interface ModsSelection {
  theme: string | null
  newtab: string | null
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
}

/** A new tab mod reaches nothing outside its folder: no network, no other internal page. */
export const MOD_NEWTAB_CSP =
  "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'none'"

export class ModsManager {
  readonly dir: string
  private mods: ModInfo[] = []
  /** CSS inserted per webContents, to replace it when the theme changes. */
  private inserted = new Map<WebContents, string>()
  private watcher: FSWatcher | null = null
  private listeners: (() => void)[] = []

  constructor(
    private readonly selection: { get: () => ModsSelection; set: (s: ModsSelection) => void },
    dir = join(app.getPath('userData'), 'mods')
  ) {
    this.dir = dir
  }

  start(): void {
    mkdirSync(this.dir, { recursive: true })
    this.scan()
    let timer: NodeJS.Timeout | null = null
    try {
      this.watcher = watch(this.dir, { recursive: true }, () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => this.refresh(), 300)
      })
    } catch {
      /* not watchable: « Recharger » in the settings still works */
    }
    // Every interface view and internal page gets the theme.
    app.on('web-contents-created', (_e, wc) => {
      wc.on('dom-ready', () => {
        if (this.themed(wc)) void this.applyTheme(wc)
      })
    })
  }

  list(): ModInfo[] {
    return this.mods
  }

  /** Picks the theme / new tab in use (null: Zak's own). */
  select(kind: 'theme' | 'newtab', id: string | null): void {
    const current = this.selection.get()
    if (id !== null && !this.mods.some((m) => m.id === id && (kind === 'theme' ? m.hasTheme : m.hasNewtab))) return
    this.selection.set({ ...current, [kind]: id })
    this.refresh()
  }

  /** Rescans the folder and applies the theme everywhere again. */
  refresh(): void {
    this.scan()
    for (const wc of [...this.inserted.keys()]) if (wc.isDestroyed()) this.inserted.delete(wc)
    for (const wc of allWebContents.getAllWebContents()) if (!wc.isDestroyed() && this.themed(wc)) void this.applyTheme(wc)
    for (const listener of this.listeners) listener()
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener)
  }

  /** The new tab mod's file for `pathname`, or null when Zak's own new tab is in use. */
  newtabResponse(pathname: string): Response | null {
    const mod = this.active('newtab')
    if (!mod?.newtab) return null
    const root = join(this.dir, mod.id)
    const file = normalize(join(root, pathname === '/' ? mod.newtab : decodeURIComponent(pathname)))
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      return new Response('Introuvable', { status: 404 })
    }
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
    return new Response(readFileSync(file), { headers: { 'Content-Type': type, 'Content-Security-Policy': MOD_NEWTAB_CSP } })
  }

  themeCss(): string {
    const mod = this.active('theme')
    if (!mod?.theme) return ''
    try {
      return readFileSync(join(this.dir, mod.id, mod.theme), 'utf8')
    } catch {
      return ''
    }
  }

  /** The browser's interface (file:// or the dev server), the overlay and internal pages. */
  themed(wc: WebContents): boolean {
    const url = wc.getURL()
    return url.startsWith(`${INTERNAL_SCHEME}://`) || url.startsWith('file://') || url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '\u0000')
  }

  private active(kind: 'theme' | 'newtab'): (ModManifest & { id: string }) | null {
    const id = this.selection.get()[kind]
    if (!id) return null
    const manifest = readModManifest(join(this.dir, id))
    return manifest ? { ...manifest, id } : null
  }

  private async applyTheme(wc: WebContents): Promise<void> {
    if (wc.isDestroyed()) return
    const css = this.themeCss()
    const previous = this.inserted.get(wc)
    this.inserted.delete(wc)
    try {
      if (css) this.inserted.set(wc, await wc.insertCSS(css))
      if (previous) await wc.removeInsertedCSS(previous)
    } catch {
      /* navigated or closed meanwhile */
    }
  }

  private scan(): void {
    const found: ModInfo[] = []
    let entries: string[] = []
    try {
      entries = readdirSync(this.dir)
    } catch {
      /* no folder yet */
    }
    const selection = this.selection.get()
    for (const id of entries.sort()) {
      const manifest = readModManifest(join(this.dir, id))
      if (!manifest) continue
      found.push({
        id,
        name: manifest.name || id,
        version: manifest.version ?? '',
        description: manifest.description ?? '',
        hasTheme: typeof manifest.theme === 'string' && existsSync(join(this.dir, id, manifest.theme)),
        hasNewtab: typeof manifest.newtab === 'string' && existsSync(join(this.dir, id, manifest.newtab)),
        themeActive: selection.theme === id,
        newtabActive: selection.newtab === id
      })
    }
    this.mods = found
  }
}

function readModManifest(folder: string): ModManifest | null {
  try {
    if (!statSync(folder).isDirectory()) return null
    const manifest = JSON.parse(readFileSync(join(folder, 'mod.json'), 'utf8')) as ModManifest
    // Files of the mod only: no path out of its folder.
    for (const key of ['theme', 'newtab'] as const) {
      const value = manifest[key]
      if (value !== undefined && (typeof value !== 'string' || value.includes('..') || value.startsWith('/'))) delete manifest[key]
    }
    return manifest
  } catch {
    return null
  }
}

