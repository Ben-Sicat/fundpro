/**
 * DATA ACCESS SEAM.
 *
 * Every page reads its data through these functions and nothing else. Today
 * they return mock data synchronously-but-async; when the Python preprocessing
 * API exists, each body becomes a `fetch` and no component changes.
 *
 * Keeping them async now is deliberate: if they were sync, every call site
 * would need rewriting the day the API lands.
 *
 *   const res = await fetch(`${process.env.PREPROCESS_API_URL}/pledges?...`, {
 *     headers: { Authorization: `Bearer ${process.env.PREPROCESS_API_KEY}` },
 *     next: { revalidate: 60 },
 *   })
 *   return PledgeSchema.array().parse(await res.json())
 *
 * Validate responses with Zod at that boundary — the Python service is a
 * separate deployable and its payload is untrusted input.
 */
import {
  BILLING_EVENTS,
  DONORS,
  EXCEPTIONS,
  EXPORT_RUNS,
  EXPORT_TEMPLATES,
  PAYROLL_RUNS,
  PLEDGES,
  STATUS_CODES,
  UPLOADS,
  computeFundraiserPerformance,
  computeFundraiserRecords,
  computeKpis,
  computeLeaderRecords,
  computeSitePerformance,
  computeTimeSeries,
  type FundraiserRecord,
  type LeaderRecord,
} from '@/lib/mock/dataset'
import {
  DEFAULT_PLAN,
  clawbackCandidatesFor,
  cutoffFor,
  generateDraftRun,
  netByFundraiser,
  type ClawbackCandidate,
  type Cutoff,
  type FundraiserNet,
  type PayoutLine,
  type PayrollPledge,
} from '@/lib/services/payroll'
import {
  PRESETS,
  suggestionsFor,
  type ExportPreset,
  type UploadImpact,
} from '@/lib/exports/presets'
import type {
  BillingEvent,
  Donor,
  ExportRun,
  ExportTemplate,
  FundraiserPerformance,
  ImportException,
  Kpis,
  PayrollRun,
  Pledge,
  SitePerformance,
  StatusClassification,
  StatusCode,
  TimePoint,
  Upload,
} from '@/lib/types'

/** Which of the seven lifecycle dates a date filter applies to. */
export type DateBasis =
  | 'signupDate'
  | 'submittedAt'
  | 'debitDate'
  | 'verifiedAt'
  | 'cancellationDate'
  | 'invoicedDate'
  | 'payoutDate'

export const DATE_BASIS_LABELS: Record<DateBasis, string> = {
  signupDate: 'Sign-up date',
  submittedAt: 'Submitted to bank',
  debitDate: 'Debit date',
  verifiedAt: 'Verification date',
  cancellationDate: 'Cancellation date',
  invoicedDate: 'Invoice date',
  payoutDate: 'Payroll date',
}

export interface PledgeFilters {
  q?: string
  charityCode?: string
  status?: 'realized' | 'retrying' | 'failed' | 'cancelled' | 'pending'
  fundraiserName?: string
  siteName?: string
  /** Matches any fundraiser who reports to this leader, primary or not. */
  leaderName?: string
  /** Verification-call gate: false selects the backlog still awaiting a call. */
  verified?: boolean
  basis?: DateBasis
  from?: string
  to?: string
}

/**
 * Every leader a fundraiser reports to. The pledge row stores only the primary
 * leader, so filtering on that alone would hide the second team a shared
 * fundraiser belongs to.
 */
const LEADERS_BY_FUNDRAISER = new Map(
  computeFundraiserRecords().map((f) => [f.name, f.leaderNames]),
)
const leadersOf = (name: string) => LEADERS_BY_FUNDRAISER.get(name) ?? []

function matches(p: Pledge, f: PledgeFilters): boolean {
  if (f.q) {
    const q = f.q.toLowerCase()
    const hit =
      p.serialNo.toLowerCase().includes(q) ||
      p.donorName.toLowerCase().includes(q) ||
      p.fundraiserName.toLowerCase().includes(q) ||
      p.donorEmail.toLowerCase().includes(q)
    if (!hit) return false
  }
  if (f.charityCode && p.charityCode !== f.charityCode) return false
  if (f.fundraiserName && p.fundraiserName !== f.fundraiserName) return false
  if (f.siteName && p.siteName !== f.siteName) return false
  if (f.leaderName && !leadersOf(p.fundraiserName).includes(f.leaderName)) return false
  if (f.verified !== undefined && p.verified !== f.verified) return false

  if (f.status) {
    const realized = p.debitDate !== null && !p.cancelled
    const cls = p.currentClassification
    const ok =
      f.status === 'realized'
        ? realized
        : f.status === 'retrying'
          ? cls === 'failed_retryable'
          : f.status === 'failed'
            ? cls === 'failed_final'
            : f.status === 'cancelled'
              ? p.cancelled
              : p.submittedAt === null
    if (!ok) return false
  }

  if (f.basis && (f.from || f.to)) {
    const v = p[f.basis]
    if (!v) return false
    if (f.from && v < f.from) return false
    if (f.to && v > f.to) return false
  }
  return true
}

export async function getPledges(filters: PledgeFilters = {}): Promise<Pledge[]> {
  return PLEDGES.filter((p) => matches(p, filters))
}

export async function getPledge(serialNo: string): Promise<Pledge | null> {
  return PLEDGES.find((p) => p.serialNo === serialNo) ?? null
}

export async function getBillingEvents(serialNo: string): Promise<BillingEvent[]> {
  return BILLING_EVENTS.filter((e) => e.serialNo === serialNo).sort((a, b) =>
    a.statusDate.localeCompare(b.statusDate),
  )
}

export async function getKpis(filters: PledgeFilters = {}): Promise<Kpis> {
  return computeKpis(PLEDGES.filter((p) => matches(p, filters)))
}

export async function getTimeSeries(
  filters: PledgeFilters = {},
): Promise<TimePoint[]> {
  return computeTimeSeries(PLEDGES.filter((p) => matches(p, filters)))
}

export async function getFundraiserPerformance(
  filters: PledgeFilters = {},
): Promise<FundraiserPerformance[]> {
  return computeFundraiserPerformance(PLEDGES.filter((p) => matches(p, filters)))
}

export async function getSitePerformance(
  filters: PledgeFilters = {},
): Promise<SitePerformance[]> {
  return computeSitePerformance(PLEDGES.filter((p) => matches(p, filters)))
}

/** Approved / retrying / failed-final / cancelled split of submitted rows. */
export async function getResultsSplit(filters: PledgeFilters = {}): Promise<
  { label: string; value: number; classification: string }[]
> {
  const rows = PLEDGES.filter((p) => matches(p, filters)).filter(
    (p) => p.submittedAt !== null,
  )
  const count = (fn: (p: Pledge) => boolean) => rows.filter(fn).length
  return [
    {
      label: 'Approved',
      value: count((p) => p.debitDate !== null && !p.cancelled),
      classification: 'approved',
    },
    {
      label: 'Retrying',
      value: count((p) => p.currentClassification === 'failed_retryable'),
      classification: 'failed_retryable',
    },
    {
      label: 'Failed final',
      value: count((p) => p.currentClassification === 'failed_final'),
      classification: 'failed_final',
    },
    {
      label: 'Cancelled',
      value: count((p) => p.cancelled),
      classification: 'cancelled',
    },
  ].filter((d) => d.value > 0)
}

/** Approval rate per payment instrument — the CC vs Debit question. */
export async function getInstrumentSplit(filters: PledgeFilters = {}): Promise<
  { label: string; count: number; approvalRate: number }[]
> {
  const rows = PLEDGES.filter((p) => matches(p, filters))
  return (['CREDIT CARD', 'DEBIT CARD'] as const).map((inst) => {
    const list = rows.filter((p) => p.instrumentType === inst)
    const submitted = list.filter((p) => p.submittedAt !== null)
    const realized = list.filter((p) => p.debitDate !== null && !p.cancelled)
    return {
      label: inst === 'CREDIT CARD' ? 'Credit card' : 'Debit card',
      count: list.length,
      approvalRate: submitted.length ? realized.length / submitted.length : 0,
    }
  })
}

/** Age bands with realization rate — 25–30 is the typical acquisition band. */
export async function getAgeBands(filters: PledgeFilters = {}): Promise<
  { band: string; count: number; realizationRate: number }[]
> {
  const rows = PLEDGES.filter((p) => matches(p, filters))
  const bands: [string, number, number][] = [
    ['18–24', 18, 24],
    ['25–30', 25, 30],
    ['31–40', 31, 40],
    ['41–50', 41, 50],
    ['51+', 51, 200],
  ]
  const ageOf = (dob: string) =>
    Math.floor(
      (new Date('2026-07-27').getTime() - new Date(dob).getTime()) /
        (365.25 * 86400000),
    )
  return bands.map(([band, lo, hi]) => {
    const list = rows.filter((p) => {
      const a = ageOf(p.donorDob)
      return a >= lo && a <= hi
    })
    const submitted = list.filter((p) => p.submittedAt !== null)
    const realized = list.filter((p) => p.debitDate !== null && !p.cancelled)
    return {
      band,
      count: list.length,
      realizationRate: submitted.length ? realized.length / submitted.length : 0,
    }
  })
}

export async function getFrequencyMix(
  filters: PledgeFilters = {},
): Promise<{ label: string; value: number }[]> {
  const rows = PLEDGES.filter((p) => matches(p, filters))
  return (['Monthly', 'Quarterly', 'Semi-Annual', 'Annual'] as const)
    .map((f) => ({ label: f, value: rows.filter((p) => p.frequency === f).length }))
    .filter((d) => d.value > 0)
}

export async function getUploads(): Promise<Upload[]> {
  return [...UPLOADS].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
}

// ---------------------------------------------------------------------------
// Export presets
// ---------------------------------------------------------------------------

/**
 * Presets with a live row count.
 *
 * Counting is cheap because a preset IS a filter — so the UI can say "214 rows,
 * contains PII" before anyone generates a file, instead of producing an empty
 * workbook to find out.
 */
export async function getPresetSummaries(): Promise<
  (ExportPreset & { rows: number | null })[]
> {
  const openExceptions = EXCEPTIONS.filter((e) => !e.resolved).length

  return PRESETS.map((preset) => {
    // Count from the collection the report is actually built on. A wrong count
    // is worse than none: "Import Exceptions — 420 rows" when six rows failed
    // sends someone hunting for a problem that does not exist.
    let rows: number | null
    if (preset.aggregate) {
      rows = null // not row-per-application; no comparable figure
    } else {
      switch (preset.countsFrom) {
        case 'events':
          rows = BILLING_EVENTS.length
          break
        case 'exceptions':
          rows = openExceptions
          break
        case 'per-upload':
          rows = null // only meaningful once a batch is chosen
          break
        default:
          rows = PLEDGES.filter((p) => matches(p, preset.filter)).length
      }
    }
    return { ...preset, rows }
  })
}

/**
 * What one upload changed, derived from the billing events it carried.
 *
 * This is real derivation, not a stored summary: the events know which upload
 * they arrived in, so the impact is recomputed from the append-only history.
 */
export async function getUploadImpact(uploadId: string): Promise<UploadImpact> {
  const events = BILLING_EVENTS.filter((e) => e.uploadId === uploadId)
  const byClass = (cls: StatusClassification) =>
    events.filter(
      (e) =>
        STATUS_CODES.find((s) => s.statusId === e.statusId)?.classification === cls,
    ).length

  const exceptions = EXCEPTIONS.filter(
    (e) => e.uploadId === uploadId && !e.resolved,
  ).length

  const base = {
    uploadId,
    newlyApproved: byClass('approved'),
    newlyRetrying: byClass('failed_retryable'),
    newlyFailedFinal: byClass('failed_final'),
    newlyCancelled: byClass('cancelled'),
    exceptions,
    changedMaster: events.length > 0,
  }

  return { ...base, suggested: suggestionsFor(base) }
}

export async function getExceptions(): Promise<ImportException[]> {
  return [...EXCEPTIONS].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getDonors(q?: string): Promise<Donor[]> {
  const rows = q
    ? DONORS.filter(
        (d) =>
          d.fullName.toLowerCase().includes(q.toLowerCase()) ||
          d.email.toLowerCase().includes(q.toLowerCase()),
      )
    : DONORS
  return [...rows].sort((a, b) => b.pledgeCount - a.pledgeCount)
}

export async function getExportTemplates(): Promise<ExportTemplate[]> {
  return EXPORT_TEMPLATES
}

export async function getExportRuns(): Promise<ExportRun[]> {
  return EXPORT_RUNS
}

export async function getPayrollRuns(): Promise<PayrollRun[]> {
  return PAYROLL_RUNS
}

export async function getStatusCodes(): Promise<StatusCode[]> {
  return STATUS_CODES
}

export async function getCharities(): Promise<string[]> {
  return Array.from(new Set(PLEDGES.map((p) => p.charityCode))).sort()
}

export async function getFundraiserNames(): Promise<string[]> {
  return Array.from(new Set(PLEDGES.map((p) => p.fundraiserName))).sort()
}

export async function getSiteNames(): Promise<string[]> {
  return Array.from(new Set(PLEDGES.map((p) => p.siteName))).sort()
}

// ---------------------------------------------------------------------------
// Payroll — derived, not mocked
// ---------------------------------------------------------------------------

/**
 * A payroll run computed by lib/services/payroll.ts from the actual pledge
 * data, rather than the canned figures in the mock dataset.
 *
 * This matters beyond the demo: payroll is the most error-prone thing the team
 * does by hand, so the numbers on screen must come from the same tested rules
 * that a real run would use. A screen showing plausible-but-invented totals is
 * worse than no screen.
 */
export async function getDerivedPayrollRun(asOf = '2026-07-28'): Promise<{
  cutoff: Cutoff
  lines: PayoutLine[]
  nets: FundraiserNet[]
  clawbacks: ClawbackCandidate[]
}> {
  // Approved billing dates per serial, for the on_n_billings trigger.
  const approvedBySerial = new Map<string, string[]>()
  for (const e of BILLING_EVENTS) {
    const cls = STATUS_CODES.find((s) => s.statusId === e.statusId)?.classification
    if (cls !== 'approved') continue
    const list = approvedBySerial.get(e.serialNo) ?? []
    list.push(e.statusDate)
    approvedBySerial.set(e.serialNo, list)
  }

  const payrollPledges: PayrollPledge[] = PLEDGES.map((p) => ({
    serialNo: p.serialNo,
    fundraiserName: p.fundraiserName,
    charityCode: p.charityCode,
    amount: p.amount,
    currency: p.currency,
    signupDate: p.signupDate,
    submittedAt: p.submittedAt,
    debitDate: p.debitDate,
    cancellationDate: p.cancellationDate,
    cancelled: p.cancelled,
    approvedBillingDates: (approvedBySerial.get(p.serialNo) ?? []).sort(),
    currentClassification: p.currentClassification,
  }))

  const cutoff = cutoffFor(asOf)
  const plans = [DEFAULT_PLAN]
  const lines = generateDraftRun(payrollPledges, plans, cutoff)

  // Already-paid commissions, for clawback detection.
  const paid = PLEDGES.filter((p) => p.payoutDate && p.commissionAmount).map((p) => ({
    serialNo: p.serialNo,
    commission: p.commissionAmount!,
    paidOn: p.payoutDate!,
    currency: p.currency,
  }))
  const clawbacks = clawbackCandidatesFor(paid, payrollPledges, plans)

  return { cutoff, lines, nets: netByFundraiser(lines, clawbacks), clawbacks }
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export async function getFundraiserRecords(
  filters: PledgeFilters = {},
): Promise<FundraiserRecord[]> {
  return computeFundraiserRecords(PLEDGES.filter((p) => matches(p, filters)))
}

export async function getLeaderRecords(
  filters: PledgeFilters = {},
): Promise<LeaderRecord[]> {
  return computeLeaderRecords(PLEDGES.filter((p) => matches(p, filters)))
}

export async function getLeaderNames(): Promise<string[]> {
  return (await getLeaderRecords()).map((l) => l.name)
}
