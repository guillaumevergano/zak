import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, shell: {} }))
const { toOpenableUrl } = await import('../../src/main/system/DefaultBrowser')

describe('toOpenableUrl', () => {
  it('keeps web and file links', () => {
    expect(toOpenableUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(toOpenableUrl('HTTP://example.com')).toBe('HTTP://example.com')
    expect(toOpenableUrl('file:///tmp/page.html')).toBe('file:///tmp/page.html')
  })

  it('turns an existing HTML file path into a file URL, relative to the launch folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zak-'))
    writeFileSync(join(dir, 'page.HTM'), '<p>hi</p>')
    expect(toOpenableUrl('page.HTM', dir)).toBe(pathToFileURL(join(dir, 'page.HTM')).href)
    expect(toOpenableUrl('missing.html', dir)).toBeNull()
  })

  it('ignores flags, the app path and other files', () => {
    expect(toOpenableUrl('--remote-debugging-port=0')).toBeNull()
    expect(toOpenableUrl('.')).toBeNull()
    expect(toOpenableUrl('/Applications/Zak.app')).toBeNull()
    expect(toOpenableUrl('notes.txt')).toBeNull()
    expect(toOpenableUrl('mailto:someone@example.com')).toBeNull()
  })
})
