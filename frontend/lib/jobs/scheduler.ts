/**
 * Job layer abstraction.
 *
 * Two deployment targets are still viable (MASTER_SPEC §1.6):
 *   - Neon + Vercel  → `vercel-cron` driver. Cron hits internal HTTP endpoints.
 *                      pg-boss polling would defeat Neon's scale-to-zero.
 *   - VPS + Docker   → `pg-boss` driver, polling Postgres.
 *
 * Application code MUST go through `getScheduler()` and never import a driver
 * directly, so the deployment decision stays swappable.
 */
import { createVercelCronScheduler } from './drivers/vercel-cron'
import { createPgBossScheduler } from './drivers/pg-boss'
import type { Scheduler } from './types'

export type { JobHandle, JobName, Scheduler } from './types'
export { JOB_NAMES, handlers } from './types'

let instance: Scheduler | null = null

/**
 * Returns the process-wide scheduler, chosen by the JOB_DRIVER env var.
 *
 * Both drivers are imported statically: a CommonJS `require()` here breaks
 * under ESM (Vitest, and Next's bundler). The driver modules are tiny, so
 * nothing meaningful is pulled in. When the pg-boss driver is really
 * implemented it should `await import('pg-boss')` inside its factory, so that
 * dependency stays out of a Vercel build.
 */
export function getScheduler(): Scheduler {
  if (instance) return instance
  const driver = process.env.JOB_DRIVER ?? 'vercel-cron'
  switch (driver) {
    case 'vercel-cron':
      instance = createVercelCronScheduler()
      break
    case 'pg-boss':
      instance = createPgBossScheduler()
      break
    default:
      throw new Error(
        `Unknown JOB_DRIVER '${driver}'. Expected 'vercel-cron' or 'pg-boss'.`,
      )
  }
  return instance
}

/** Test seam: inject a fake scheduler. */
export function __setSchedulerForTests(s: Scheduler | null): void {
  instance = s
}
