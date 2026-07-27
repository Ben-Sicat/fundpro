import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getScheduler, handlers, __setSchedulerForTests } from './scheduler'

describe('job scheduler driver selection', () => {
  const originalDriver = process.env.JOB_DRIVER

  beforeEach(() => {
    __setSchedulerForTests(null)
    handlers.clear()
  })

  afterEach(() => {
    process.env.JOB_DRIVER = originalDriver
    __setSchedulerForTests(null)
    handlers.clear()
  })

  it('defaults to the vercel-cron driver when JOB_DRIVER is unset', () => {
    delete process.env.JOB_DRIVER
    expect(getScheduler().driver).toBe('vercel-cron')
  })

  it('selects the pg-boss driver when configured', () => {
    process.env.JOB_DRIVER = 'pg-boss'
    expect(getScheduler().driver).toBe('pg-boss')
  })

  it('throws on an unknown driver rather than silently doing nothing', () => {
    process.env.JOB_DRIVER = 'rabbitmq'
    expect(() => getScheduler()).toThrow(/Unknown JOB_DRIVER/)
  })

  it('runs a registered handler on enqueue (vercel-cron)', async () => {
    process.env.JOB_DRIVER = 'vercel-cron'
    const scheduler = getScheduler()
    const handler = vi.fn(async () => {})
    scheduler.register('import.process', handler)

    const handle = await scheduler.enqueue('import.process', { batchId: 'b1' })

    expect(handler).toHaveBeenCalledWith({ batchId: 'b1' })
    expect(handle.name).toBe('import.process')
    expect(handle.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('throws when enqueueing a job with no registered handler', async () => {
    process.env.JOB_DRIVER = 'vercel-cron'
    await expect(
      getScheduler().enqueue('export.generate', {}),
    ).rejects.toThrow(/No handler registered/)
  })

  it('pg-boss stub refuses to accept work instead of dropping it', async () => {
    // A stub that accepted jobs and never ran them would lose imports and
    // payroll silently — failing loudly is the safe behaviour.
    process.env.JOB_DRIVER = 'pg-boss'
    const scheduler = getScheduler()
    scheduler.register('import.process', async () => {})
    await expect(scheduler.enqueue('import.process', {})).rejects.toThrow(
      /stub/i,
    )
  })
})
