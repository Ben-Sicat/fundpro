/**
 * STUB — VPS + Docker driver (MASTER_SPEC Prompt 0 specifies a stub).
 *
 * pg-boss polls Postgres, which is correct on a VPS where the database is
 * always warm, and wrong on Neon where polling defeats scale-to-zero.
 *
 * To complete this driver:
 *   1. `pnpm add pg-boss`
 *   2. Replace the throwing bodies below with a PgBoss instance created from
 *      DATABASE_URL: `new PgBoss(process.env.DATABASE_URL)`, then
 *      `boss.start()`, `boss.send(name, payload)` and `boss.work(name, fn)`.
 *   3. Set JOB_DRIVER=pg-boss.
 *
 * It is deliberately left unimplemented rather than half-wired: a driver that
 * silently accepted jobs and never ran them would lose imports and payroll
 * work with no visible error.
 */
import { handlers, type JobHandle, type JobName, type Scheduler } from '../types'

const NOT_IMPLEMENTED =
  "The 'pg-boss' job driver is a stub. Install pg-boss and implement " +
  'lib/jobs/drivers/pg-boss.ts, or set JOB_DRIVER=vercel-cron.'

export function createPgBossScheduler(): Scheduler {
  return {
    driver: 'pg-boss',

    async enqueue<T extends object>(
      _name: JobName,
      _payload: T,
    ): Promise<JobHandle> {
      throw new Error(NOT_IMPLEMENTED)
    },

    // Registration is safe to support: it only records the handler, so
    // application modules can declare handlers at import time regardless of
    // which driver is active.
    register<T extends object>(
      name: JobName,
      handler: (payload: T) => Promise<void>,
    ): void {
      handlers.set(name, handler as (payload: object) => Promise<void>)
    },

    async shutdown(): Promise<void> {
      // Nothing to release until pg-boss is wired up.
    },
  }
}
