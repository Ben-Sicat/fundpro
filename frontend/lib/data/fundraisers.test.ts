/**
 * Roster management — added 2026-08-07 after the owners flagged that there was
 * no way to add a new joiner, and that recruitment is continuous.
 *
 * These test the data seam directly (not the form), so the rules survive the
 * swap from mock storage to the Python API.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { FUNDRAISERS } from '@/lib/mock/dataset'
import {
  createFundraiser,
  getFundraiser,
  getPledges,
  updateFundraiser,
  validateFundraiser,
  type FundraiserInput,
} from './index'

const baseline = FUNDRAISERS.map((f) => ({ ...f, leaderNames: [...f.leaderNames] }))

afterEach(() => {
  // The mock roster is module-level mutable state; restore it so tests stay
  // order-independent.
  FUNDRAISERS.length = 0
  FUNDRAISERS.push(...baseline.map((f) => ({ ...f, leaderNames: [...f.leaderNames] })))
})

const input = (over: Partial<FundraiserInput> = {}): FundraiserInput => ({
  name: 'Teodora Villanueva',
  code: 'FR011',
  leaderNames: ['Adora Lumbre'],
  active: true,
  startDate: '2026-08-03',
  endDate: null,
  ...over,
})

describe('validateFundraiser', () => {
  it('accepts a well-formed new joiner', () => {
    expect(validateFundraiser(input())).toEqual({})
  })

  it('requires a name, an ID number and a start date', () => {
    const errors = validateFundraiser(
      input({ name: '  ', code: '', startDate: '' }),
    )
    expect(errors.name).toBeDefined()
    expect(errors.code).toBeDefined()
    expect(errors.startDate).toBeDefined()
  })

  it('rejects an ID number already in use', () => {
    // FR001 is Almara Pasco in the seed roster.
    expect(validateFundraiser(input({ code: 'FR001' })).code).toContain('already belongs')
  })

  it('compares ID numbers case-insensitively', () => {
    expect(validateFundraiser(input({ code: 'fr001' })).code).toBeDefined()
  })

  it('lets someone keep their own ID when editing', () => {
    expect(validateFundraiser(input({ code: 'FR001', name: 'Almara Pasco' }), 'FR001')).toEqual({})
  })

  it('requires at least one leader', () => {
    expect(validateFundraiser(input({ leaderNames: [] })).leaderNames).toBeDefined()
  })

  it('rejects a leader who does not exist', () => {
    expect(validateFundraiser(input({ leaderNames: ['Nobody At All'] })).leaderNames).toBeDefined()
  })

  it('accepts more than one leader', () => {
    expect(validateFundraiser(input({ leaderNames: ['Adora Lumbre', 'Jhon Magno'] }))).toEqual({})
  })

  it('requires an end date once someone is retired', () => {
    // Without this the person keeps accruing commission forever.
    expect(validateFundraiser(input({ active: false, endDate: null })).endDate).toContain(
      'needs an end date',
    )
  })

  it('rejects an end date before the start date', () => {
    const errors = validateFundraiser(
      input({ active: false, startDate: '2026-08-03', endDate: '2026-07-01' }),
    )
    expect(errors.endDate).toContain('before the start date')
  })

  it('rejects an end date on someone still active', () => {
    expect(validateFundraiser(input({ active: true, endDate: '2026-09-01' })).endDate).toBeDefined()
  })
})

describe('createFundraiser', () => {
  it('puts the new joiner on the roster with no sign-ups', async () => {
    const created = await createFundraiser(input())

    expect(created.code).toBe('FR011')
    expect(created.name).toBe('Teodora Villanueva')
    expect(created.signups).toBe(0)
    expect(created.realized).toBe(0)
    expect(await getFundraiser('FR011')).not.toBeNull()
  })

  it('records every leader they report to', async () => {
    const created = await createFundraiser(
      input({ leaderNames: ['Adora Lumbre', 'Jhon Magno'] }),
    )
    expect(created.leaderNames).toEqual(['Adora Lumbre', 'Jhon Magno'])
  })

  it('trims stray whitespace off the name and ID', async () => {
    const created = await createFundraiser(input({ name: '  Teodora Villanueva  ', code: ' FR011 ' }))
    expect(created.name).toBe('Teodora Villanueva')
    expect(created.code).toBe('FR011')
  })

  it('refuses invalid input rather than writing a half-formed record', async () => {
    await expect(createFundraiser(input({ code: 'FR001' }))).rejects.toThrow(/already belongs/)
    expect(FUNDRAISERS).toHaveLength(baseline.length)
  })

  it('makes the new leader assignment filterable immediately', async () => {
    // Regression guard: leader lookup used to be cached in a module-level Map
    // built at import time, so anyone hired afterwards was invisible to the
    // leader filter.
    await createFundraiser(input({ leaderNames: ['Jhon Magno'] }))
    const rows = await getPledges({ leaderName: 'Jhon Magno' })
    expect(rows.length).toBeGreaterThan(0) // does not throw, filter still resolves
  })
})

describe('updateFundraiser', () => {
  it('retires someone with an end date', async () => {
    const updated = await updateFundraiser('FR001', {
      name: 'Almara Pasco',
      code: 'FR001',
      leaderNames: ['Adora Lumbre'],
      active: false,
      startDate: '2024-03-04',
      endDate: '2026-08-31',
    })
    expect(updated.active).toBe(false)
    expect(updated.endDate).toBe('2026-08-31')
  })

  it('moves someone to a different leader', async () => {
    const updated = await updateFundraiser('FR001', {
      name: 'Almara Pasco',
      code: 'FR001',
      leaderNames: ['Mark Ramayrat'],
      active: true,
      startDate: '2024-03-04',
      endDate: null,
    })
    expect(updated.leaderNames).toEqual(['Mark Ramayrat'])
  })

  it('carries the sign-up history across a rename', async () => {
    // Pledges reference a fundraiser by NAME, so a rename that did not update
    // them would silently orphan every sign-up the person had made.
    const before = (await getFundraiser('FR001'))!.signups
    expect(before).toBeGreaterThan(0)

    const renamed = await updateFundraiser('FR001', {
      name: 'Almara Pasco-Reyes',
      code: 'FR001',
      leaderNames: ['Adora Lumbre'],
      active: true,
      startDate: '2024-03-04',
      endDate: null,
    })

    expect(renamed.name).toBe('Almara Pasco-Reyes')
    expect(renamed.signups).toBe(before)
    expect(await getPledges({ fundraiserName: 'Almara Pasco' })).toHaveLength(0)
    expect(await getPledges({ fundraiserName: 'Almara Pasco-Reyes' })).toHaveLength(before)
  })

  it('rejects an unknown ID', async () => {
    await expect(updateFundraiser('NOPE', input())).rejects.toThrow(/No fundraiser/)
  })
})
