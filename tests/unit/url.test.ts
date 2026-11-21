import { describe, expect, it } from 'vitest'
import { NEW_TAB_URL, toUrl } from '../../src/shared/url'

const search = (q: string): string => `https://www.google.com/search?q=${encodeURIComponent(q)}`

describe('toUrl (omnibox input)', () => {
  it('keeps full URLs', () => {
    expect(toUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(toUrl('  http://example.com ')).toBe('http://example.com')
    expect(toUrl('about:blank')).toBe('about:blank')
    expect(toUrl('data:text/html,<p>hi</p>')).toBe('data:text/html,<p>hi</p>')
  })

  it('adds https:// to things that look like hosts', () => {
    expect(toUrl('example.com')).toBe('https://example.com')
    expect(toUrl('www.jeuxvideo.com/news')).toBe('https://www.jeuxvideo.com/news')
    expect(toUrl('example.fr:8443/x?y#z')).toBe('https://example.fr:8443/x?y#z')
  })

  it('uses http:// for localhost and IPs', () => {
    expect(toUrl('localhost:5173')).toBe('http://localhost:5173')
    expect(toUrl('192.168.1.10/admin')).toBe('http://192.168.1.10/admin')
  })

  it('searches everything else', () => {
    expect(toUrl('météo paris')).toBe(search('météo paris'))
    expect(toUrl('node.js stream')).toBe(search('node.js stream'))
    expect(toUrl('hello')).toBe(search('hello'))
  })

  it('opens the new tab page for empty input', () => {
    expect(toUrl('   ')).toBe(NEW_TAB_URL)
  })
})
