import { describe, expect, it } from 'vitest'
import { iconPath, localize, optionsPage } from '../../src/main/extensions/manifest'

describe('extension manifest helpers', () => {
  it('localizes __MSG_ placeholders, case-insensitively, and keeps unknown ones', () => {
    const messages = { extName: { message: 'Dashlane' } }
    expect(localize('__MSG_extName__', messages)).toBe('Dashlane')
    expect(localize('__MSG_EXTNAME__ — gestionnaire', messages)).toBe('Dashlane — gestionnaire')
    expect(localize('__MSG_missing__', messages)).toBe('__MSG_missing__')
    expect(localize(undefined, messages)).toBe('')
  })

  it('picks the largest icon up to 128 px, then falls back to the toolbar action', () => {
    expect(iconPath({ icons: { '16': 'a.png', '128': 'c.png', '48': 'b.png', '256': 'd.png' } })).toBe('c.png')
    expect(iconPath({ icons: { '256': 'd.png' } })).toBe('d.png')
    expect(iconPath({ action: { default_icon: { '32': 'x.png' } } })).toBe('x.png')
    expect(iconPath({ browser_action: { default_icon: 'mv2.png' } })).toBe('mv2.png')
    expect(iconPath({})).toBeNull()
  })

  it('finds the options page of MV2 and MV3 manifests', () => {
    expect(optionsPage({ options_ui: { page: 'ui.html' }, options_page: 'old.html' })).toBe('ui.html')
    expect(optionsPage({ options_page: 'old.html' })).toBe('old.html')
    expect(optionsPage({})).toBeNull()
  })
})
