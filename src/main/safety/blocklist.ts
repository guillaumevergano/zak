/**
 * Phishing / malware blocklists (malware-filter project: OpenPhish, PhishTank, URLhaus), checked
 * locally: no URL ever leaves the machine. Pure module (no Electron) so it can be unit tested.
 *
 * Two kinds of lines in those lists (uBO syntax):
 * - `bad.example`: the whole host is dangerous, subdomains included;
 * - `||host.example/path^$all`: only that page (and what follows it) on that host, typically a
 *   phishing page on a shared host (weebly.com, sites.google.com…).
 */
export type Threat = 'phishing' | 'malware'

export class Blocklist {
  private hosts = new Set<string>()
  /** host → path prefixes (path + query, without the leading slash). */
  private pages = new Map<string, string[]>()

  get size(): number {
    let pages = 0
    for (const list of this.pages.values()) pages += list.length
    return this.hosts.size + pages
  }

  static parse(text: string): Blocklist {
    const list = new Blocklist()
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (line === '' || line.startsWith('!') || line.startsWith('#') || line.startsWith('[')) continue
      if (line.startsWith('||')) {
        // ||host/path^$all → host + path prefix
        const body = line.slice(2).replace(/\$.*$/, '').replace(/\^$/, '').replace(/&amp;/g, '&')
        const slash = body.indexOf('/')
        const host = (slash === -1 ? body : body.slice(0, slash)).toLowerCase()
        const path = slash === -1 ? '' : body.slice(slash + 1)
        if (host === '') continue
        if (path === '') list.hosts.add(host)
        else {
          const prefixes = list.pages.get(host)
          if (prefixes) prefixes.push(path)
          else list.pages.set(host, [path])
        }
      } else if (/^[a-z0-9.-]+$/i.test(line)) {
        list.hosts.add(line.toLowerCase())
      }
    }
    return list
  }

  matches(url: string): boolean {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return false
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
    const rest = `${parsed.pathname.slice(1)}${parsed.search}`
    for (const candidate of parentHosts(host)) {
      if (this.hosts.has(candidate)) return true
      const prefixes = this.pages.get(candidate)
      if (prefixes?.some((prefix) => rest.startsWith(prefix))) return true
    }
    return false
  }
}

/** a.b.example.com → a.b.example.com, b.example.com, example.com (never the bare TLD). */
function parentHosts(host: string): string[] {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) return [host]
  const parts = host.split('.')
  const out: string[] = []
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join('.'))
  return out.length > 0 ? out : [host]
}

/** The first threat matching `url`, phishing before malware. */
export function findThreat(lists: Partial<Record<Threat, Blocklist>>, url: string): Threat | null {
  if (lists.phishing?.matches(url)) return 'phishing'
  if (lists.malware?.matches(url)) return 'malware'
  return null
}
