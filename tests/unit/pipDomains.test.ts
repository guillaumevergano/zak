import { describe, expect, it } from 'vitest'
import { isExcluded, normalizeDomain, normalizePipSettings } from '../../src/main/pip/domains'

describe('PiP excluded domains', () => {
  it('normalizes domains and pasted URLs', () => {
    expect(normalizeDomain('YouTube.com')).toBe('youtube.com')
    expect(normalizeDomain('https://www.youtube.com/watch?v=x')).toBe('youtube.com')
    expect(normalizeDomain(' m.twitch.tv ')).toBe('m.twitch.tv')
    expect(normalizeDomain('localhost:5173')).toBe('localhost')
    expect(normalizeDomain('pas un domaine')).toBeNull()
    expect(normalizeDomain('')).toBeNull()
  })

  it('matches a domain and its subdomains only', () => {
    const domains = ['youtube.com']
    expect(isExcluded('https://youtube.com/', domains)).toBe(true)
    expect(isExcluded('https://www.youtube.com/watch', domains)).toBe(true)
    expect(isExcluded('https://m.youtube.com/', domains)).toBe(true)
    expect(isExcluded('https://notyoutube.com/', domains)).toBe(false)
    expect(isExcluded('about:blank', domains)).toBe(false)
  })

  it('cleans settings sent by the page', () => {
    expect(
      normalizePipSettings({ enabled: false, excludedDomains: ['www.b.com', 'a.com', 'https://a.com/x', '???'] })
    ).toEqual({ enabled: false, closeOnReturn: true, skipMuted: false, autoplayed: false, excludedDomains: ['a.com', 'b.com'] })
  })
})
