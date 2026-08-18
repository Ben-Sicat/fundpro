/**
 * Roster validation — added 2026-08-07 after the owners flagged that there was
 * no way to add a new joiner, and that recruitment is continuous.
 *
 * SCOPE. These cover `validateFundraiser` only, which is a pure function: it
 * exists so the form can show a field-level error without a round trip. The
 * WRITES (create, update, rename carrying history across) now happen in the
 * Python service and are tested there — backend/tests/test_api_team.py. They
 * used to be tested here against the mock roster, and when the mock went so
 * did the thing those tests were exercising; re-asserting them against a stub
 * would have tested the stub.
 *
 * The service re-runs every rule below and is the authority.
 */
import { describe, expect, it } from 'vitest'
import { validateFundraiser, type FundraiserInput } from './index'

const ROSTER = [{ code: 'FR001' }, { code: 'FR002' }, { code: 'FR010' }]
const LEADERS = ['Adora Lumbre', 'Mark Ramayrat', 'Jhon Magno']

const input = (over: Partial<FundraiserInput> = {}): FundraiserInput => ({
  name: 'Teodora Villanueva',
  code: 'FR011',
  leaderNames: ['Adora Lumbre'],
  active: true,
  startDate: '2026-08-03',
  endDate: null,
  ...over,
})

const check = (over: Partial<FundraiserInput> = {}, existingCode?: string) =>
  validateFundraiser(input(over), existingCode, ROSTER, LEADERS)

describe('validateFundraiser', () => {
  it('accepts a well-formed new joiner', () => {
    expect(check()).toEqual({})
  })

  it('requires a name, an ID number and a start date', () => {
    const errors = check({ name: '  ', code: '', startDate: '' })

    expect(errors.name).toBeDefined()
    expect(errors.code).toBeDefined()
    expect(errors.startDate).toBeDefined()
  })

  it('rejects an ID number already in use', () => {
    expect(check({ code: 'FR001' }).code).toContain('already belongs')
  })

  it('compares ID numbers case-insensitively', () => {
    // 'fr001' and 'FR001' are the same person to everyone except a string
    // comparison, and a duplicate ID silently splits one person's history.
    expect(check({ code: 'fr001' }).code).toContain('already belongs')
  })

  it('lets someone keep their own ID when being edited', () => {
    expect(check({ code: 'FR001' }, 'FR001').code).toBeUndefined()
  })

  it('requires at least one leader', () => {
    expect(check({ leaderNames: [] }).leaderNames).toBeDefined()
  })

  it('rejects a leader who does not exist', () => {
    expect(check({ leaderNames: ['Nobody At All'] }).leaderNames).toContain('Unknown leader')
  })

  it('accepts more than one leader', () => {
    // A fundraiser can report to two teams; the schema models it as an
    // effective-dated many-to-many.
    expect(check({ leaderNames: ['Adora Lumbre', 'Jhon Magno'] })).toEqual({})
  })

  it('requires an end date for someone retired', () => {
    // That date is what stops their commission accruing, so a blank one is a
    // payroll problem rather than a cosmetic omission.
    expect(check({ active: false, endDate: null }).endDate).toBeDefined()
  })

  it('accepts a retirement with an end date', () => {
    expect(check({ active: false, endDate: '2026-09-30' })).toEqual({})
  })

  it('rejects an end date before the start date', () => {
    expect(
      check({ active: false, startDate: '2026-08-03', endDate: '2026-07-01' }).endDate,
    ).toContain('before the start date')
  })

  it('rejects an end date on someone still active', () => {
    expect(check({ active: true, endDate: '2026-09-30' }).endDate).toBeDefined()
  })

  it('skips the leader check when no roster of leaders is supplied', () => {
    // Callers that cannot cheaply fetch the leader list still get the rest of
    // the rules rather than a spurious "unknown leader".
    expect(validateFundraiser(input({ leaderNames: ['Whoever'] }), undefined, ROSTER)).toEqual({})
  })
})
