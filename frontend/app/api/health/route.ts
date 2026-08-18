/**
 * Health check.
 *
 * Probes the Python processing service, which is now the only source of data.
 * Reports `degraded` rather than failing when it is unreachable, so a monitor
 * can tell "the site is down" from "the site is up but cannot reach its data".
 *
 * The upstream error is deliberately NOT echoed: connection strings and host
 * names appear in those, and this endpoint is unauthenticated.
 */
import { API_URL, backendEnabled } from '@/lib/api/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!backendEnabled()) {
    return Response.json(
      { status: 'degraded', dataSource: 'unconfigured' },
      { status: 503 },
    )
  }

  try {
    const upstream = await fetch(`${API_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })
    if (!upstream.ok) {
      return Response.json(
        { status: 'degraded', dataSource: 'service' },
        { status: 503 },
      )
    }
    return Response.json({ status: 'ok', dataSource: 'service' })
  } catch {
    return Response.json(
      { status: 'degraded', dataSource: 'service' },
      { status: 503 },
    )
  }
}
