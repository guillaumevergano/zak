import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({}))
const { agentStatus, codexHasServer, findClaudeCli, withCodexServer, withDesktopServer } = await import('../../src/main/mcp/connect')

const run = { command: '/Applications/Zak.app/Contents/MacOS/Zak', args: ['/p/mcp-bridge.cjs', '/p/mcp-connection.json'], env: { ELECTRON_RUN_AS_NODE: '1' } }

describe('one-click agent connection', () => {
  it('adds Zak to Codex, replacing an older entry and keeping everything else', () => {
    const before = `model = "gpt-5"

[mcp_servers.node_repl]
command = "node"

[mcp_servers.node_repl.env]
A = "1"

[mcp_servers.zak]
command = "old"

[mcp_servers.zak.env]
OLD = "1"

[profiles.work]
model = "o4"
`
    const after = withCodexServer(before, run)
    expect(after).toContain('[mcp_servers.node_repl.env]\nA = "1"')
    expect(after).toContain('[profiles.work]\nmodel = "o4"')
    expect(after).not.toContain('command = "old"')
    expect(after).not.toContain('OLD')
    expect(after).toContain('[mcp_servers.zak]\n')
    expect(after).toContain('command = "/Applications/Zak.app/Contents/MacOS/Zak"')
    expect(after).toContain('args = ["/p/mcp-bridge.cjs", "/p/mcp-connection.json"]')
    expect(after).toContain('env = { ELECTRON_RUN_AS_NODE = "1" }')
    expect(codexHasServer(after)).toBe(true)
    expect(withCodexServer(after, run)).toBe(after) // idempotent
    expect(withCodexServer('', run).startsWith('[mcp_servers.zak]')).toBe(true)
  })

  it('adds Zak to Claude Desktop, keeping its other servers and settings', () => {
    const before = JSON.stringify({ mcpServers: { other: { command: 'x' } }, preferences: { a: 1 } })
    const after = JSON.parse(withDesktopServer(before, run))
    expect(after.mcpServers.other).toEqual({ command: 'x' })
    expect(after.mcpServers.zak).toEqual({ command: run.command, args: run.args, env: run.env })
    expect(after.preferences).toEqual({ a: 1 })
    expect(JSON.parse(withDesktopServer('', run)).mcpServers.zak.command).toBe(run.command)
  })

  it('tells which agents are installed and connected', () => {
    const home = mkdtempSync(join(tmpdir(), 'zak-agents-'))
    const paths = { home, platform: 'darwin' as const, appData: join(home, 'AppData') }
    expect(agentStatus(paths).map((a) => a.installed)).toEqual([false, false, false])
    mkdirSync(join(home, '.codex'))
    writeFileSync(join(home, '.codex', 'config.toml'), withCodexServer('', run))
    mkdirSync(join(home, '.local', 'bin'), { recursive: true })
    writeFileSync(join(home, '.local', 'bin', 'claude'), '')
    expect(findClaudeCli(paths)).toBe(join(home, '.local', 'bin', 'claude'))
    expect(agentStatus(paths)).toEqual([
      { id: 'claude-code', installed: true, connected: null },
      { id: 'codex', installed: true, connected: true },
      { id: 'claude-desktop', installed: false, connected: false }
    ])
  })
})
