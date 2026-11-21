import { readFileSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'

/** The bits of manifest.json the extensions page reads. */
export interface Manifest {
  name?: string
  version?: string
  description?: string
  manifest_version?: number
  default_locale?: string
  icons?: Record<string, string>
  action?: { default_icon?: string | Record<string, string> }
  browser_action?: { default_icon?: string | Record<string, string> }
  options_page?: string
  options_ui?: { page?: string }
}

type Messages = Record<string, { message?: string }>

/** `__MSG_extName__` → its text in `_locales` (first of `locales` found, then default_locale, then en). */
export function localize(text: string | undefined, messages: Messages): string {
  if (!text) return ''
  return text.replace(/__MSG_(\w+)__/g, (whole, key: string) => {
    const hit = Object.entries(messages).find(([k]) => k.toLowerCase() === key.toLowerCase())
    return hit?.[1].message ?? whole
  })
}

export function readMessages(extensionPath: string, manifest: Manifest, locales: string[]): Messages {
  const candidates = [...locales, manifest.default_locale, 'en'].filter((l): l is string => !!l)
  for (const locale of candidates) {
    try {
      return JSON.parse(readFileSync(join(extensionPath, '_locales', locale, 'messages.json'), 'utf8')) as Messages
    } catch {
      /* try the next locale */
    }
  }
  return {}
}

/** Path (relative to the extension) of its largest icon up to 128 px, from `icons` then the toolbar action. */
export function iconPath(manifest: Manifest): string | null {
  const sets = [manifest.icons, manifest.action?.default_icon, manifest.browser_action?.default_icon]
  for (const set of sets) {
    if (!set) continue
    if (typeof set === 'string') return set
    const sizes = Object.keys(set)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
    const best = sizes.filter((n) => n <= 128).pop() ?? sizes[0]
    if (best !== undefined) return set[String(best)] ?? null
  }
  return null
}

export function optionsPage(manifest: Manifest): string | null {
  return manifest.options_ui?.page ?? manifest.options_page ?? null
}

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

/** Icon as a data: URL, so the page needs no extra route (and web pages can't probe icons). */
export function iconDataUrl(extensionPath: string, manifest: Manifest): string | null {
  const rel = iconPath(manifest)
  if (!rel) return null
  const type = IMAGE_TYPES[extname(rel).toLowerCase()]
  if (!type) return null
  const file = normalize(join(extensionPath, rel))
  if (!file.startsWith(normalize(extensionPath) + sep)) return null
  try {
    const data = readFileSync(file)
    return `data:${type};base64,${data.toString('base64')}`
  } catch {
    return null
  }
}
