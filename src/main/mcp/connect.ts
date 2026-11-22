import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AgentId, AgentStatus } from '@shared/types'
import { t } from '@shared/i18n'
import { BRIDGE_SOURCE } from './bridge'

/**
 * « Connecter à Claude Code / Codex / Claude Desktop » in one click, without a terminal: Zak adds
 * itself to the agent's own configuration as a stdio MCP server — its bridge (bridge.ts), run by
 * Zak's executable as Node. The configuration holds no secret: the bridge reads the port and token
 * from the connection file Zak keeps up to date while the server runs.
 */
export interface Launcher {
  command: string
  args: string[]
  env: Record<string, string>
}

export const SERVER_NAME = 'zak'

/** Where Zak writes its bridge and connection file (the profile folder). */
export function bridgePaths(userData: string): { bridge: string; connection: string } {
  return { bridge: join(userData, 'mcp-bridge.cjs'), connection: join(userData, 'mcp-connection.json') }
}

export function writeBridge(userData: string): void {
  const { bridge } = bridgePaths(userData)
  if (!existsSync(bridge) || readFileSync(bridge, 'utf8') !== BRIDGE_SOURCE) writeFileSync(bridge, BRIDGE_SOURCE)
}

/** Kept in sync with the server: the port and token while it runs, nothing when it is off. */
export function writeConnection(userData: string, connection: { port: number; token: string } | null): void {
  const { connection: file } = bridgePaths(userData)
  if (connection) writeFileSync(file, JSON.stringify(connection), { mode: 0o600 })
  else rmSync(file, { force: true })
}

/** How an agent starts the bridge: Zak's executable as Node (in development: Electron itself). */
export function launcher(execPath: string, userData: string): Launcher {
  const { bridge, connection } = bridgePaths(userData)
  return { command: execPath, args: [bridge, connection], env: { ELECTRON_RUN_AS_NODE: '1' } }
}

// ── Codex: ~/.codex/config.toml ────────────────────────────────────────────────────────────────

const tomlString = (s: string): string => JSON.stringify(s) // TOML basic strings use the same escapes

/** config.toml with our [mcp_servers.zak] table (and its sub-tables) replaced or added. */
export function withCodexServer(toml: string, run: Launcher): string {
  const kept: string[] = []
  let skipping = false
  for (const line of toml.split('\n')) {
    const header = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/.exec(line)
    if (header) skipping = header[1] === `mcp_servers.${SERVER_NAME}` || header[1]!.startsWith(`mcp_servers.${SERVER_NAME}.`)
    if (!skipping) kept.push(line)
  }
  const env = Object.entries(run.env)
    .map(([k, v]) => `${k} = ${tomlString(v)}`)
    .join(', ')
  const block = [
    `[mcp_servers.${SERVER_NAME}]`,
    `# Zak (hellozak.com) — added by Zak's settings: « Connecter à Codex ».`,
    `command = ${tomlString(run.command)}`,
    `args = [${run.args.map(tomlString).join(', ')}]`,
    `env = { ${env} }`
  ].join('\n')
  const base = kept.join('\n').replace(/\s+$/, '')
  return `${base ? `${base}\n\n` : ''}${block}\n`
}

export function codexHasServer(toml: string): boolean {
  return new RegExp(`^\\s*\\[mcp_servers\\.${SERVER_NAME}\\]`, 'm').test(toml)
}

// ── Claude Desktop: claude_desktop_config.json ─────────────────────────────────────────────────

export function withDesktopServer(json: string, run: Launcher): string {
  const config = json.trim() ? (JSON.parse(json) as { mcpServers?: Record<string, unknown> }) : {}
  config.mcpServers = { ...(config.mcpServers ?? {}), [SERVER_NAME]: { command: run.command, args: run.args, env: run.env } }
  return `${JSON.stringify(config, null, 2)}\n`
}

// ── Where each agent keeps its configuration ───────────────────────────────────────────────────

export interface AgentPaths {
  home: string
  platform: NodeJS.Platform
  appData: string
}

export function codexConfigPath(p: AgentPaths): string {
  return join(process.env['CODEX_HOME'] ?? join(p.home, '.codex'), 'config.toml')
}

export function desktopConfigPath(p: AgentPaths): string {
  return join(p.appData, 'Claude', 'claude_desktop_config.json')
}

/** The `claude` command: GUI apps don't get the shell's PATH, so look where installers put it. */
export function findClaudeCli(p: AgentPaths): string | null {
  const candidates =
    p.platform === 'win32'
      ? [join(p.home, '.local', 'bin', 'claude.exe'), join(p.appData, 'npm', 'claude.cmd')]
      : [
          join(p.home, '.local', 'bin', 'claude'),
          join(p.home, '.claude', 'local', 'claude'),
          '/opt/homebrew/bin/claude',
          '/usr/local/bin/claude',
          join(p.home, '.npm-global', 'bin', 'claude')
        ]
  return candidates.find((c) => existsSync(c)) ?? null
}

export function agentStatus(p: AgentPaths): AgentStatus[] {
  const codexFile = codexConfigPath(p)
  const desktopFile = desktopConfigPath(p)
  const read = (file: string): string => {
    try {
      return readFileSync(file, 'utf8')
    } catch {
      return ''
    }
  }
  const desktop = read(desktopFile)
  let desktopConnected = false
  try {
    desktopConnected = Boolean((JSON.parse(desktop || '{}') as { mcpServers?: Record<string, unknown> }).mcpServers?.[SERVER_NAME])
  } catch {
    /* unreadable: not ours to fix */
  }
  return [
    { id: 'claude-code', installed: findClaudeCli(p) !== null, connected: null },
    { id: 'codex', installed: existsSync(dirname(codexFile)), connected: codexHasServer(read(codexFile)) },
    { id: 'claude-desktop', installed: existsSync(dirname(desktopFile)), connected: desktopConnected }
  ]
}

/** Adds Zak to the agent. Throws a readable message when it can't. */
export async function connectAgent(agent: AgentId, p: AgentPaths, run: Launcher): Promise<void> {
  if (agent === 'codex') {
    const file = codexConfigPath(p)
    mkdirSync(dirname(file), { recursive: true })
    if (existsSync(file)) copyFileSync(file, `${file}.bak-zak`)
    writeFileSync(file, withCodexServer(existsSync(file) ? readFileSync(file, 'utf8') : '', run))
    return
  }
  if (agent === 'claude-desktop') {
    const file = desktopConfigPath(p)
    if (!existsSync(dirname(file))) throw new Error(t('Claude Desktop n’est pas installé.'))
    const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
    if (current) copyFileSync(file, `${file}.bak-zak`)
    writeFileSync(file, withDesktopServer(current, run))
    return
  }
  const cli = findClaudeCli(p)
  if (!cli) throw new Error(t('Claude Code n’est pas installé (commande « claude » introuvable).'))
  const json = JSON.stringify({ type: 'stdio', command: run.command, args: run.args, env: run.env })
  // Replaced if it was there: remove (ignoring « not found »), then add, for the user (all projects).
  await exec(cli, ['mcp', 'remove', SERVER_NAME, '--scope', 'user']).catch(() => {})
  await exec(cli, ['mcp', 'add-json', SERVER_NAME, json, '--scope', 'user'])
}

function exec(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 20_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message))
      else resolve(stdout)
    })
  })
}
