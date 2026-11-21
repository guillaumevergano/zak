import { INTERNAL_API_HEADER, type InternalApiRoute, type InternalApiRoutes } from '@shared/ipc'

/**
 * Calls main from an internal page (zak://…). These pages run in a tab without a preload
 * (CLAUDE.md §3), so they talk to main over their own origin; see InternalApiRoutes in shared/ipc.ts.
 */
export async function callInternal<R extends InternalApiRoute>(
  route: R,
  body: InternalApiRoutes[R]['body']
): Promise<InternalApiRoutes[R]['result']> {
  const name = route.slice(route.indexOf('/') + 1)
  const res = await fetch(`/api/${name}`, {
    method: 'POST',
    headers: { [INTERNAL_API_HEADER]: '1', 'Content-Type': 'application/json' },
    body: body === null ? '' : JSON.stringify(body)
  })
  if (!res.ok) throw new Error(await res.text())
  return (await res.json()) as InternalApiRoutes[R]['result']
}
