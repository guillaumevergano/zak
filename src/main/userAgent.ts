import { release } from 'node:os'


/**
 * Standard Chrome user agent, without the `Electron/x` and app-name tokens that Electron adds.
 * Google sign-in (and Dashlane / Loom / Workspace SSO behind it) rejects "embedded browsers".
 * Chrome itself sends a reduced UA: only the major version, followed by `.0.0.0`.
 */
export function chromeUserAgent(): string {
  const major = process.versions.chrome.split('.')[0]
  return `Mozilla/5.0 (${platformToken()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
}

function platformToken(): string {
  switch (process.platform) {
    case 'darwin':
      return 'Macintosh; Intel Mac OS X 10_15_7'
    case 'win32':
      return 'Windows NT 10.0; Win64; x64'
    default:
      return 'X11; Linux x86_64'
  }
}

/**
 * Client Hints identical to Google Chrome. Electron only advertises `Chromium` in
 * `navigator.userAgentData` and the `Sec-CH-UA*` headers, which Google sign-in uses to flag
 * embedded browsers. Applied per webContents through the DevTools protocol
 * (Emulation.setUserAgentOverride) because Electron has no API for UA brands — and without
 * session.webRequest, which would break chrome.webRequest for extensions.
 */
export async function applyChromeIdentity(wc: Electron.WebContents): Promise<void> {
  const full = process.versions.chrome
  const major = full.split('.')[0]
  const brands = [
    { brand: 'Google Chrome', version: major },
    { brand: 'Chromium', version: major },
    { brand: 'Not_A Brand', version: '24' }
  ]
  const fullVersionList = brands.map((b) => ({ brand: b.brand, version: b.version === major ? full : '24.0.0.0' }))
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
    await wc.debugger.sendCommand('Emulation.setUserAgentOverride', {
      userAgent: chromeUserAgent(),
      acceptLanguage: undefined,
      platform: navigatorPlatform(),
      userAgentMetadata: {
        brands,
        fullVersionList,
        fullVersion: full,
        platform: chPlatform(),
        platformVersion: chPlatformVersion(),
        architecture: process.arch.startsWith('arm') ? 'arm' : 'x86',
        model: '',
        mobile: false,
        bitness: '64',
        wow64: false
      }
    })
  } catch (err) {
    console.warn('[ua] could not apply Chrome client hints', err)
  }
}

function navigatorPlatform(): string {
  return process.platform === 'darwin' ? 'MacIntel' : process.platform === 'win32' ? 'Win32' : 'Linux x86_64'
}

function chPlatform(): string {
  return process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux'
}

function chPlatformVersion(): string {
  if (process.platform === 'darwin') {
    // e.g. Darwin 25.x → macOS 26.x
    const darwinMajor = Number(release().split('.')[0])
    return `${darwinMajor + 1}.0.0`
  }
  return process.platform === 'win32' ? '15.0.0' : '6.0.0'
}

/**
 * Electron's `window.chrome` only has `cast`; Google Chrome exposes `loadTimes`, `csi` and `app`.
 * Their absence is a classic "embedded browser" signal used by Google sign-in's checks.
 * Installed in the main world before any page script, with native-looking toString().
 * (A Firefox UA on accounts.google.com was tried too and is rejected the same way.)
 */
const CHROME_OBJECT_SHIM = `(() => {
  const c = window.chrome || {}
  if (c.app && c.csi && c.loadTimes) return
  const fakes = new WeakSet()
  const native = (name, fn) => { Object.defineProperty(fn, 'name', { value: name }); fakes.add(fn); return fn }
  const toString = Function.prototype.toString
  Function.prototype.toString = new Proxy(toString, {
    apply(target, self, args) {
      return fakes.has(self) ? 'function ' + self.name + '() { [native code] }' : Reflect.apply(target, self, args)
    }
  })
  fakes.add(Function.prototype.toString)
  const t0 = performance.timeOrigin
  const nav = () => performance.getEntriesByType('navigation')[0] || {}
  c.loadTimes = native('loadTimes', function () {
    const n = nav(), proto = n.nextHopProtocol || 'h2'
    return {
      requestTime: t0 / 1000, startLoadTime: t0 / 1000,
      commitLoadTime: (t0 + (n.responseStart || 0)) / 1000,
      finishDocumentLoadTime: (t0 + (n.domContentLoadedEventEnd || 0)) / 1000,
      finishLoadTime: (t0 + (n.loadEventEnd || 0)) / 1000,
      firstPaintTime: (t0 + (n.responseEnd || 0)) / 1000, firstPaintAfterLoadTime: 0,
      navigationType: 'Other', wasFetchedViaSpdy: proto === 'h2', wasNpnNegotiated: true,
      npnNegotiatedProtocol: proto, wasAlternateProtocolAvailable: false, connectionInfo: proto
    }
  })
  c.csi = native('csi', function () {
    const n = nav()
    return { startE: t0, onloadT: t0 + (n.domContentLoadedEventEnd || 0), pageT: performance.now(), tran: 15 }
  })
  c.app = {
    isInstalled: false,
    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
    RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
    getDetails: native('getDetails', function () { return null }),
    getIsInstalled: native('getIsInstalled', function () { return false }),
    installState: native('installState', function (cb) { if (cb) cb('not_installed') }),
    runningState: native('runningState', function () { return 'cannot_run' })
  }
  if (!window.chrome) Object.defineProperty(window, 'chrome', { value: c, writable: true, enumerable: true, configurable: false })
})()`

/**
 * CDP setups in flight. Electron spins at 100 % CPU when a page is destroyed (tab closed, app
 * quitting) while one of its CDP commands is pending: callers wait for these to settle first.
 */
const pending = new Set<Promise<void>>()

/** Resolves once no identity setup is in flight (or after `timeoutMs`). */
export function identitySettled(timeoutMs = 2000): Promise<void> {
  if (pending.size === 0) return Promise.resolve()
  return Promise.race([
    Promise.allSettled([...pending]).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
  ])
}

/** Registers a setup that sends CDP commands (see `pending`); never rejects. */
export function trackIdentitySetup(setup: Promise<unknown>): Promise<void> {
  const run: Promise<void> = setup.then(
    () => undefined,
    () => undefined
  ).finally(() => pending.delete(run))
  pending.add(run)
  return run
}

/** Chrome identity (UA + Client Hints) and `window.chrome` shim for a tab or popup. */
export async function manageIdentity(wc: Electron.WebContents): Promise<void> {
  await applyChromeIdentity(wc)
  try {
    await wc.debugger.sendCommand('Page.enable')
    await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: CHROME_OBJECT_SHIM })
  } catch (err) {
    console.warn('[ua] could not install window.chrome shim', err)
  }
}
