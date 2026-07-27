/**
 * Health check. Verifies the process is up AND that the database answers,
 * since "app responds but DB is unreachable" is the failure that matters.
 * Deliberately leaks no schema or connection details.
 */
import { sql } from 'drizzle-orm'
import { db } from '@/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()
  try {
    await db.execute(sql`select 1`)
    return Response.json({
      status: 'ok',
      database: 'ok',
      latencyMs: Date.now() - startedAt,
    })
  } catch {
    // Never echo the driver error: connection strings appear in those messages.
    return Response.json(
      { status: 'degraded', database: 'unreachable' },
      { status: 503 },
    )
  }
}
