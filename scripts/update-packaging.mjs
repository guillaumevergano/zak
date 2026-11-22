#!/usr/bin/env node
/**
 * After a release: fills packaging/homebrew/zak.rb and packaging/winget/*.yaml with the version
 * and the SHA-256 of the published files, ready to copy to the Homebrew tap and to winget-pkgs
 * (docs/RELEASE.md, « Homebrew et winget »).
 *
 *   node scripts/update-packaging.mjs            # version of package.json
 *   node scripts/update-packaging.mjs 0.2.0
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const version = process.argv[2] ?? JSON.parse(readFileSync('package.json', 'utf8')).version
const base = `https://github.com/guillaumevergano/zak/releases/download/v${version}`

async function sha256(file) {
  const response = await fetch(`${base}/${file}`)
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status} (is v${version} published?)`)
  return createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')
}

const [arm, intel, win] = await Promise.all([sha256('Zak-mac-arm64.dmg'), sha256('Zak-mac-x64.dmg'), sha256('Zak-Setup-x64.exe')])

const cask = 'packaging/homebrew/zak.rb'
writeFileSync(
  cask,
  readFileSync(cask, 'utf8')
    .replace(/version "[^"]*"/, `version "${version}"`)
    .replace(/sha256 arm:\s+"[0-9a-f]+",\s+intel: "[0-9a-f]+"/, `sha256 arm:   "${arm}",\n         intel: "${intel}"`)
)

for (const file of ['Zak.Zak.yaml', 'Zak.Zak.installer.yaml', 'Zak.Zak.locale.en-US.yaml']) {
  const path = `packaging/winget/${file}`
  writeFileSync(
    path,
    readFileSync(path, 'utf8')
      .replace(/PackageVersion: .*/, `PackageVersion: ${version}`)
      .replace(/download\/v[^/]+\//, `download/v${version}/`)
      .replace(/InstallerSha256: [0-9a-fA-F]+/, `InstallerSha256: ${win.toUpperCase()}`)
  )
}
console.log(`packaging/ updated for ${version}: mac arm64 ${arm}, mac x64 ${intel}, windows ${win}`)
