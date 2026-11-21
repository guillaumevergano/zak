import type { Session, WebContents } from 'electron'
import type { PermissionKind } from '@shared/types'
import type { SitesStore } from '../store/sites'
import type { BrowserWindowHandle, WindowManager } from '../windows/WindowManager'

/** Device APIs nothing here needs: refused without asking. */
const DENIED = new Set(['hid', 'serial', 'usb', 'midiSysex', 'display-capture'])

const PROMPT_WIDTH = 380
const PROMPT_HEIGHT = 150

interface Pending {
  id: number
  handle: BrowserWindowHandle
  wc: WebContents
  origin: string
  kinds: PermissionKind[]
  /** Private window: the answer is kept in memory for that window's session only. */
  memory: Map<string, boolean> | null
  callback: (granted: boolean) => void
}

/** What an Electron permission request asks for, in our terms (none: not a prompted permission). */
export function kindsOf(permission: string, mediaTypes: readonly string[] = []): PermissionKind[] {
  switch (permission) {
    case 'notifications':
      return ['notifications']
    case 'geolocation':
      return ['geolocation']
    case 'clipboard-read':
      return ['clipboard']
    case 'media': {
      const kinds: PermissionKind[] = []
      if (mediaTypes.includes('video')) kinds.push('camera')
      if (mediaTypes.includes('audio')) kinds.push('microphone')
      return kinds.length > 0 ? kinds : ['camera', 'microphone']
    }
    default:
      return []
  }
}

const originOf = (url: string): string | null => {
  try {
    const origin = new URL(url).origin
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

/**
 * Site permissions (CLAUDE.md §6.7): notifications, camera, microphone, location and clipboard
 * reading are asked in a prompt under the omnibox and remembered per origin (zak://settings
 * lists them). Full screen and other harmless permissions are granted like Chrome does.
 * Private windows remember answers only until they close.
 */
export class PermissionsHandler {
  private nextId = 1
  private queue: Pending[] = []
  private privateMemory = new WeakMap<Session, Map<string, boolean>>()

  constructor(
    private readonly sites: SitesStore,
    private readonly windows: WindowManager
  ) {
    // A prompt hidden by a tab switch stays pending, and comes back with its tab (like Chrome).
    windows.on('overlay-hidden', (handle, request) => {
      if (request.kind === 'permission') this.showNext(handle)
    })
    windows.on('tab-selected', (wc) => {
      const handle = windows.fromTab(wc)
      if (handle && !handle.overlay.showing()) this.showNext(handle)
    })
  }

  /** Installs the request and check handlers on a browsing session. */
  attach(ses: Session, isPrivate: boolean): void {
    if (isPrivate) this.privateMemory.set(ses, new Map())
    const memory = isPrivate ? this.privateMemory.get(ses)! : null

    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      if (DENIED.has(permission)) return callback(false)
      const kinds = kindsOf(permission, 'mediaTypes' in details ? (details.mediaTypes ?? []) : [])
      if (kinds.length === 0) return callback(true)
      const origin = originOf(details.requestingUrl ?? wc.getURL())
      const handle = this.windows.fromTab(wc)
      if (!origin || !handle) return callback(false)

      const known = kinds.map((k) => this.decision(memory, origin, k))
      if (known.every((d) => d === true)) return callback(true)
      if (known.some((d) => d === false)) return callback(false)

      this.queue.push({ id: this.nextId++, handle, wc, origin, kinds, memory, callback })
      wc.once('destroyed', () => {
        const pending = this.queue.find((p) => p.wc === wc)
        if (pending) this.settle(pending, false, false)
      })
      this.showNext(handle)
    })

    // Synchronous checks (Notification.permission, navigator.permissions.query…).
    ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
      const kinds = kindsOf(permission, 'mediaType' in details && details.mediaType ? [details.mediaType] : [])
      if (kinds.length === 0) return !DENIED.has(permission)
      const origin = originOf(requestingOrigin)
      return origin !== null && kinds.every((k) => this.decision(memory, origin, k) === true)
    })
  }

  /** `null`: the prompt was dismissed (Esc, ×): refused this time, not remembered. */
  answer(requestId: number, granted: boolean | null): void {
    const pending = this.queue.find((p) => p.id === requestId)
    if (!pending) return
    this.settle(pending, granted === true, granted !== null)
    // Hiding the prompt shows the next one (overlay-hidden).
    pending.handle.overlay.close()
  }

  private decision(memory: Map<string, boolean> | null, origin: string, kind: PermissionKind): boolean | undefined {
    return memory ? memory.get(`${origin} ${kind}`) : this.sites.permission(origin, kind)
  }

  private settle(pending: Pending, granted: boolean, remember: boolean): void {
    this.queue = this.queue.filter((p) => p !== pending)
    if (remember) {
      for (const kind of pending.kinds) {
        if (pending.memory) pending.memory.set(`${pending.origin} ${kind}`, granted)
        else this.sites.setPermission(pending.origin, kind, granted)
      }
    }
    pending.callback(granted)
  }

  /** Shows the first pending prompt of the tab on screen, if any. */
  private showNext(handle: BrowserWindowHandle): void {
    if (handle.window.isDestroyed() || handle.overlay.showing()) return
    const next = this.queue.find((p) => p.handle === handle && !p.wc.isDestroyed() && p.wc.id === handle.tabs.getActiveId())
    if (!next) return
    const { top, left } = handle.tabs.getInsets()
    void handle.overlay.open({
      kind: 'permission',
      requestId: next.id,
      origin: next.origin,
      permission: next.kinds.includes('camera') ? 'camera' : next.kinds[0]!,
      frame: { x: left + 12, y: top + 4, width: PROMPT_WIDTH, height: PROMPT_HEIGHT }
    })
  }
}
