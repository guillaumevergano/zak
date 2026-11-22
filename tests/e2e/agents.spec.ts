import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { launch, pageAt, visit } from './helpers'

test('Codex and Claude Desktop are connected in one click, and reach Zak through the bridge', async () => {
  // A home where Codex and Claude Desktop are installed.
  const home = mkdtempSync(join(tmpdir(), 'zak-agents-home-'))
  mkdirSync(join(home, '.codex'))
  mkdirSync(join(home, 'AppData', 'Claude'), { recursive: true })
  const { app, chrome } = await launch('agents', undefined, { ZAK_AGENTS_HOME: home, CODEX_HOME: join(home, '.codex') })
  await visit(chrome, 'zak://settings')
  const settings = await pageAt(app, 'zak://settings')

  await settings.getByRole('button', { name: 'Connecter à Codex' }).click()
  await expect(settings.getByRole('button', { name: '✓ Codex connecté' })).toBeVisible()
  await settings.getByRole('button', { name: 'Connecter à Claude Desktop' }).click()
  await expect(settings.getByRole('button', { name: '✓ Claude Desktop connecté' })).toBeVisible()
  // Connecting turned the server on.
  await expect(settings.getByRole('switch', { name: 'Laisser Claude Code ou Codex piloter Zak' })).toHaveAttribute('aria-checked', 'true')

  // No secret in the agents' configuration.
  const toml = readFileSync(join(home, '.codex', 'config.toml'), 'utf8')
  const desktop = JSON.parse(readFileSync(join(home, 'AppData', 'Claude', 'claude_desktop_config.json'), 'utf8'))
  expect(toml).not.toMatch(/Bearer|token/i)
  expect(JSON.stringify(desktop)).not.toMatch(/Bearer|token/i)

  // What Claude Desktop does: start the bridge as configured, and talk MCP over stdio.
  const { command, args, env } = desktop.mcpServers.zak as { command: string; args: string[]; env: Record<string, string> }
  const client = new Client({ name: 'claude-desktop-like', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command, args, env: { ...env, PATH: process.env['PATH'] ?? '' } }))
  const tools = (await client.listTools()).tools.map((t) => t.name)
  expect(tools).toContain('list_tabs')
  const result = (await client.callTool({ name: 'list_tabs', arguments: {} })) as { content: { text: string }[] }
  expect(result.content[0]!.text).toContain('zak://settings')
  await client.close()
  await app.close()
})
