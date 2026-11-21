import type { PipSettings } from '@shared/types'

/**
 * "https://www.YouTube.com/watch?v=…" → "youtube.com". Accepts a bare domain or a pasted URL.
 * Returns null when nothing usable is left.
 */
export function normalizeDomain(input: string): string | null {
  let text = input.trim().toLowerCase()
  if (text === '') return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(text)) text = `https://${text}`
  let host: string
  try {
    host = new URL(text).hostname
  } catch {
    return null
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host === 'localhost' ? host : null
}

/** Is this page on an excluded domain (or one of its subdomains)? */
export function isExcluded(url: string, domains: readonly string[]): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return false
  }
  return domains.some((d) => host === d || host.endsWith(`.${d}`))
}

export const DEFAULT_PIP_SETTINGS: PipSettings = {
  enabled: true,
  closeOnReturn: true,
  skipMuted: false,
  excludedDomains: []
}

/** Cleans what the settings page sends: known keys only, valid unique sorted domains. */
export function normalizePipSettings(input: Partial<PipSettings>): PipSettings {
  const domains = (Array.isArray(input.excludedDomains) ? input.excludedDomains : [])
    .map((d) => (typeof d === 'string' ? normalizeDomain(d) : null))
    .filter((d): d is string => d !== null)
  return {
    enabled: input.enabled ?? DEFAULT_PIP_SETTINGS.enabled,
    closeOnReturn: input.closeOnReturn ?? DEFAULT_PIP_SETTINGS.closeOnReturn,
    skipMuted: input.skipMuted ?? DEFAULT_PIP_SETTINGS.skipMuted,
    excludedDomains: [...new Set(domains)].sort()
  }
}
