/**
 * Payroll derivation — pure functions, no I/O, so every rule is unit-testable.
 *
 * HOW THIS WAS DERIVED (docs/FINDINGS.md §3.7): measured across all 8 sheets of
 * the client's payroll reference workbook.
 *
 *  - Eligibility is EVIDENCE-BACKED, not assumed. The reference sheet's
 *    INCENTIVE column holds either a commission or, on 545 rows, the bank
 *    failure reason instead ("DO NOT HONOR", "INSUFFICIENT FUNDS", …). A
 *    fundraiser is therefore paid only when the pledge actually BILLED, which
 *    settles the spec's open acquisition-vs-approval question in favour of
 *    `on_first_approval`.
 *
 *  - Commission is `pledge_amount × multiplier` (683 rows carry the literal
 *    formula `=H{row}*n`). Observed multipliers: ×0.5, ×1.5, ×2, ×2.5, ×3, ×4,
 *    with ×3 the mode — hence the default here.
 *
 *  - WHAT DRIVES the multiplier is still unknown: frequency, campaign, period
 *    and fundraiser were each tested and ruled out (29 of 44 fundraisers use
 *    several different multipliers). So the rate stays a plan field and is
 *    never inferred in code.
 */

export type TriggerRule = 'on_submission' | 'on_first_approval' | 'on_n_billings'

export interface CommissionPlan {
  id: string
  name: string
  /** null = applies to every charity. */
  charityCode: string | null
  triggerRule: TriggerRule
  /** Required when triggerRule is 'on_n_billings'. */
  triggerN?: number | null
  /**
   * Percent of pledge amount: 300 = ×3.0. Stored as percent (not a raw
   * multiplier) to match commission_plans.pct_of_pledge numeric(5,2).
   */
  pctOfPledge: number
  /** Flat amount instead of a percentage, if the client ever uses one. */
  flatAmount?: number | null
  /** Days after eligibility during which a failure claws the commission back. */
  realizationWindowDays: number
  clawbackOn: readonly ('cancelled' | 'failed_final' | 'unrealized')[]
  /** Plans are effective-dated so historic runs never change retroactively. */
  effectiveFrom: string
}

/** The minimum a pledge must expose to be paid on. */
export interface PayrollPledge {
  serialNo: string
  fundraiserName: string
  charityCode: string
  amount: number
  currency: string
  signupDate: string
  submittedAt: string | null
  /** First successful billing — the money moment. */
  debitDate: string | null
  cancellationDate: string | null
  cancelled: boolean
  /** Status dates of approved billing events, ascending. For on_n_billings. */
  approvedBillingDates?: readonly string[]
  currentClassification:
    | 'approved'
    | 'failed_retryable'
    | 'failed_final'
    | 'cancelled'
    | 'other'
    | null
}

export interface Cutoff {
  /** Inclusive ISO date. */
  start: string
  /** Inclusive ISO date. */
  end: string
  /** Suggested pay date; editable on the draft (exact date is unconfirmed). */
  runDate: string
  label: string
}

export interface PayoutLine {
  serialNo: string
  fundraiserName: string
  charityCode: string
  pledgeAmount: number
  currency: string
  commission: number
  /** Which rule made this line eligible, for the C1 export column. */
  conditionApplied: TriggerRule
  eligibilityDate: string
  planId: string
}

export interface ClawbackCandidate {
  serialNo: string
  fundraiserName: string
  /** The commission originally paid. */
  originalCommission: number
  /** Currency of the original commission — a clawback only nets against its own. */
  currency: string
  reason: 'cancelled' | 'failed_final' | 'unrealized'
  /** When the pledge went bad. */
  triggeredOn: string
  /** Candidates are proposed, never auto-netted: an admin confirms first. */
  confirmed: boolean
}

/**
 * One row per fundraiser PER CURRENCY.
 *
 * The agency operates in the Philippines and Malaysia and, in the real book,
 * every fundraiser has both PHP and MYR pledges. Summing them would produce a
 * single plausible-looking figure that means nothing — and it would be printed
 * on a payslip. Converting would need an FX rate and a rate date, which is a
 * business decision, not something to invent here. So the currencies stay
 * separate and visible.
 */
export interface FundraiserNet {
  fundraiserName: string
  currency: string
  pledgeCount: number
  gross: number
  clawbacks: number
  net: number
}

// ---------------------------------------------------------------------------
// Dates. All arithmetic is on ISO 'YYYY-MM-DD' in UTC — never Date.getMonth()
// on a local-time Date, which shifts the day either side of midnight in
// Asia/Manila and would move a pledge into the wrong cutoff.
// ---------------------------------------------------------------------------

function parse(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return { y, m, d }
}

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** Last calendar day of a month, leap years included. */
export function endOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parse(iso)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = parse(fromIso)
  const b = parse(toIso)
  return Math.round(
    (Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000,
  )
}

/**
 * The semi-monthly cutoff containing `iso`.
 *
 * CONFIRMED rule: 1st–15th is paid in the ~15th run; 16th–EOM in the ~30th.
 * The pay date is a suggestion — whether it lands on the 15th/30th or the
 * nearest business day is still unconfirmed, so it stays editable on the draft.
 */
export function cutoffFor(iso: string): Cutoff {
  const { y, m, d } = parse(iso)
  const eom = endOfMonth(y, m)
  if (d <= 15) {
    return {
      start: fmt(y, m, 1),
      end: fmt(y, m, 15),
      runDate: fmt(y, m, 15),
      label: `${y}-${pad(m)} 1st–15th`,
    }
  }
  return {
    start: fmt(y, m, 16),
    end: fmt(y, m, eom),
    // 30th, or the 28th/29th in a short month — never an invalid date.
    runDate: fmt(y, m, Math.min(30, eom)),
    label: `${y}-${pad(m)} 16th–${eom}`,
  }
}

/** Both cutoffs of a month, earliest first. */
export function cutoffsInMonth(y: number, m: number): [Cutoff, Cutoff] {
  return [cutoffFor(fmt(y, m, 1)), cutoffFor(fmt(y, m, 16))]
}

// ---------------------------------------------------------------------------
// Plan selection & eligibility
// ---------------------------------------------------------------------------

/**
 * The plan in force for a pledge: the latest one effective at or before its
 * SIGN-UP date, preferring a charity-specific plan over a global one.
 *
 * Keying on signup date (not today) is what stops a new plan silently
 * repricing historic payroll.
 */
export function planForPledge(
  pledge: PayrollPledge,
  plans: readonly CommissionPlan[],
): CommissionPlan | null {
  const eligible = plans
    .filter((p) => p.effectiveFrom <= pledge.signupDate)
    .filter((p) => p.charityCode === null || p.charityCode === pledge.charityCode)
    .sort((a, b) => {
      if (a.effectiveFrom !== b.effectiveFrom)
        return a.effectiveFrom < b.effectiveFrom ? 1 : -1
      // Same date: the charity-specific plan wins over the catch-all.
      const aSpecific = a.charityCode !== null ? 1 : 0
      const bSpecific = b.charityCode !== null ? 1 : 0
      return bSpecific - aSpecific
    })
  return eligible[0] ?? null
}

/**
 * The date a pledge becomes payable, or null if it never has.
 * Returning null (rather than a fallback date) is deliberate: a pledge with no
 * eligibility date must be absent from payroll, not paid on a guessed date.
 */
export function eligibilityDateFor(
  pledge: PayrollPledge,
  plan: CommissionPlan,
): string | null {
  switch (plan.triggerRule) {
    case 'on_submission':
      return pledge.submittedAt
    case 'on_first_approval':
      return pledge.debitDate
    case 'on_n_billings': {
      const n = plan.triggerN ?? 1
      const dates = pledge.approvedBillingDates ?? (pledge.debitDate ? [pledge.debitDate] : [])
      // Nth successful billing; fewer than N means not yet payable.
      return dates.length >= n ? dates[n - 1] : null
    }
  }
}

/** Commission for one pledge. Rounded to whole currency units. */
export function commissionFor(
  pledge: PayrollPledge,
  plan: CommissionPlan,
): number {
  if (plan.flatAmount != null) return Math.round(plan.flatAmount * 100) / 100
  const multiplier = plan.pctOfPledge / 100
  return Math.round(pledge.amount * multiplier * 100) / 100
}

// ---------------------------------------------------------------------------
// Run generation
// ---------------------------------------------------------------------------

/**
 * Draft payout lines for a cutoff: every pledge whose eligibility date falls
 * inside the window, priced by the plan in force at its signup date.
 */
export function generateDraftRun(
  pledges: readonly PayrollPledge[],
  plans: readonly CommissionPlan[],
  cutoff: Cutoff,
): PayoutLine[] {
  const lines: PayoutLine[] = []
  for (const pledge of pledges) {
    const plan = planForPledge(pledge, plans)
    if (!plan) continue
    const eligibleOn = eligibilityDateFor(pledge, plan)
    if (!eligibleOn) continue
    if (eligibleOn < cutoff.start || eligibleOn > cutoff.end) continue

    lines.push({
      serialNo: pledge.serialNo,
      fundraiserName: pledge.fundraiserName,
      charityCode: pledge.charityCode,
      pledgeAmount: pledge.amount,
      currency: pledge.currency,
      commission: commissionFor(pledge, plan),
      conditionApplied: plan.triggerRule,
      eligibilityDate: eligibleOn,
      planId: plan.id,
    })
  }
  return lines.sort(
    (a, b) =>
      a.fundraiserName.localeCompare(b.fundraiserName) ||
      a.eligibilityDate.localeCompare(b.eligibilityDate),
  )
}

/**
 * Clawback candidates: commission already PAID on a pledge that has since gone
 * bad, within the plan's realization window.
 *
 * This is the case the business cares about most and the easiest to get wrong —
 * a paid pledge that later cancels must still be reachable. Candidates are
 * proposed only; an admin confirms before anything is netted.
 */
export function clawbackCandidatesFor(
  paid: readonly {
    serialNo: string
    commission: number
    paidOn: string
    currency?: string
  }[],
  pledges: readonly PayrollPledge[],
  plans: readonly CommissionPlan[],
): ClawbackCandidate[] {
  const bySerial = new Map(pledges.map((p) => [p.serialNo, p]))
  const out: ClawbackCandidate[] = []

  for (const payout of paid) {
    const pledge = bySerial.get(payout.serialNo)
    if (!pledge) continue
    const plan = planForPledge(pledge, plans)
    if (!plan) continue

    let reason: ClawbackCandidate['reason'] | null = null
    let triggeredOn: string | null = null

    if (pledge.cancelled && pledge.cancellationDate) {
      reason = 'cancelled'
      triggeredOn = pledge.cancellationDate
    } else if (pledge.currentClassification === 'failed_final') {
      reason = 'failed_final'
      triggeredOn = pledge.debitDate ?? pledge.submittedAt
    } else if (!pledge.debitDate) {
      // Paid on submission but never billed: unrealized.
      reason = 'unrealized'
      triggeredOn = pledge.submittedAt
    }

    if (!reason || !triggeredOn) continue
    if (!plan.clawbackOn.includes(reason)) continue
    // Outside the window the commission is kept — that is the point of a window.
    if (daysBetween(payout.paidOn, triggeredOn) > plan.realizationWindowDays) continue

    out.push({
      serialNo: pledge.serialNo,
      fundraiserName: pledge.fundraiserName,
      originalCommission: payout.commission,
      // Falls back to the pledge's currency when the payout row omits it.
      currency: payout.currency ?? pledge.currency,
      reason,
      triggeredOn,
      confirmed: false,
    })
  }
  return out
}

/**
 * Net payable per fundraiser. Only CONFIRMED clawbacks are netted — an
 * unconfirmed candidate must never reduce someone's pay.
 */
export function netByFundraiser(
  lines: readonly PayoutLine[],
  clawbacks: readonly ClawbackCandidate[],
): FundraiserNet[] {
  const acc = new Map<string, FundraiserNet>()

  // Keyed on fundraiser AND currency, so pesos and ringgit never land in the
  // same total.
  const row = (name: string, currency: string) => {
    const key = `${name}\u0000${currency}`
    let r = acc.get(key)
    if (!r) {
      r = {
        fundraiserName: name,
        currency,
        pledgeCount: 0,
        gross: 0,
        clawbacks: 0,
        net: 0,
      }
      acc.set(key, r)
    }
    return r
  }

  for (const l of lines) {
    const r = row(l.fundraiserName, l.currency)
    r.pledgeCount += 1
    r.gross += l.commission
  }
  for (const c of clawbacks) {
    if (!c.confirmed) continue
    row(c.fundraiserName, c.currency).clawbacks += c.originalCommission
  }
  for (const r of acc.values()) {
    r.gross = Math.round(r.gross * 100) / 100
    r.clawbacks = Math.round(r.clawbacks * 100) / 100
    r.net = Math.round((r.gross - r.clawbacks) * 100) / 100
  }

  return Array.from(acc.values()).sort(
    (a, b) =>
      a.fundraiserName.localeCompare(b.fundraiserName) ||
      a.currency.localeCompare(b.currency),
  )
}

/**
 * Default plan. ×3.0 is the MEASURED MODE of the client's own sheets
 * (383 of 683 formula rows), not a guess — see docs/FINDINGS.md §3.7.
 * Replace once the client explains what drives the rate.
 */
export const DEFAULT_PLAN: CommissionPlan = {
  id: 'plan_default',
  name: 'Default — ×3.0 of pledge on first approved billing',
  charityCode: null,
  triggerRule: 'on_first_approval',
  pctOfPledge: 300,
  realizationWindowDays: 90,
  clawbackOn: ['cancelled', 'failed_final', 'unrealized'],
  effectiveFrom: '2020-01-01',
}
