import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE_ID, Profiles } from '../../src/main/profiles/Profiles'

const fresh = (): Profiles => new Profiles(mkdtempSync(join(tmpdir(), 'zak-profiles-')))

describe('Profiles', () => {
  it('always has the default profile first', () => {
    expect(fresh().list()).toEqual([{ id: DEFAULT_PROFILE_ID, name: 'Perso', emoji: '🏠' }])
  })

  it('creates, renames and deletes profiles, each with its own folder', () => {
    const profiles = fresh()
    const work = profiles.create(' Travail ', '💼')
    expect(work.name).toBe('Travail')
    expect(existsSync(profiles.dir(work.id))).toBe(true)
    profiles.update(work.id, { name: 'Boulot' })
    expect(profiles.list().map((p) => p.name)).toEqual(['Perso', 'Boulot'])
    expect(() => profiles.remove(work.id, work.id)).toThrow()
    expect(() => profiles.remove(DEFAULT_PROFILE_ID, work.id)).toThrow()
    profiles.remove(work.id, DEFAULT_PROFILE_ID)
    expect(existsSync(profiles.dir(work.id))).toBe(false)
    expect(profiles.list()).toHaveLength(1)
  })

  it('reads the profile from the command line, ignoring anything odd', () => {
    expect(Profiles.fromArgv(['zak', '--zak-profile=4f1c-2a'])).toBe('4f1c-2a')
    expect(Profiles.fromArgv(['zak'])).toBe(DEFAULT_PROFILE_ID)
    expect(Profiles.fromArgv(['zak', '--zak-profile=../../etc'])).toBe(DEFAULT_PROFILE_ID)
  })
})
