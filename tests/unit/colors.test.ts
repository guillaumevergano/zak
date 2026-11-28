import { describe, expect, it } from 'vitest'
import {
  aggregateBrand,
  brandColors,
  brandFonts,
  brandVariables,
  contrast,
  formatColor,
  kitToCss,
  normalizeHex,
  parseColor,
  typeStyles,
  type BrandScan
} from '../../src/shared/colors'
import { openMemoryDatabase } from '../../src/main/store/db'
import { ColorsStore, HISTORY_MAX } from '../../src/main/store/colors'

describe('colors', () => {
  it('reads the colors a page gives and writes them in every format', () => {
    expect(parseColor('rgb(198, 122, 251)')).toEqual({ r: 198, g: 122, b: 251, a: 1 })
    expect(parseColor('rgba(0 0 0 / 50%)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 })
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 })
    expect(parseColor('blue')).toBeNull()
    expect(normalizeHex('#c67afb')).toBe('#C67AFB')
    expect(formatColor('#C67AFB', 'rgb')).toBe('rgb(198, 122, 251)')
    expect(formatColor('#C67AFB', 'hsl')).toBe('hsl(275, 94%, 73%)')
    expect(formatColor('#FFFFFF', 'hsl')).toBe('hsl(0, 0%, 100%)')
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21)
  })

  it('finds the brand color on what one clicks rather than on a big picture', () => {
    const colors = brandColors([
      { color: 'rgb(255, 255, 255)', use: 'background', weight: 1_000_000 },
      { color: 'rgb(255, 187, 0)', use: 'background', weight: 120_000 },
      { color: 'rgb(17, 17, 17)', use: 'text', weight: 5000 },
      { color: 'rgb(18, 17, 17)', use: 'text', weight: 300 },
      { color: 'rgb(83, 58, 253)', use: 'background', weight: 8000 },
      { color: 'rgb(83, 58, 253)', use: 'action', weight: 6 },
      { color: 'rgba(0, 0, 0, 0)', use: 'background', weight: 9_000_000 }
    ])
    expect(colors.map((c) => [c.hex, c.role])).toEqual([
      ['#533AFD', 'primary'],
      ['#FFFFFF', 'background'],
      ['#111111', 'text'],
      ['#FFBB00', 'accent']
    ])
  })

  it('keeps the color variables, brand-named first', () => {
    expect(
      brandVariables([
        { name: '--gap', value: '12px' },
        { name: '--ink', value: '#111' },
        { name: '--brand-primary', value: 'rgb(83, 58, 253)' },
        { name: '--veil', value: 'rgba(0,0,0,0.1)' }
      ])
    ).toEqual([
      { name: '--brand-primary', hex: '#533AFD' },
      { name: '--ink', hex: '#111111' }
    ])
  })

  it('tells the fonts apart by use and where they come from', () => {
    const text = (family: string, tag: string, role: 'heading' | 'body', chars: number, size = 16, weight = 400) => ({
      family,
      weight,
      size,
      lineHeight: 24,
      letterSpacing: 'normal',
      transform: 'none',
      tag,
      role,
      chars
    })
    const texts = [text('"Inter", sans-serif', 'p', 'body', 900), text('Fraunces, serif', 'h1', 'heading', 100, 48, 700), text('Fraunces, serif', 'h1', 'heading', 10, 40, 600)]
    const fonts = brandFonts({ texts, fontLinks: ['https://fonts.googleapis.com/css2?family=Fraunces:wght@700'], webFonts: ['Inter'] })
    expect(fonts.map((f) => [f.family, f.roles, f.source, f.share])).toEqual([
      ['Inter', ['body'], 'web', 0.891],
      ['Fraunces', ['heading'], 'google', 0.109]
    ])
    expect(typeStyles(texts).map((s) => [s.tag, s.family, s.size, s.weight])).toEqual([
      ['h1', 'Fraunces', 48, 700],
      ['p', 'Inter', 16, 400]
    ])
  })

  it('makes a kit, and its CSS', () => {
    const scan: BrandScan = {
      url: 'https://exemple.fr',
      title: 'Exemple',
      themeColor: '#533afd',
      icons: [],
      logo: null,
      samples: [{ color: 'rgb(83, 58, 253)', use: 'background', weight: 10 }],
      variables: [],
      texts: [],
      fontLinks: [],
      webFonts: [],
      radii: [
        { value: '0px', count: 40 },
        { value: '8px', count: 12 }
      ],
      shadows: [{ value: 'none', count: 3 }],
      buttons: []
    }
    const data = { ...aggregateBrand(scan), logo: null, icon: null }
    expect(data.radii).toEqual(['8px'])
    expect(data.shadows).toEqual([])
    expect(data.themeColor).toBe('#533AFD')
    expect(kitToCss({ host: 'exemple.fr', data })).toBe('/* exemple.fr */\n:root {\n  --color-primary: #533AFD;\n  --radius-1: 8px;\n}\n')
  })
})

describe('colors store', () => {
  it('keeps one row per color, the last picked first, and favorites beyond the history', () => {
    const store = new ColorsStore(openMemoryDatabase())
    const red = store.pick('#ff0000')
    store.pick('rgb(0, 0, 255)')
    store.pick('#FF0000')
    expect(store.colors().map((c) => c.hex)).toEqual(['#FF0000', '#0000FF'])
    store.setFavorite(red.id, true)
    store.rename(red.id, '  Rouge  ')
    for (let i = 0; i < HISTORY_MAX + 5; i++) store.pick(`#00${String(i.toString(16)).padStart(2, '0')}00`.slice(0, 7))
    const colors = store.colors()
    expect(colors.filter((c) => !c.favorite)).toHaveLength(HISTORY_MAX)
    expect(colors.find((c) => c.favorite)).toMatchObject({ hex: '#FF0000', name: 'Rouge' })
    store.clearHistory()
    expect(store.colors().map((c) => c.hex)).toEqual(['#FF0000'])
  })

  it('files kits in folders, and keeps them when a folder goes', () => {
    const store = new ColorsStore(openMemoryDatabase())
    const data = { ...aggregateBrand({ url: '', title: '', themeColor: null, icons: [], logo: null, samples: [], variables: [], texts: [], fontLinks: [], webFonts: [], radii: [], shadows: [], buttons: [] }), logo: null, icon: null }
    const kit = store.addKit({ url: 'https://exemple.fr', title: '', host: 'exemple.fr', data, preview: null })
    expect(kit.title).toBe('exemple.fr')
    const folder = store.createFolder('Inspirations', '✨')
    expect(store.updateKit(kit.id, { folderId: folder.id, comment: 'Belle typo' })).toMatchObject({ folderId: folder.id, comment: 'Belle typo' })
    expect(store.updateKit(kit.id, { folderId: 'unknown' })?.folderId).toBeNull()
    store.updateKit(kit.id, { folderId: folder.id })
    store.removeFolder(folder.id)
    expect(store.kits()).toMatchObject([{ id: kit.id, folderId: null, comment: 'Belle typo' }])
    store.removeKit(kit.id)
    expect(store.kits()).toEqual([])
  })
})
