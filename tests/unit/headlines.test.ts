import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

const { firstSentence, shorten } = await import('../../src/main/newtab/headlines')
const { SAYINGS } = await import('../../src/main/newtab/sayings')

describe('new tab headlines', () => {
  it('keeps the first sentence of an extract, not cut after an abbreviation', () => {
    expect(firstSentence('XQuartz, vormals X11, ist die unabhängige Weiterentwicklung von X11 für macOS. XQuartz basiert auf dem X.Org-Server.')).toBe(
      'XQuartz, vormals X11, ist die unabhängige Weiterentwicklung von X11 für macOS.'
    )
    expect(firstSentence('Jules César (100 av. J.-C. – 44 av. J.-C.) est un général et homme politique romain. Il conquiert la Gaule.')).toBe(
      'Jules César (100 av. J.-C. – 44 av. J.-C.) est un général et homme politique romain.'
    )
  })

  it('shortens long lines at a word, with an ellipsis', () => {
    const text = 'mot '.repeat(80)
    const short = shorten(text, 50)
    expect(short.length).toBeLessThanOrEqual(50)
    expect(short.endsWith('mot…')).toBe(true)
    expect(shorten('Court.')).toBe('Court.')
  })

  it('ships quotes and proverbs in every language', () => {
    for (const [lang, sayings] of Object.entries(SAYINGS)) {
      expect(sayings.quotes.length, lang).toBeGreaterThanOrEqual(40)
      expect(sayings.proverbs.length, lang).toBeGreaterThanOrEqual(40)
      for (const q of sayings.quotes) expect(q.author.trim(), q.text).not.toBe('')
    }
  })
})
