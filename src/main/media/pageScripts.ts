/**
 * Page side of the media controls (CLAUDE.md §6.2). The Media Session action handlers a site sets
 * (play, pause, previous, next: what the keyboard's media keys call) live in the page's own world,
 * and some players are never attached to the document (Spotify): a hook installed before the page
 * runs (CDP, main world, like the window.chrome shim) remembers both. The other scripts run in the
 * main world too, on demand, and read that record; without it (a page loaded before the hook)
 * they fall back on the document's media elements.
 */

const KEY = "Symbol.for('zak.media')"

/** Installed at document start. Its wrappers look native (toString), like the window.chrome shim's. */
export const MEDIA_HOOK = `(() => {
  const key = ${KEY}
  if (window[key] || typeof HTMLMediaElement === 'undefined') return
  const handlers = new Map()
  const elements = new Set()
  Object.defineProperty(window, key, { value: { handlers, elements } })
  const fakes = new WeakSet()
  const toString = Function.prototype.toString
  Function.prototype.toString = new Proxy(toString, {
    apply(target, self, args) {
      return fakes.has(self) ? 'function ' + self.name + '() { [native code] }' : Reflect.apply(target, self, args)
    }
  })
  fakes.add(Function.prototype.toString)
  const wrap = (proto, name, before) => {
    const original = proto[name]
    const wrapped = { [name](...args) { before(this, args); return original.apply(this, args) } }[name]
    fakes.add(wrapped)
    Object.defineProperty(proto, name, { ...Object.getOwnPropertyDescriptor(proto, name), value: wrapped })
  }
  if (typeof MediaSession !== 'undefined') {
    wrap(MediaSession.prototype, 'setActionHandler', (_session, [action, handler]) => {
      if (handler) handlers.set(action, handler)
      else handlers.delete(action)
    })
  }
  wrap(HTMLMediaElement.prototype, 'play', (element) => {
    for (const ref of elements) if (ref.deref() === element || !ref.deref()) elements.delete(ref)
    elements.add(new WeakRef(element))
  })
})()`

/** The page's media elements (attached or remembered), the one playing (or last played) first. */
const MEDIA = `
  const record = window[${KEY}] || { handlers: new Map(), elements: new Set() }
  const all = new Set(document.querySelectorAll('video, audio'))
  for (const ref of record.elements) {
    const element = ref.deref()
    if (element) all.add(element)
  }
  const media = [...all].filter((m) => m.currentSrc || m.srcObject)
  const playing = media.filter((m) => !m.paused && !m.ended)
  const started = media.filter((m) => m.currentTime > 0 && !m.ended)
  const main = playing[0] || started[0] || null
`

/** What is playing, as data (titles are the page's own text: shown as text, never as markup). */
export const STATE_SCRIPT = `(() => {
  ${MEDIA}
  const session = navigator.mediaSession
  const meta = session && session.metadata
  const artwork = meta && meta.artwork.length ? String(meta.artwork[meta.artwork.length - 1].src) : ''
  return {
    media: !!main || !!(meta && meta.title),
    playing: playing.length > 0 || (!!session && session.playbackState === 'playing'),
    title: meta ? String(meta.title) : '',
    artist: meta ? String(meta.artist) : '',
    artwork,
    volume: main ? main.volume : null,
    actions: [...record.handlers.keys()].map(String)
  }
})()`

/** Play, pause, previous or next: what the site declared, else the media elements themselves. */
export const actionScript = (action: 'play' | 'pause' | 'previoustrack' | 'nexttrack'): string => `(() => {
  ${MEDIA}
  const action = ${JSON.stringify(action)}
  const handler = record.handlers.get(action)
  if (handler) {
    handler({ action })
    return true
  }
  if (action === 'pause') playing.forEach((m) => m.pause())
  else if (action === 'play' && main) void main.play().catch(() => {})
  return action === 'play' || action === 'pause'
})()`

/** The player's volume (0–1), on every media element of the page. */
export const volumeScript = (volume: number): string => `(() => {
  ${MEDIA}
  for (const m of media) m.volume = ${Math.min(1, Math.max(0, volume))}
  return true
})()`
