import { describe, expect, it } from 'vitest'
import { Blocklist, findThreat } from '../../src/main/safety/blocklist'

const LIST = `! Title: Phishing URL Blocklist
! Expires: 12 hours
bad.example
||shared-host.example/victim-bank/login^$all
||0.gravatar.com/avatar/abc?s=96&amp;d=identicon^$all
||whole.example^$all
`

describe('Blocklist', () => {
  const list = Blocklist.parse(LIST)

  it('blocks a listed host and its subdomains, not its parent', () => {
    expect(list.matches('https://bad.example/')).toBe(true)
    expect(list.matches('http://login.bad.example/x?y=1')).toBe(true)
    expect(list.matches('https://example/')).toBe(false)
    expect(list.matches('https://notbad.example/')).toBe(false)
    expect(list.matches('https://whole.example/anything')).toBe(true)
  })

  it('blocks only the listed page on a shared host', () => {
    expect(list.matches('https://shared-host.example/victim-bank/login')).toBe(true)
    expect(list.matches('https://shared-host.example/victim-bank/login.php?step=2')).toBe(true)
    expect(list.matches('https://shared-host.example/')).toBe(false)
    expect(list.matches('https://shared-host.example/other')).toBe(false)
  })

  it('decodes &amp; in listed URLs', () => {
    expect(list.matches('https://0.gravatar.com/avatar/abc?s=96&d=identicon')).toBe(true)
  })

  it('ignores comments, other schemes and garbage', () => {
    expect(list.size).toBe(4)
    expect(list.matches('zak://newtab')).toBe(false)
    expect(list.matches('not a url')).toBe(false)
  })

  it('names the threat, phishing first', () => {
    const malware = Blocklist.parse('bad.example\nmalware.example\n')
    expect(findThreat({ phishing: list, malware }, 'https://bad.example/')).toBe('phishing')
    expect(findThreat({ phishing: list, malware }, 'https://malware.example/')).toBe('malware')
    expect(findThreat({ phishing: list, malware }, 'https://fine.example/')).toBeNull()
  })
})
