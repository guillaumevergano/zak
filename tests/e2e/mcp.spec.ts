import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { activeTabTitle, launch, pageAt, serve, visit } from './helpers'

test('Claude Code or Codex can drive Zak through its MCP server, once allowed', async () => {
  const { server, origin } = await serve((req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(`<title>Page ${req.url}</title>`)
  })
  const { app, chrome, profile } = await launch('mcp')
  await visit(chrome, 'zak://settings')
  const settings = await pageAt(app, 'zak://settings')
  await settings.getByRole('switch', { name: 'Laisser Claude Code ou Codex piloter Zak' }).click()
  await expect(settings.getByTestId('mcp-setup')).toContainText('claude mcp add --transport http zak')

  const { port, token } = JSON.parse(readFileSync(join(profile, 'config.json'), 'utf8')).mcp as { port: number; token: string }
  const url = `http://127.0.0.1:${port}/mcp`

  // Without the token, or from a web page (Origin), nothing.
  expect((await fetch(url, { method: 'POST', body: '{}' })).status).toBe(401)
  expect((await fetch(url, { method: 'POST', body: '{}', headers: { authorization: `Bearer ${token}`, origin: 'https://evil.example' } })).status).toBe(403)

  // What an agent does.
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
  const tools = (await client.listTools()).tools.map((t) => t.name)
  expect(tools).toEqual(expect.arrayContaining(['list_tabs', 'open_tab', 'group_tabs', 'add_favorite', 'update_settings', 'use_mod']))
  expect(tools.some((t) => /history|password|cookie|content/.test(t))).toBe(false)

  const text = (r: unknown): string => ((r as { content: { text: string }[] }).content[0]!.text)
  const opened = JSON.parse(text(await client.callTool({ name: 'open_tab', arguments: { url: `${origin}/agent` } }))) as { tabId: number }
  await expect.poll(() => activeTabTitle(chrome)).toBe('Page /agent')
  const listed = JSON.parse(text(await client.callTool({ name: 'list_tabs', arguments: {} })))
  expect(JSON.stringify(listed)).toContain('Page /agent')

  await client.callTool({ name: 'group_tabs', arguments: { tabIds: [opened.tabId], name: 'Agent', color: 'green' } })
  await expect(chrome.getByTestId('tab-group')).toHaveText('Agent')

  await client.callTool({ name: 'add_favorite', arguments: { url: 'example.com', title: 'Exemple', emoji: '🧪', folder: 'Tests' } })
  await expect(chrome.getByText('Tests')).toBeVisible()

  await client.callTool({ name: 'update_settings', arguments: { theme: 'dark', searchEngine: 'duckduckgo' } })
  await expect.poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')

  // The layout too: sidebar on the left, tabs in it, in every window at once.
  await client.callTool({ name: 'update_settings', arguments: { sidebarSide: 'left', tabsPosition: 'sidebar' } })
  await expect(chrome.getByTestId('sidebar-tabs')).toBeVisible()
  await expect.poll(() => chrome.getByTestId('sidebar').evaluate((el) => el.getBoundingClientRect().left)).toBe(0)
  expect(JSON.parse(text(await client.callTool({ name: 'get_settings', arguments: {} })))).toMatchObject({ sidebarSide: 'left', tabsPosition: 'sidebar' })

  await client.close()
  // Switched off: the server stops.
  await settings.getByRole('switch', { name: 'Laisser Claude Code ou Codex piloter Zak' }).click()
  await expect.poll(() => fetch(url, { method: 'POST' }).then(() => 'up', () => 'down')).toBe('down')
  await app.close()
  server.close()
})
