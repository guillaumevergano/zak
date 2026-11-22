import { randomUUID } from 'node:crypto'
import { app, session, type Session } from 'electron'
import { chromeUserAgent } from '../userAgent'

export const MAIN_PARTITION = 'persist:main'
export const PRIVATE_PARTITION_PREFIX = 'private-'

/**
 * Owns Electron sessions: the persistent browsing session, and one in-memory session per private
 * window (CLAUDE.md §6.3), wiped when that window closes.
 *
 * Avoid session.webRequest listeners on the main session: Electron gives them precedence over
 * extensions' chrome.webRequest handlers for the same events. The only exception is the
 * built-in ad blocker (adblock/AdBlocker.ts), since no extension-based blocker works.
 */
export class SessionManager {
  private mainSession: Session | null = null
  private readonly privateSessions = new Set<Session>()

  /** Set up once by index.ts: what every browsing session gets (internal pages, ad blocker…). */
  onPrivateSession: ((ses: Session) => void) | null = null

  getMain(): Session {
    if (!this.mainSession) {
      this.mainSession = session.fromPartition(MAIN_PARTITION)
      configure(this.mainSession)
    }
    return this.mainSession
  }

  /** A fresh in-memory session (no `persist:` prefix): cookies, cache and storage never touch the disk. */
  createPrivate(): Session {
    const ses = session.fromPartition(`${PRIVATE_PARTITION_PREFIX}${randomUUID()}`)
    configure(ses)
    this.privateSessions.add(ses)
    this.onPrivateSession?.(ses)
    return ses
  }

  isPrivate(ses: Session): boolean {
    return this.privateSessions.has(ses)
  }

  /**
   * Electron keeps an in-memory partition alive until the app quits: clear it now so nothing of
   * the private window survives it. Its partition name is never reused.
   */
  async destroyPrivate(ses: Session): Promise<void> {
    if (!this.privateSessions.delete(ses)) return
    await Promise.allSettled([
      ses.clearStorageData(),
      ses.clearCache(),
      ses.clearAuthCache(),
      ses.clearHostResolverCache(),
      ses.closeAllConnections()
    ])
  }
}

function configure(ses: Session): void {
  ses.setUserAgent(chromeUserAgent())
  // Spell check: macOS uses the system's checker (every language it knows). Elsewhere Chromium
  // needs the languages: the system's preferred ones it has a dictionary for, French by default.
  if (process.platform !== 'darwin') {
    const available = new Set(ses.availableSpellCheckerLanguages)
    const wanted = app.getPreferredSystemLanguages().flatMap((tag) => [tag, tag.split('-')[0]!])
    const languages = [...new Set(wanted.filter((tag) => available.has(tag)))].slice(0, 3)
    ses.setSpellCheckerLanguages(languages.length > 0 ? languages : available.has('fr') ? ['fr'] : [])
  }
  // Permissions: see permissions/PermissionsHandler.ts, attached through onSession hooks.
}
