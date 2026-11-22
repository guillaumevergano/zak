import { app, crashReporter } from 'electron'

const REPO = 'https://github.com/guillaumevergano/zak'

/**
 * Crashes are recorded locally only (Chromium minidumps in the user data folder, under
 * « Crashpad »): Zak sends nothing on its own. « Signaler un problème » opens a GitHub issue
 * prefilled with what helps the most (version, system), for the user to complete and send.
 */
export function startCrashReporter(): void {
  crashReporter.start({ uploadToServer: false, compress: true })
}

export function bugReportUrl(): string {
  const body = [
    '**What happened?**',
    '',
    '',
    '**Steps to reproduce**',
    '1. ',
    '',
    '**Environment**',
    `- Zak ${app.getVersion()}`,
    `- ${osName()} ${process.getSystemVersion()} (${process.arch})`,
    `- Chromium ${process.versions.chrome}, Electron ${process.versions.electron}`
  ].join('\n')
  const params = new URLSearchParams({ labels: 'bug', body })
  return `${REPO}/issues/new?${params.toString()}`
}

export const HELP_URLS = {
  site: 'https://hellozak.com/',
  issues: `${REPO}/issues`,
  privacy: `${REPO}/blob/main/PRIVACY.md`
}

function osName(): string {
  return { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[process.platform as string] ?? process.platform
}
