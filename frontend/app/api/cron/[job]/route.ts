/**
 * Cron entry point for the vercel-cron job driver.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET`. Any request without it is
 * rejected before any work happens — these endpoints can trigger exports
 * containing PII.
 */
import { timingSafeEqual } from 'node:crypto'
import { getScheduler, type JobName } from '@/lib/jobs/scheduler'

export const dynamic = 'force-dynamic'

const KNOWN_JOBS: readonly JobName[] = [
  'import.process',
  'export.generate',
  'export.schedule.dispatch',
  'payroll.clawback.scan',
]

/** Constant-time comparison so the secret cannot be recovered by timing. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    // Fail closed: an unset secret must not mean "open to everyone".
    return Response.json({ error: 'not_configured' }, { status: 503 })
  }

  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token || !secretMatches(token, expected)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { job } = await params
  if (!KNOWN_JOBS.includes(job as JobName)) {
    return Response.json({ error: 'unknown_job' }, { status: 404 })
  }

  try {
    const handle = await getScheduler().enqueue(job as JobName, {})
    return Response.json({ status: 'ok', jobId: handle.id, job })
  } catch (err) {
    // No handler registered yet is expected until later phases add them.
    const message = err instanceof Error ? err.message : 'job_failed'
    return Response.json({ error: message }, { status: 500 })
  }
}

// GET is also allowed because Vercel cron issues GET requests.
export const GET = POST
