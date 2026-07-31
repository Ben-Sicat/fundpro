/**
 * Shared job-layer contract.
 *
 * Kept separate from scheduler.ts so drivers can import the types and the
 * handler registry without importing the scheduler that imports them — that
 * would be a circular dependency.
 */

export type JobName =
  | 'import.process'
  | 'export.generate'
  | 'export.schedule.dispatch'
  | 'payroll.clawback.scan'

export const JOB_NAMES: readonly JobName[] = [
  'import.process',
  'export.generate',
  'export.schedule.dispatch',
  'payroll.clawback.scan',
]

export interface JobHandle {
  /** Driver-assigned id; for vercel-cron this is the audit/run row id. */
  id: string
  name: JobName
}

export interface Scheduler {
  readonly driver: 'vercel-cron' | 'pg-boss'
  /** Enqueue a job to run as soon as possible. */
  enqueue<T extends object>(name: JobName, payload: T): Promise<JobHandle>
  /** Register a handler. On vercel-cron this maps a cron route to a handler. */
  register<T extends object>(
    name: JobName,
    handler: (payload: T) => Promise<void>,
  ): void
  /** Release resources (no-op for vercel-cron). */
  shutdown(): Promise<void>
}

/** Registry shared by drivers so handlers are declared in one place. */
export const handlers = new Map<JobName, (payload: object) => Promise<void>>()
