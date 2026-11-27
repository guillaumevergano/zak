import { describe, expect, it } from 'vitest'
import { baseLanguage, guessLanguage, nameRanges, readerTarget } from '../../src/shared/textLanguage'
import { protectNames, unprotectNames } from '../../src/main/tools/translator'

const names = (text: string): string[] => nameRanges(text).map(({ start, end }) => text.slice(start, end))

describe('the language of a selection', () => {
  it('recognises the interface languages, and says nothing when unsure', () => {
    expect(guessLanguage('Merci pour votre message, je vous réponds demain.')).toBe('fr')
    expect(guessLanguage('Thanks for your message, I will answer tomorrow.')).toBe('en')
    expect(guessLanguage('Gracias por tu mensaje, te respondo mañana con los datos.')).toBe('es')
    expect(guessLanguage('Danke für die Nachricht, ich antworte dir morgen.')).toBe('de')
    expect(guessLanguage('Bonjour')).toBe('')
    expect(guessLanguage('東京は日本の首都です')).toBe('')
  })

  it('offers English for a text in Zak’s language, Zak’s language for a foreign one', () => {
    expect(readerTarget('fr', 'en', 'fr')).toBe('fr')
    expect(readerTarget('fr', '', 'fr')).toBe('fr')
    expect(readerTarget('fr', 'fr', 'fr')).toBe('en')
    expect(readerTarget('en', 'en', 'en')).toBe('fr')
    expect(readerTarget('es', 'es', 'fr')).toBe('fr')
    expect(baseLanguage('pt-BR')).toBe('pt')
    expect(baseLanguage('zh-CN')).toBe('zh-CN')
  })
})

describe('names', () => {
  it('finds first and last names in a sentence', () => {
    expect(names('Merci Pierre !\nSigné : Jacques Martin')).toEqual(['Pierre', 'Jacques Martin'])
    expect(names('Will and Hope met Grace at the house on Monday. The French team won.')).toEqual(['Hope', 'Grace'])
    // At a sentence's start: only a name seen elsewhere, or followed by a last name.
    expect(names('Rose est là. Je vois Rose.')).toEqual(['Rose', 'Rose'])
    expect(names('Jean-Pierre Durand arrive.')).toEqual(['Jean-Pierre Durand'])
  })

  it('leaves German, titles and acronyms alone', () => {
    expect(names('Der Hund von Peter ist sehr groß und Herr Weber mag ihn.')).toEqual([])
    expect(names('How To Train Your Dragon')).toEqual([])
    expect(names('Le rapport de la NASA est prêt.')).toEqual([])
  })

  it('sends the text escaped with names marked, and takes the marks off the translation', () => {
    expect(protectNames('Merci Pierre & <toi>')).toBe('Merci <span translate="no">Pierre</span> &amp; &lt;toi&gt;')
    expect(unprotectNames('Thank you <span Translate="no">Pierre</span>!')).toBe('Thank you Pierre!')
  })
})
