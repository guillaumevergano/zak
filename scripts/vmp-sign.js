/**
 * castLabs VMP (Verified Media Path) signing with EVS — CLAUDE.md §6.6 / §8.
 *
 * Netflix, Prime Video, Canal+… refuse playback (e.g. M7121-1331) unless the packaged app
 * carries a production VMP signature. castLabs binaries are only dev-signed.
 *
 * Order matters:
 *   macOS   → VMP sign BEFORE Apple codesign  → electron-builder `afterPack` (scripts/hooks/after-pack.js)
 *   Windows → VMP sign AFTER Authenticode     → electron-builder `afterSign` (scripts/hooks/after-sign.js)
 *
 * Prerequisites: castlabs-evs and a (free) EVS account. Homebrew Python refuses global pip installs,
 * so the local setup uses a project venv: `python3 -m venv .venv && .venv/bin/pip install castlabs-evs`
 * (picked up automatically; override with PYTHON=…).
 * Credentials: never committed. Either
 *   - locally, once: `python3 -m castlabs_evs.account reauth` (cached in ~/.config/evs), or
 *   - in CI: env EVS_ACCOUNT + EVS_PASSWD (passed to EVS non-interactively).
 * Set ZAK_SKIP_VMP=1 to skip (local smoke builds only — DRM will NOT work in such builds).
 *
 * Manual use: node scripts/vmp-sign.js <appOutDir>
 */
const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

function python() {
  if (process.env.PYTHON) return process.env.PYTHON
  const venv = join(__dirname, '..', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  if (existsSync(venv)) return venv
  return process.platform === 'win32' ? 'python' : 'python3'
}

function signVmp(appOutDir) {
  if (process.env.ZAK_SKIP_VMP === '1') {
    console.warn('  • VMP signing SKIPPED (ZAK_SKIP_VMP=1) — DRM services will refuse this build')
    return
  }

  const args = ['-m', 'castlabs_evs.vmp']
  const { EVS_ACCOUNT, EVS_PASSWD } = process.env
  const ci = Boolean(EVS_ACCOUNT && EVS_PASSWD)
  if (ci || !process.stdin.isTTY) args.push('-n')
  args.push('sign-pkg')
  if (ci) args.push('-A', EVS_ACCOUNT, '-P', EVS_PASSWD)
  args.push(appOutDir)

  console.log(`  • VMP signing ${appOutDir}`)
  const result = spawnSync(python(), args, { stdio: 'inherit' })
  if (result.error) {
    throw new Error(`VMP signing failed to start (${result.error.message}). Install EVS: python3 -m pip install castlabs-evs`)
  }
  if (result.status !== 0) {
    throw new Error(`VMP signing failed (exit ${result.status}). Run "python3 -m castlabs_evs.account reauth" or set EVS_ACCOUNT/EVS_PASSWD.`)
  }

  // Sanity check: verify what we just signed.
  const verify = spawnSync(python(), ['-m', 'castlabs_evs.vmp', 'verify-pkg', appOutDir], { stdio: 'inherit' })
  if (verify.status !== 0) throw new Error('VMP verify-pkg failed after signing')
}

module.exports = { signVmp }

if (require.main === module) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('Usage: node scripts/vmp-sign.js <appOutDir>')
    process.exit(1)
  }
  signVmp(dir)
}
