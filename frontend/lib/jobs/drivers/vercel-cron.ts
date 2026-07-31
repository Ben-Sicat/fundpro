/**
 * Default driver: Neon + Vercel.
 *
 * There is no long-lived worker process. Work is executed either inline (for
 * enqueue calls that must finish within the request) or by a Vercel cron
 * request to /api/cron/[job], which authenticates with CRON_SECRET.
 *
 * Never import this module directly from application code — use
 * `getScheduler()` from ../scheduler.
 */
import { handlers, type JobHandle, type JobName, type Scheduler } from '../types'
import { randomUUID } from 'node:crypto'

export function createVercelCronScheduler(): Scheduler {
  return {
    driver: 'vercel-cron',

    async enqueue<T extends object>(
      name: JobName,
      payload: T,
    ): Promise<JobHandle> {
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(
          `No handler registered for job '${name}'. Register it at module init.`,
        )
      }
      const id = randomUUID()
      // Serverless has no background worker: run inline so the work is not
      // silently dropped when the function freezes after responding.
      await handler(payload)
      return { id, name }
    },

    register<T extends object>(
      name: JobName,
      handler: (payload: T) => Promise<void>,
    ): void {
      handlers.set(name, handler as (payload: object) => Promise<void>)
    },

    async shutdown(): Promise<void> {
      // Nothing to release.
    },
  }
}
