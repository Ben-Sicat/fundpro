import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLAN,
  addDays,
  clawbackCandidatesFor,
  commissionFor,
  cutoffFor,
  cutoffsInMonth,
  daysBetween,
  eligibilityDateFor,
  endOfMonth,
  generateDraftRun,
  netByFundraiser,
  planForPledge,
  type CommissionPlan,
  type PayrollPledge,
} from './payroll'

const pledge = (over: Partial<PayrollPledge> = {}): PayrollPledge => ({
  serialNo: 'FES48000001',
  fundraiserName: 'Grace Tolentino',
  charityCode: 'STC',
  amount: 600,
  currency: 'PHP',
  signupDate: '2026-07-02',
  submittedAt: '2026-07-04',
  debitDate: '2026-07-08',
  cancellationDate: null,
  cancelled: false,
  currentClassification: 'approved',
  ...over,
})

// ---------------------------------------------------------------------------
// Cutoff boundaries — the spec calls these out as must-test
// ---------------------------------------------------------------------------

describe('cutoffFor — semi-monthly boundaries', () => {
  it('puts the 1st in the first-half cutoff', () => {
    expect(cutoffFor('2026-07-01')).toMatchObject({
      start: '2026-07-01',
      end: '2026-07-15',
      runDate: '2026-07-15',
    })
  })

  it('puts the 15th in the FIRST half (inclusive upper bound)', () => {
    expect(cutoffFor('2026-07-15').end).toBe('2026-07-15')
    expect(cutoffFor('2026-07-15').start).toBe('2026-07-01')
  })

  it('puts the 16th in the SECOND half (inclusive lower bound)', () => {
    expect(cutoffFor('2026-07-16')).toMatchObject({
      start: '2026-07-16',
      end: '2026-07-31',
    })
  })

  it('ends the second half on the real end of month, not always the 31st', () => {
    expect(cutoffFor('2026-06-20').end).toBe('2026-06-30')
    expect(cutoffFor('2026-02-20').end).toBe('2026-02-28')
  })

  it('never produces an invalid pay date in a short month', () => {
    // A naive "always the 30th" gives 2026-02-30, which does not exist.
    expect(cutoffFor('2026-02-20').runDate).toBe('2026-02-28')
    expect(cutoffFor('2026-04-20').runDate).toBe('2026-04-30')
  })

  it('handles a leap February', () => {
    expect(endOfMonth(2028, 2)).toBe(29)
    expect(cutoffFor('2028-02-20').end).toBe('2028-02-29')
  })

  it('returns both cutoffs of a month, in order, with no gap or overlap', () => {
    const [first, second] = cutoffsInMonth(2026, 7)
    expect(first.end).toBe('2026-07-15')
    expect(second.start).toBe('2026-07-16')
    expect(addDays(first.end, 1)).toBe(second.start)
  })
})

describe('date helpers', () => {
  it('counts days across a month boundary', () => {
    expect(daysBetween('2026-07-28', '2026-08-04')).toBe(7)
  })

  it('counts days across a year boundary', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
  })

  it('is signed when the range runs backwards', () => {
    expect(daysBetween('2026-08-04', '2026-07-28')).toBe(-7)
  })
})

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

describe('eligibilityDateFor', () => {
  it('on_submission uses the submission date', () => {
    const plan = { ...DEFAULT_PLAN, triggerRule: 'on_submission' as const }
    expect(eligibilityDateFor(pledge(), plan)).toBe('2026-07-04')
  })

  it('on_first_approval uses the debit date — the money moment', () => {
    expect(eligibilityDateFor(pledge(), DEFAULT_PLAN)).toBe('2026-07-08')
  })

  it('is null when the pledge never billed, so it cannot be paid', () => {
    // The measured rule: no successful billing means no commission.
    expect(eligibilityDateFor(pledge({ debitDate: null }), DEFAULT_PLAN)).toBeNull()
  })

  it('on_n_billings waits for the Nth successful billing', () => {
    const plan = {
      ...DEFAULT_PLAN,
      triggerRule: 'on_n_billings' as const,
      triggerN: 3,
    }
    const p = pledge({
      approvedBillingDates: ['2026-07-08', '2026-08-08', '2026-09-08'],
    })
    expect(eligibilityDateFor(p, plan)).toBe('2026-09-08')
  })

  it('on_n_billings is null with too few billings', () => {
    const plan = {
      ...DEFAULT_PLAN,
      triggerRule: 'on_n_billings' as const,
      triggerN: 3,
    }
    const p = pledge({ approvedBillingDates: ['2026-07-08', '2026-08-08'] })
    expect(eligibilityDateFor(p, plan)).toBeNull()
  })
})

describe('commissionFor', () => {
  it('applies the multiplier as a percentage of pledge (300 = x3)', () => {
    expect(commissionFor(pledge({ amount: 600 }), DEFAULT_PLAN)).toBe(1800)
  })

  it('matches the multipliers measured in the client sheets', () => {
    const at = (pct: number) =>
      commissionFor(pledge({ amount: 780 }), { ...DEFAULT_PLAN, pctOfPledge: pct })
    expect(at(400)).toBe(3120) // the observed 780 -> 3120 row
    expect(at(250)).toBe(1950)
    expect(at(50)).toBe(390)
  })

  it('prefers a flat amount when the plan sets one', () => {
    const plan = { ...DEFAULT_PLAN, flatAmount: 500 }
    expect(commissionFor(pledge({ amount: 600 }), plan)).toBe(500)
  })

  it('rounds to 2 decimals rather than carrying float error', () => {
    const plan = { ...DEFAULT_PLAN, pctOfPledge: 33.33 }
    expect(commissionFor(pledge({ amount: 100 }), plan)).toBe(33.33)
  })
})

// ---------------------------------------------------------------------------
// Plan effective-dating — protects historic runs
// ---------------------------------------------------------------------------

describe('planForPledge — effective dating', () => {
  const old: CommissionPlan = {
    ...DEFAULT_PLAN,
    id: 'old',
    pctOfPledge: 250,
    effectiveFrom: '2026-01-01',
  }
  const recent: CommissionPlan = {
    ...DEFAULT_PLAN,
    id: 'recent',
    pctOfPledge: 300,
    effectiveFrom: '2026-07-01',
  }

  it('uses the plan in force at the SIGN-UP date, not the newest plan', () => {
    const p = pledge({ signupDate: '2026-06-20' })
    expect(planForPledge(p, [old, recent])?.id).toBe('old')
  })

  it('uses the newer plan for a later signup', () => {
    const p = pledge({ signupDate: '2026-07-10' })
    expect(planForPledge(p, [old, recent])?.id).toBe('recent')
  })

  it('treats effectiveFrom as inclusive', () => {
    const p = pledge({ signupDate: '2026-07-01' })
    expect(planForPledge(p, [old, recent])?.id).toBe('recent')
  })

  it('returns null when no plan was in force yet', () => {
    const p = pledge({ signupDate: '2025-12-31' })
    expect(planForPledge(p, [old, recent])).toBeNull()
  })

  it('prefers a charity-specific plan over the catch-all', () => {
    const global = { ...DEFAULT_PLAN, id: 'global', charityCode: null }
    const stc = { ...DEFAULT_PLAN, id: 'stc', charityCode: 'STC' }
    expect(planForPledge(pledge({ charityCode: 'STC' }), [global, stc])?.id).toBe('stc')
  })

  it('ignores a plan belonging to another charity', () => {
    const wwf = { ...DEFAULT_PLAN, id: 'wwf', charityCode: 'WWF' }
    expect(planForPledge(pledge({ charityCode: 'STC' }), [wwf])).toBeNull()
  })

  it('adding a new plan does not reprice an older pledge', () => {
    const p = pledge({ signupDate: '2026-06-20', amount: 600 })
    const before = commissionFor(p, planForPledge(p, [old])!)
    const after = commissionFor(p, planForPledge(p, [old, recent])!)
    expect(after).toBe(before) // x2.5 both times, not repriced to x3
    expect(after).toBe(1500)
  })
})

// ---------------------------------------------------------------------------
// Draft run
// ---------------------------------------------------------------------------

describe('generateDraftRun', () => {
  const cutoff = cutoffFor('2026-07-20') // 16–31 July

  it('includes a pledge whose debit lands inside the cutoff', () => {
    const p = pledge({ debitDate: '2026-07-20' })
    expect(generateDraftRun([p], [DEFAULT_PLAN], cutoff)).toHaveLength(1)
  })

  it('includes the cutoff boundary dates themselves', () => {
    const first = pledge({ serialNo: 'A', debitDate: '2026-07-16' })
    const last = pledge({ serialNo: 'B', debitDate: '2026-07-31' })
    expect(generateDraftRun([first, last], [DEFAULT_PLAN], cutoff)).toHaveLength(2)
  })

  it('excludes a debit one day either side of the window', () => {
    const before = pledge({ serialNo: 'A', debitDate: '2026-07-15' })
    const after = pledge({ serialNo: 'B', debitDate: '2026-08-01' })
    expect(generateDraftRun([before, after], [DEFAULT_PLAN], cutoff)).toHaveLength(0)
  })

  it('excludes a pledge that never billed', () => {
    const p = pledge({ debitDate: null })
    expect(generateDraftRun([p], [DEFAULT_PLAN], cutoff)).toHaveLength(0)
  })

  it('excludes a pledge with no plan in force', () => {
    const p = pledge({ signupDate: '2019-01-01', debitDate: '2026-07-20' })
    const plan = { ...DEFAULT_PLAN, effectiveFrom: '2026-01-01' }
    expect(generateDraftRun([p], [plan], cutoff)).toHaveLength(0)
  })

  it('records which rule made the line eligible', () => {
    const [line] = generateDraftRun([pledge({ debitDate: '2026-07-20' })], [DEFAULT_PLAN], cutoff)
    expect(line.conditionApplied).toBe('on_first_approval')
    expect(line.eligibilityDate).toBe('2026-07-20')
  })

  it('still pays a pledge that has since cancelled — the clawback is separate', () => {
    // The commission was earned when it billed. Reversing it is a clawback
    // decision, not a reason to omit the line and silently under-pay.
    const p = pledge({
      debitDate: '2026-07-20',
      cancelled: true,
      cancellationDate: '2026-07-25',
    })
    expect(generateDraftRun([p], [DEFAULT_PLAN], cutoff)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Clawbacks — cancel-after-payment
// ---------------------------------------------------------------------------

describe('clawbackCandidatesFor', () => {
  const paid = [{ serialNo: 'FES48000001', commission: 1800, paidOn: '2026-07-15' }]

  it('flags a paid pledge that later cancelled', () => {
    const p = pledge({ cancelled: true, cancellationDate: '2026-07-25' })
    const [c] = clawbackCandidatesFor(paid, [p], [DEFAULT_PLAN])
    expect(c).toMatchObject({ reason: 'cancelled', originalCommission: 1800 })
  })

  it('never auto-confirms — an admin must approve before netting', () => {
    const p = pledge({ cancelled: true, cancellationDate: '2026-07-25' })
    expect(clawbackCandidatesFor(paid, [p], [DEFAULT_PLAN])[0].confirmed).toBe(false)
  })

  it('flags a paid pledge that ended in final failure', () => {
    const p = pledge({ currentClassification: 'failed_final' })
    const [c] = clawbackCandidatesFor(paid, [p], [DEFAULT_PLAN])
    expect(c.reason).toBe('failed_final')
  })

  it('flags commission paid on submission that never billed', () => {
    const p = pledge({ debitDate: null, currentClassification: 'failed_retryable' })
    const [c] = clawbackCandidatesFor(paid, [p], [DEFAULT_PLAN])
    expect(c.reason).toBe('unrealized')
  })

  it('leaves a healthy pledge alone', () => {
    expect(clawbackCandidatesFor(paid, [pledge()], [DEFAULT_PLAN])).toHaveLength(0)
  })

  it('does NOT claw back once the realization window has passed', () => {
    // The window exists precisely so late churn is not charged to the
    // fundraiser; ignoring it would reverse commission years later.
    const plan = { ...DEFAULT_PLAN, realizationWindowDays: 30 }
    const p = pledge({ cancelled: true, cancellationDate: '2026-09-30' }) // +77d
    expect(clawbackCandidatesFor(paid, [p], [plan])).toHaveLength(0)
  })

  it('claws back on the last day of the window (inclusive)', () => {
    const plan = { ...DEFAULT_PLAN, realizationWindowDays: 30 }
    const p = pledge({ cancelled: true, cancellationDate: '2026-08-14' }) // +30d
    expect(clawbackCandidatesFor(paid, [p], [plan])).toHaveLength(1)
  })

  it('respects clawbackOn: a reason not listed is not clawed back', () => {
    const plan = { ...DEFAULT_PLAN, clawbackOn: ['failed_final'] as const }
    const p = pledge({ cancelled: true, cancellationDate: '2026-07-25' })
    expect(clawbackCandidatesFor(paid, [p], [plan])).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Netting
// ---------------------------------------------------------------------------

describe('netByFundraiser', () => {
  const lines = generateDraftRun(
    [
      pledge({ serialNo: 'A', amount: 600, debitDate: '2026-07-20' }),
      pledge({ serialNo: 'B', amount: 800, debitDate: '2026-07-21' }),
      pledge({
        serialNo: 'C',
        amount: 500,
        debitDate: '2026-07-22',
        fundraiserName: 'Rico Salvador',
      }),
    ],
    [DEFAULT_PLAN],
    cutoffFor('2026-07-20'),
  )

  it('sums gross per fundraiser', () => {
    const nets = netByFundraiser(lines, [])
    expect(nets.find((n) => n.fundraiserName === 'Grace Tolentino')).toMatchObject({
      pledgeCount: 2,
      gross: 4200, // (600 + 800) x 3
      clawbacks: 0,
      net: 4200,
    })
  })

  it('nets only CONFIRMED clawbacks', () => {
    const unconfirmed = [
      {
        serialNo: 'A',
        fundraiserName: 'Grace Tolentino',
        originalCommission: 1800,
        currency: 'PHP',
        reason: 'cancelled' as const,
        triggeredOn: '2026-07-25',
        confirmed: false,
      },
    ]
    expect(
      netByFundraiser(lines, unconfirmed).find(
        (n) => n.fundraiserName === 'Grace Tolentino',
      )!.clawbacks,
    ).toBe(0)

    const confirmed = [{ ...unconfirmed[0], confirmed: true }]
    const grace = netByFundraiser(lines, confirmed).find(
      (n) => n.fundraiserName === 'Grace Tolentino',
    )!
    expect(grace.clawbacks).toBe(1800)
    expect(grace.net).toBe(2400)
  })

  it('can drive a net negative when clawbacks exceed the run', () => {
    // Real and important: a fundraiser can owe money back, and the run must
    // show that rather than clamping to zero and quietly losing the debt.
    const big = [
      {
        serialNo: 'A',
        fundraiserName: 'Rico Salvador',
        originalCommission: 9000,
        currency: 'PHP',
        reason: 'cancelled' as const,
        triggeredOn: '2026-07-25',
        confirmed: true,
      },
    ]
    const rico = netByFundraiser(lines, big).find(
      (n) => n.fundraiserName === 'Rico Salvador',
    )!
    expect(rico.gross).toBe(1500)
    expect(rico.net).toBe(-7500)
  })
})

// ---------------------------------------------------------------------------
// Currency safety — the operation spans PH and Malaysia
// ---------------------------------------------------------------------------

describe('mixed currencies', () => {
  it('never adds PHP and MYR into one total', () => {
    // Every fundraiser in the real book works both PH and MY sites, so this is
    // the normal case, not an edge case. Summing across currencies without an
    // FX rate produces a number that means nothing — and it would look
    // plausible on a payslip.
    const lines = generateDraftRun(
      [
        pledge({ serialNo: 'PH1', amount: 600, currency: 'PHP', debitDate: '2026-07-20' }),
        pledge({ serialNo: 'MY1', amount: 100, currency: 'MYR', debitDate: '2026-07-21' }),
      ],
      [DEFAULT_PLAN],
      cutoffFor('2026-07-20'),
    )
    const nets = netByFundraiser(lines, [])

    // One row per fundraiser PER CURRENCY.
    expect(nets).toHaveLength(2)
    const php = nets.find((n) => n.currency === 'PHP')!
    const myr = nets.find((n) => n.currency === 'MYR')!
    expect(php.gross).toBe(1800) // 600 x 3
    expect(myr.gross).toBe(300) // 100 x 3
    // The bug this guards: a single 2100 row, mixing pesos and ringgit.
    expect(nets.some((n) => n.gross === 2100)).toBe(false)
  })

  it('nets a clawback only against its own currency', () => {
    const lines = generateDraftRun(
      [
        pledge({ serialNo: 'PH1', amount: 600, currency: 'PHP', debitDate: '2026-07-20' }),
        pledge({ serialNo: 'MY1', amount: 100, currency: 'MYR', debitDate: '2026-07-21' }),
      ],
      [DEFAULT_PLAN],
      cutoffFor('2026-07-20'),
    )
    const clawback = [
      {
        serialNo: 'MY1',
        fundraiserName: 'Grace Tolentino',
        originalCommission: 300,
        currency: 'MYR',
        reason: 'cancelled' as const,
        triggeredOn: '2026-07-25',
        confirmed: true,
      },
    ]
    const nets = netByFundraiser(lines, clawback)
    expect(nets.find((n) => n.currency === 'MYR')!.net).toBe(0)
    // The peso row must be untouched by a ringgit clawback.
    expect(nets.find((n) => n.currency === 'PHP')!.net).toBe(1800)
  })
})

// ---------------------------------------------------------------------------
// Rejected, then approved
//
// Raised by the owners 2026-08-07: "there are times where a donor is rejected
// to approved so that needs changing to be payable." These lock in that a
// pledge which the bank first declines and later approves becomes payable, in
// the cutoff containing the APPROVAL — and that a stale 'rejected' current
// status never suppresses it.
// ---------------------------------------------------------------------------

describe('a pledge rejected and later approved', () => {
  it('is payable in the cutoff containing the approval, not the rejection', () => {
    // Declined 3 July, approved on retry 20 July.
    const p = pledge({ signupDate: '2026-07-01', submittedAt: '2026-07-02', debitDate: '2026-07-20' })

    const firstHalf = generateDraftRun([p], [DEFAULT_PLAN], cutoffFor('2026-07-08'))
    const secondHalf = generateDraftRun([p], [DEFAULT_PLAN], cutoffFor('2026-07-20'))

    expect(firstHalf).toHaveLength(0)
    expect(secondHalf).toHaveLength(1)
    expect(secondHalf[0].eligibilityDate).toBe('2026-07-20')
  })

  it('is payable even while its CURRENT status is a failure', () => {
    // Approved in July, then a later monthly billing failed. The commission on
    // the first successful billing is still owed — current status must not
    // retroactively unpay it.
    const p = pledge({
      debitDate: '2026-07-08',
      currentClassification: 'failed_retryable',
    })
    const run = generateDraftRun([p], [DEFAULT_PLAN], cutoffFor('2026-07-08'))

    expect(run).toHaveLength(1)
    expect(run[0].commission).toBeGreaterThan(0)
  })

  it('is not payable while it has only ever been rejected', () => {
    const p = pledge({ debitDate: null, currentClassification: 'failed_retryable' })

    expect(eligibilityDateFor(p, DEFAULT_PLAN)).toBeNull()
    expect(generateDraftRun([p], [DEFAULT_PLAN], cutoffFor('2026-07-08'))).toHaveLength(0)
  })

  it('pays once, not twice, when a later billing also succeeds', () => {
    // Two approved billings in the same window must not create two payout
    // lines under the default first-approval rule.
    const p = pledge({
      debitDate: '2026-07-08',
      approvedBillingDates: ['2026-07-08', '2026-07-12'],
    })
    const run = generateDraftRun([p], [DEFAULT_PLAN], cutoffFor('2026-07-08'))

    expect(run).toHaveLength(1)
  })

  it('is not clawed back for the failure that preceded its approval', () => {
    // The pledge is currently fine; an earlier decline is history, not a
    // reason to reverse the commission.
    const p = pledge({ debitDate: '2026-07-20', currentClassification: 'approved' })
    const paid = [
      { serialNo: p.serialNo, commission: 1800, paidOn: '2026-07-30', currency: 'PHP' as const },
    ]

    expect(clawbackCandidatesFor(paid, [p], [DEFAULT_PLAN])).toHaveLength(0)
  })
})
