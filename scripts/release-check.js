/**
 * Release preflight (CLAUDE.md §6.6, §8): tells what is missing before a signed build that DRM
 * services (Netflix, Prime Video, Canal+…) accept. Never prints secrets.
 *
 *   npm run release:check        # report only
 *   npm run release:mac          # check, then build, sign (VMP + Apple) and notarize
 */
const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'
let missing = 0

function report(ok, label, fix) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) {
    missing++
    for (const line of fix) console.log(`    → ${line}`)
  }
}

function python() {
  if (process.env.PYTHON) return process.env.PYTHON
  const venv = join(__dirname, '..', '.venv', isWin ? 'Scripts/python.exe' : 'bin/python')
  return existsSync(venv) ? venv : isWin ? 'python' : 'python3'
}

// 1. castLabs EVS (VMP signing).
const evs = spawnSync(python(), ['-c', 'import castlabs_evs'], { encoding: 'utf8' })
report(evs.status === 0, 'castlabs-evs installé', [
  'python3 -m venv .venv && .venv/bin/pip install castlabs-evs'
])
if (evs.status === 0) {
  const ci = Boolean(process.env.EVS_ACCOUNT && process.env.EVS_PASSWD)
  // `refresh` renews the cached token: it fails when there is no account or no cached login.
  const auth = ci
    ? { status: 0 }
    : spawnSync(python(), ['-m', 'castlabs_evs.account', '-n', 'refresh'], { encoding: 'utf8', timeout: 60_000 })
  report(auth.status === 0, `compte EVS ${ci ? '(EVS_ACCOUNT / EVS_PASSWD)' : '(jeton en cache)'}`, [
    'Une fois : .venv/bin/python -m castlabs_evs.account signup   (compte gratuit, e-mail de confirmation)',
    'puis      : .venv/bin/python -m castlabs_evs.account reauth',
    'En CI : secrets EVS_ACCOUNT et EVS_PASSWD'
  ])
}

// 2. Code signing.
if (isMac) {
  const ids = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
  const hasDevId = /Developer ID Application/.test(ids.stdout ?? '') || Boolean(process.env.CSC_LINK)
  report(hasDevId, 'certificat « Developer ID Application » (trousseau ou CSC_LINK)', [
    'developer.apple.com → Certificates → Developer ID Application (compte Apple Developer payant)',
    'Importer le .p12 dans le trousseau, ou exporter CSC_LINK + CSC_KEY_PASSWORD'
  ])
  const notarize =
    Boolean(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) ||
    Boolean(process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER)
  report(notarize, 'identifiants de notarisation (APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID)', [
    'appleid.apple.com → Mots de passe pour app → générer un mot de passe pour « Zak notarisation »',
    'export APPLE_ID=… APPLE_APP_SPECIFIC_PASSWORD=… APPLE_TEAM_ID=…'
  ])
} else if (isWin) {
  report(Boolean(process.env.CSC_LINK), 'certificat Authenticode (CSC_LINK + CSC_KEY_PASSWORD)', [
    'Recommandé pour VMP sous Windows (CLAUDE.md §6.6)'
  ])
}

console.log(missing === 0 ? '\nPrêt pour un build signé.' : `\n${missing} élément(s) manquant(s) : le build ne sera pas accepté par Netflix & co.`)
process.exit(missing === 0 ? 0 : 1)
