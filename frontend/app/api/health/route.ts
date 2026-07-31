/**
 * Health check.
 *
 * MOCK MODE: the UI is served from the in-process mock dataset, so there is no
 * database to probe. When the Python preprocessing API is wired up, this should
 * check that upstream instead and report `degraded` when it is unreachable —
 * never echo the upstream error, since connection strings appear in those.
 */
import { PLEDGES } from '@/lib/mock/dataset'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({
    status: 'ok',
    dataSource: 'mock',
    records: PLEDGES.length,
  })
}
