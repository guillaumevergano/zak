import { describe, expect, it } from 'vitest'
import { parseResponse, splitText, translateText, type Fetcher } from '../../src/main/tools/translator'
import { languageMenu, languageName, normalizeTools, withRecent } from '../../src/shared/tools'

/** Answers like clients5 does: one [translation, source] per `q`, here the text in capitals. */
function fakeGoogle(calls: string[][] = []): Fetcher {
  return async (_url, init) => {
    const pieces = new URLSearchParams(init.body).getAll('q')
    calls.push(pieces)
    return { ok: true, status: 200, json: async () => pieces.map((p) => [p.toUpperCase(), 'fr']) }
  }
}

describe('translator', () => {
  it('cuts long texts at line breaks, losing nothing', () => {
    const text = `${'a'.repeat(60)}\n${'b'.repeat(60)}\n${'c'.repeat(30)}`
    const pieces = splitText(text, 100)
    expect(pieces.join('')).toBe(text)
    expect(pieces.every((p) => p.length <= 100)).toBe(true)
    expect(pieces[0]).toBe(`${'a'.repeat(60)}\n`)
  })

  it('reads one or several pieces', () => {
    expect(parseResponse([['Bonjour', 'en']], 1)).toEqual([{ text: 'Bonjour', source: 'en' }])
    expect(parseResponse(['Bonjour', 'en'], 1)).toEqual([{ text: 'Bonjour', source: 'en' }])
    expect(parseResponse([['A', 'en'], ['B', 'de']], 2)).toEqual([
      { text: 'A', source: 'en' },
      { text: 'B', source: 'de' }
    ])
    expect(() => parseResponse('<html>Sorry…', 1)).toThrow()
  })

  it('keeps the spaces and line breaks around the text, and sends nothing blank', async () => {
    const calls: string[][] = []
    const text = `  salut\n\n${'x'.repeat(5000)}\n`
    const result = await translateText(text, 'en', fakeGoogle(calls))
    expect(result.source).toBe('fr')
    expect(result.text).toBe(`  SALUT\n\n${'X'.repeat(5000)}\n`)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.every((q) => q.trim() === q && q !== '')).toBe(true)
  })

  it('fails on an error answer', async () => {
    const down: Fetcher = async () => ({ ok: false, status: 429, json: async () => null })
    await expect(translateText('salut', 'en', down)).rejects.toThrow('HTTP 429')
  })
})

describe('tools settings', () => {
  it('falls back to the defaults for anything unknown', () => {
    const record = { enabled: true, camera: true, cameraLabel: '', mic: true, micLabel: '' }
    expect(normalizeTools(undefined)).toEqual({ translate: { enabled: true, target: '', recent: [] }, screenshot: { enabled: true }, record })
    expect(
      normalizeTools({
        translate: { enabled: false, target: 'xx', recent: ['en', 'en', 'zz', 'de'] },
        screenshot: { enabled: false },
        record: { enabled: false, camera: false, cameraLabel: 'FaceTime HD', micLabel: 3 }
      })
    ).toEqual({
      translate: { enabled: false, target: '', recent: ['en', 'de'] },
      screenshot: { enabled: false },
      record: { enabled: false, camera: false, cameraLabel: 'FaceTime HD', mic: true, micLabel: '' }
    })
  })

  it('keeps the last languages chosen first, four at most', () => {
    let recent: string[] = []
    for (const l of ['en', 'de', 'es', 'it', 'pt', 'de']) recent = withRecent(recent, l)
    expect(recent).toEqual(['de', 'pt', 'it', 'es'])
  })

  it('names languages in the interface language', () => {
    expect(languageName('en', 'fr')).toBe('Anglais')
    expect(languageName('en', 'fr', false)).toBe('anglais')
    expect(languageName('de', 'en')).toBe('German')
    const { recent, others } = languageMenu(['es'], 'fr')
    expect(recent).toEqual(['es'])
    expect(others).not.toContain('es')
    expect(others[0]).toBe('de') // Allemand
  })
})
