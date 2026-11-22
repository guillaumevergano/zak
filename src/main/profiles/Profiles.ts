import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProfileInfo } from '@shared/types'
import { t } from '@shared/i18n'

/**
 * Profiles (like Chrome's « Personne »): each one is a separate Zak with its own user data folder,
 * so history, favorites, passwords, cookies and extensions never mix. The default profile is the
 * usual folder (~/Library/Application Support/Zak); the others live in « Zak Profiles/<id> »,
 * next to the list of profiles (profiles.json). Each runs in its own process, launched with
 * `--zak-profile=<id>`: Chromium allows one process per user data folder.
 */
export const DEFAULT_PROFILE_ID = 'default'
const ARG = '--zak-profile='

export class Profiles {
  /** `appData`: the folder holding Zak's (app.getPath('appData'), or a test folder). */
  constructor(private readonly root: string) {}

  /** The profile asked on the command line, or the default one. */
  static fromArgv(argv: string[]): string {
    const arg = argv.find((a) => a.startsWith(ARG))
    const id = arg?.slice(ARG.length) ?? DEFAULT_PROFILE_ID
    return /^[a-z0-9-]{1,64}$/.test(id) ? id : DEFAULT_PROFILE_ID
  }

  /** User data folder of a profile other than the default one. */
  dir(id: string): string {
    return join(this.root, id)
  }

  list(): ProfileInfo[] {
    let saved: ProfileInfo[] = []
    try {
      saved = JSON.parse(readFileSync(this.file(), 'utf8')) as ProfileInfo[]
    } catch {
      /* none yet */
    }
    const others = saved.filter((p) => p.id !== DEFAULT_PROFILE_ID && existsSync(this.dir(p.id)))
    const main = saved.find((p) => p.id === DEFAULT_PROFILE_ID) ?? { id: DEFAULT_PROFILE_ID, name: t('Perso'), emoji: '🏠' }
    return [main, ...others]
  }

  get(id: string): ProfileInfo | undefined {
    return this.list().find((p) => p.id === id)
  }

  create(name: string, emoji: string): ProfileInfo {
    const profile = { id: randomUUID(), name: name.trim() || t('Profil'), emoji: emoji || '🙂' }
    mkdirSync(this.dir(profile.id), { recursive: true })
    this.save([...this.list(), profile])
    return profile
  }

  update(id: string, changes: { name?: string; emoji?: string }): void {
    this.save(this.list().map((p) => (p.id === id ? { ...p, ...changes, name: (changes.name ?? p.name).trim() || p.name } : p)))
  }

  /** Deletes a profile and all its data (not the default one, nor the one running). */
  remove(id: string, current: string): void {
    if (id === DEFAULT_PROFILE_ID || id === current) throw new Error(t('Ce profil ne peut pas être supprimé'))
    this.save(this.list().filter((p) => p.id !== id))
    rmSync(this.dir(id), { recursive: true, force: true })
  }

  /**
   * Opens a profile: a new Zak process, or the running one (which then shows a window: it gets
   * our arguments through `second-instance`).
   */
  open(id: string, launch: { execPath: string; appPath: string | null; env: NodeJS.ProcessEnv }): void {
    const args = [...(launch.appPath ? [launch.appPath] : []), `${ARG}${id}`]
    spawn(launch.execPath, args, { detached: true, stdio: 'ignore', env: launch.env }).unref()
  }

  private file(): string {
    return join(this.root, 'profiles.json')
  }

  private save(profiles: ProfileInfo[]): void {
    mkdirSync(this.root, { recursive: true })
    writeFileSync(this.file(), JSON.stringify(profiles, null, 2))
  }
}
