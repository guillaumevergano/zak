import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol, type Session } from 'electron'
import {
  INTERNAL_API_HEADER,
  INTERNAL_API_ROUTES,
  INTERNAL_PAGES,
  INTERNAL_SCHEME,
  type InternalApiRoute,
  type InternalApiRoutes,
  type InternalPage
} from '@shared/ipc'

export type InternalApiHandlers = {
  [R in InternalApiRoute]: (
    body: InternalApiRoutes[R]['body']
  ) => InternalApiRoutes[R]['result'] | Promise<InternalApiRoutes[R]['result']>
}

/** Must run before `app.whenReady()`. `standard` gives the pages a real origin and relative URLs. */
export function registerInternalScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: INTERNAL_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/** Is this URL one of our internal pages? */
export function isInternalUrl(url: string): boolean {
  return url.toLowerCase().startsWith(`${INTERNAL_SCHEME}:`)
}

/**
 * Serves zak://<page>/ from the renderer build (or the Vite dev server) and its /api/ routes.
 * Pages cannot be framed; web pages cannot reach the API (see INTERNAL_API_HEADER in shared/ipc.ts)
 * nor navigate to these URLs (TabManager blocks renderer-initiated navigations to them).
 */
export function handleInternalProtocol(ses: Session, api: InternalApiHandlers): void {
  ses.protocol.handle(INTERNAL_SCHEME, async (request) => {
    const url = new URL(request.url)
    const page = url.hostname as InternalPage
    if (!Object.hasOwn(INTERNAL_PAGES, page)) return text(404, 'Page interne inconnue')

    if (url.pathname.startsWith('/api/')) return callApi(api, `${page}/${url.pathname.slice(5)}`, request)

    const response = await serveAsset(page, url.pathname, url.search)
    const headers = new Headers(response.headers)
    headers.set('Content-Security-Policy', "frame-ancestors 'none'")
    headers.set('X-Frame-Options', 'DENY')
    headers.set('Cache-Control', 'no-store')
    return new Response(response.body, { status: response.status, headers })
  })
}

async function callApi(api: InternalApiHandlers, route: string, request: Request): Promise<Response> {
  if (request.method !== 'POST' || request.headers.get(INTERNAL_API_HEADER) !== '1') return text(403, 'Interdit')
  if (!(INTERNAL_API_ROUTES as readonly string[]).includes(route)) return text(404, 'Route inconnue')
  try {
    const raw = await request.text()
    const body: unknown = raw === '' ? null : JSON.parse(raw)
    const handler = api[route as InternalApiRoute] as (body: unknown) => unknown
    const result = await handler(body)
    return new Response(JSON.stringify(result ?? null), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error(`[internal] ${route}`, err)
    return text(500, err instanceof Error ? err.message : String(err))
  }
}

async function serveAsset(page: InternalPage, pathname: string, search: string): Promise<Response> {
  const entry = pathname === '/' ? `/${INTERNAL_PAGES[page]}` : pathname
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) return net.fetch(`${devServer}${entry}${search}`)

  const root = join(__dirname, '../renderer')
  const file = normalize(join(root, decodeURIComponent(entry)))
  if (!file.startsWith(root + sep)) return text(404, 'Introuvable')
  try {
    return await net.fetch(pathToFileURL(file).toString())
  } catch {
    return text(404, 'Introuvable')
  }
}

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
