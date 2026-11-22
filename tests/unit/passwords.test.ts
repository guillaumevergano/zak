import { beforeEach, describe, expect, it } from 'vitest'
import { openMemoryDatabase } from '../../src/main/store/db'
import { PasswordStore, loginOrigin, type Cipher } from '../../src/main/passwords/PasswordStore'
import { parseCsv, parseLoginsCsv, toLoginsCsv } from '../../src/main/passwords/csv'

/** Reversible stand-in for safeStorage, that still never stores the plain text. */
const cipher: Cipher = {
  encrypt: (plain) => Buffer.from(plain, 'utf8').map((b) => b ^ 0x5a),
  decrypt: (data) => Buffer.from(data.map((b) => b ^ 0x5a)).toString('utf8')
}

let store: PasswordStore
beforeEach(() => {
  store = new PasswordStore(openMemoryDatabase(), cipher)
})

describe('PasswordStore', () => {
  it('saves one password per site and username, encrypted', () => {
    const id = store.save('https://site.test', 'ana', 's3cret', 1000)
    expect(store.list()).toEqual([{ id, origin: 'https://site.test', username: 'ana', updatedAt: 1000, usedAt: null }])
    expect(store.password(id)).toBe('s3cret')
    expect(store.check('https://site.test', 'ana', 's3cret')).toBe('saved')
    expect(store.check('https://site.test', 'ana', 'other')).toBe('update')
    expect(store.check('https://site.test', 'bob', 'x')).toBe('new')
    expect(store.save('https://site.test', 'ana', 'changed', 2000)).toBe(id)
    expect(store.password(id)).toBe('changed')
    expect(store.forOrigin('https://other.test')).toEqual([])
  })

  it('remembers « Jamais pour ce site » until a password is saved there', () => {
    store.never('https://site.test')
    expect(store.isNever('https://site.test')).toBe(true)
    store.save('https://site.test', 'ana', 'x')
    expect(store.isNever('https://site.test')).toBe(false)
  })

  it('imports and exports logins', () => {
    expect(store.importLogins([
      { url: 'https://a.test/login', username: 'ana', password: 'p1' },
      { url: 'ftp://nope', username: 'x', password: 'y' },
      { url: 'https://b.test', username: 'bob', password: '' }
    ])).toBe(1)
    expect(store.exportLogins()).toEqual([{ origin: 'https://a.test', username: 'ana', password: 'p1' }])
  })

  it('keys logins by origin', () => {
    expect(loginOrigin('https://www.site.test:8443/a?b')).toBe('https://www.site.test:8443')
    expect(loginOrigin('zak://settings')).toBeNull()
  })
})

describe('passwords CSV', () => {
  it('parses quoted fields with commas, quotes and line breaks', () => {
    expect(parseCsv('a,"b, c","d ""e""",\n"multi\nline",x\r\n')).toEqual([
      ['a', 'b, c', 'd "e"', ''],
      ['multi\nline', 'x']
    ])
  })

  it('reads the exports of Chrome, Safari, Firefox and Bitwarden', () => {
    const chrome = 'name,url,username,password,note\nsite.test,https://site.test/,ana,p1,\n'
    const safari = '﻿Title,URL,Username,Password,Notes,OTPAuth\nSite,https://site.test/,ana,p1,,\n'
    const firefox = '"url","username","password","httpRealm"\n"https://site.test","ana","p1",""\n'
    const bitwarden = 'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n,,login,Site,,,0,https://site.test/,ana,p1,\n'
    for (const csv of [chrome, safari, firefox, bitwarden]) {
      expect(parseLoginsCsv(csv)).toEqual([{ url: expect.stringMatching(/^https:\/\/site\.test\/?$/), username: 'ana', password: 'p1' }])
    }
    expect(() => parseLoginsCsv('a,b\n1,2\n')).toThrow(/mots de passe/)
  })

  it('exports in Chrome\'s format, which reads back', () => {
    const csv = toLoginsCsv([{ origin: 'https://site.test', username: 'a,b', password: 'p"1' }])
    expect(csv).toBe('name,url,username,password,note\nsite.test,https://site.test,"a,b","p""1",\n')
    expect(parseLoginsCsv(csv)).toEqual([{ url: 'https://site.test', username: 'a,b', password: 'p"1' }])
  })
})
