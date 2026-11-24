import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { GeneralSettings, TabGroupColor } from '@shared/types'

/**
 * What the MCP tools can do with the running Zak (implemented in index.ts). Deliberately limited:
 * tabs (titles and addresses), groups, favorites, settings and mods. Never the content of pages,
 * the history, passwords or cookies.
 */
export interface ZakControl {
  windows(): unknown
  openTab(url: string, background: boolean): number
  closeTabs(ids: number[]): number
  activateTab(id: number): boolean
  groupTabs(ids: number[], name: string, color: TabGroupColor | undefined): string | null
  favorites(): unknown
  addFavorite(input: { url: string; title: string; emoji: string | null; folder: string | null }): string
  settings(): GeneralSettings
  updateSettings(patch: Partial<GeneralSettings>): GeneralSettings
  mods(): unknown
  selectMod(kind: 'theme' | 'newtab', id: string | null): unknown
}

const COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'] as const
const MAX_BODY = 1_000_000

/**
 * Zak's MCP server (Settings → Customize → « Laisser Claude Code ou Codex piloter Zak »): lets an
 * AI agent drive the running browser. Off by default. Streamable HTTP on 127.0.0.1 only, behind a
 * bearer token; requests from web pages are refused (Origin / Host checks against DNS rebinding).
 */
export class ZakMcpServer {
  private server: Server | null = null

  constructor(private readonly control: ZakControl) {}

  get running(): boolean {
    return this.server !== null
  }

  /** Listens on `port` (0 = any free one). Returns the port actually used. */
  async start(port: number, token: string): Promise<number> {
    await this.stop()
    const server = createServer((req, res) => void this.handle(req, res, token))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => resolve())
    })
    this.server = server
    return (server.address() as AddressInfo).port
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private async handle(req: IncomingMessage, res: ServerResponse, token: string): Promise<void> {
    const deny = (status: number, message: string): void => {
      res.writeHead(status, { 'Content-Type': 'text/plain' }).end(message)
    }
    const port = (this.server?.address() as AddressInfo | null)?.port
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== '/mcp') return deny(404, 'Not found')
    // Not reachable from a web page: no browser Origin, and only our own Host (DNS rebinding).
    if (req.headers.origin) return deny(403, 'Forbidden')
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return deny(403, 'Forbidden')
    if (!sameSecret(req.headers.authorization ?? '', `Bearer ${token}`)) return deny(401, 'Unauthorized')
    if (req.method !== 'POST') return deny(405, 'Method not allowed')

    let body: unknown
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      return deny(400, 'Bad request')
    }
    // Stateless: one server and transport per request.
    const mcp = this.build()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      void transport.close()
      void mcp.close()
    })
    await mcp.connect(transport)
    await transport.handleRequest(req, res, body)
  }

  private build(): McpServer {
    const c = this.control
    const mcp = new McpServer({ name: 'zak', version: '1.0.0' })
    const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })

    mcp.registerTool(
      'list_tabs',
      { description: 'Lists the open Zak windows with their tabs (id, title, url, pinned, active, group) and tab groups.', annotations: { readOnlyHint: true } },
      () => json(c.windows())
    )
    mcp.registerTool(
      'open_tab',
      {
        description: 'Opens a URL (or a search) in a new tab of the frontmost Zak window.',
        inputSchema: { url: z.string().describe('Address or search terms'), background: z.boolean().optional().describe('Keep the current tab in front') }
      },
      ({ url, background }) => json({ tabId: c.openTab(url, background ?? false) })
    )
    mcp.registerTool(
      'close_tabs',
      { description: 'Closes tabs by id (see list_tabs).', inputSchema: { tabIds: z.array(z.number()).min(1) }, annotations: { destructiveHint: true } },
      ({ tabIds }) => json({ closed: c.closeTabs(tabIds) })
    )
    mcp.registerTool(
      'activate_tab',
      { description: 'Shows a tab (brings its window to the front).', inputSchema: { tabId: z.number() } },
      ({ tabId }) => json({ ok: c.activateTab(tabId) })
    )
    mcp.registerTool(
      'group_tabs',
      {
        description: 'Puts tabs of one window into a new tab group, with an optional name and color.',
        inputSchema: { tabIds: z.array(z.number()).min(1), name: z.string().optional(), color: z.enum(COLORS).optional() }
      },
      ({ tabIds, name, color }) => json({ groupId: c.groupTabs(tabIds, name ?? '', color) })
    )
    mcp.registerTool(
      'list_favorites',
      { description: 'Lists the sidebar favorites and folders.', annotations: { readOnlyHint: true } },
      () => json(c.favorites())
    )
    mcp.registerTool(
      'add_favorite',
      {
        description: 'Adds a favorite to the sidebar, optionally with an emoji and in a folder (created if missing).',
        inputSchema: { url: z.string(), title: z.string().optional(), emoji: z.string().optional(), folder: z.string().optional().describe('Folder name') }
      },
      ({ url, title, emoji, folder }) => json({ id: c.addFavorite({ url, title: title ?? url, emoji: emoji ?? null, folder: folder ?? null }) })
    )
    mcp.registerTool(
      'get_settings',
      { description: 'Reads Zak\'s general settings (search engine, theme, startup, tab sleep…).', annotations: { readOnlyHint: true } },
      () => json(c.settings())
    )
    mcp.registerTool(
      'update_settings',
      {
        description: 'Changes general settings. Invalid values are ignored. The language applies at the next launch.',
        inputSchema: {
          language: z.enum(['system', 'fr', 'en']).optional(),
          searchEngine: z.enum(['google', 'duckduckgo', 'brave', 'bing', 'qwant', 'ecosia']).optional(),
          startup: z.enum(['restore', 'newtab']).optional(),
          theme: z.enum(['system', 'light', 'dark']).optional(),
          safeBrowsing: z.boolean().optional(),
          savePasswords: z.boolean().optional(),
          askWhereToSave: z.boolean().optional(),
          sleepTabsAfter: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60), z.literal(120)]).optional()
        }
      },
      (patch) => json(c.updateSettings(patch))
    )
    mcp.registerTool(
      'list_mods',
      { description: 'Lists the mods in Zak\'s mods folder (themes, new tab pages) and which are in use, with the folder\'s path.', annotations: { readOnlyHint: true } },
      () => json(c.mods())
    )
    mcp.registerTool(
      'use_mod',
      {
        description: 'Uses a mod\'s theme or new tab page (id = its folder name), or goes back to Zak\'s own (id null).',
        inputSchema: { kind: z.enum(['theme', 'newtab']), id: z.string().nullable() }
      },
      ({ kind, id }) => json(c.selectMod(kind, id))
    )
    return mcp
  }
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('too large'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
