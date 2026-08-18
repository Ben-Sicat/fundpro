/**
 * Export presets.
 *
 * A preset is not a new kind of report — it is a saved
 * `(columns, filter, date basis, PII level)` over the consolidated master.
 * One engine generates all of them, which is why adding a preset costs nothing
 * and why every preset can be counted before it is generated.
 *
 * Presets are grouped by WHO IS ASKING rather than by table. Someone who does
 * not know the report catalogue can still find the right file by asking "who
 * needs this?" — and that grouping matches the services the agency bills for.
 */
import type { PledgeFilters } from '@/lib/data/filters'

export type Audience =
  | 'Safety net'
  | 'For the bank'
  | 'For the charity'
  | 'For payroll'
  | 'For the team'

export const AUDIENCE_ORDER: Audience[] = [
  'Safety net',
  'For the team',
  'For payroll',
  'For the charity',
  'For the bank',
]

export const AUDIENCE_BLURB: Record<Audience, string> = {
  'Safety net': 'The legacy master copies, byte-compatible with the spreadsheets in use today.',
  'For the team': 'Work queues — who to call, what to fix, what would not consolidate.',
  'For payroll': 'What to pay, what to reclaim, and how each fundraiser performed.',
  'For the charity': 'What the client is billed and what was delivered.',
  'For the bank': 'Outbound submission files.',
}

export interface ExportPreset {
  code: string
  name: string
  audience: Audience
  /** What it contains. */
  description: string
  /** When you would actually send it — the trigger, in business terms. */
  when: string
  columnCount: number
  piiLevel: 'full' | 'masked' | 'none'
  /**
   * Serializable filter over the consolidated master. Serializable matters:
   * a preset is stored as JSON in export_templates.filters, so it can never be
   * a closure.
   */
  filter: PledgeFilters
  /** True for the exact-layout legacy reproductions. */
  legacy?: boolean
  /** Suggested schedule, if this is one people want on a cadence. */
  cadence?: string
  /** Aggregate-only reports are not row-per-pledge, so a count would mislead. */
  aggregate?: boolean
  /**
   * Which collection the row count comes from. Getting this wrong is worse than
   * showing nothing: "Import Exceptions — 420 rows" when six rows failed would
   * send someone hunting for a problem that does not exist.
   *
   *   'pledges'    one row per application (default)
   *   'events'     one row per bank outcome — the billing history is longer
   *                than the application list
   *   'exceptions' one row per unconsolidated row
   *   'per-upload' only meaningful once a batch is chosen; no total to show
   */
  countsFrom?: 'pledges' | 'events' | 'exceptions' | 'per-upload'
}

export const PRESETS: ExportPreset[] = [
  // ---- Safety net -------------------------------------------------------
  {
    code: 'A1',
    name: 'Master Apps Tracker',
    audience: 'Safety net',
    description:
      'The full legacy layout — 111 columns, headers byte-for-byte including CUSTOMER’S NAME and Fax AREACODE.',
    when: 'Any time you want the spreadsheet back, exactly as it was.',
    columnCount: 111,
    piiLevel: 'full',
    filter: {},
    legacy: true,
  },
  {
    code: 'A2',
    name: 'Master Results Tracker',
    audience: 'Safety net',
    description: 'All 26 bank columns, flattened from the accumulated billing history.',
    when: 'Alongside A1, as the paired master copy.',
    columnCount: 26,
    piiLevel: 'full',
    filter: {},
    legacy: true,
    countsFrom: 'events',
  },
  {
    code: 'A3',
    name: 'Daily Status Report snapshot',
    audience: 'Safety net',
    description:
      'The 26 columns scoped to a single upload, plus import batch id and time.',
    when: 'Right after consolidating a file, to show exactly what it contained.',
    columnCount: 28,
    piiLevel: 'full',
    filter: {},
    legacy: true,
    countsFrom: 'per-upload',
  },

  // ---- For the team -----------------------------------------------------
  {
    code: 'B2',
    name: 'Retry / Failed Billing Queue',
    audience: 'For the team',
    description:
      'Everything currently failing, with attempts, days in state and card-expiry risk.',
    when: 'Every morning, to CS — this is the call list.',
    columnCount: 16,
    piiLevel: 'full',
    filter: { status: 'retrying' },
    cadence: 'Daily',
  },
  {
    code: 'B3',
    name: 'Verification Backlog',
    audience: 'For the team',
    description: 'Unverified sign-ups ranked by how long they have waited for a call.',
    when: 'Daily, to whoever makes verification calls.',
    columnCount: 10,
    piiLevel: 'full',
    filter: { verified: false },
    cadence: 'Daily',
  },
  {
    code: 'B1',
    name: 'Pledge Lifecycle',
    audience: 'For the team',
    description: 'One row per application across all seven dates, with realization flags.',
    when: 'For any ad-hoc question about where things stand.',
    columnCount: 22,
    piiLevel: 'masked',
    filter: {},
  },
  {
    code: 'B4',
    name: 'Import Exceptions',
    audience: 'For the team',
    description: 'Every row that would not consolidate, with the raw values as received.',
    when: 'After an upload with exceptions, to whoever fixes the source data.',
    columnCount: 11,
    piiLevel: 'masked',
    filter: {},
    countsFrom: 'exceptions',
  },

  // ---- For payroll ------------------------------------------------------
  {
    code: 'C1',
    name: 'Payroll Run',
    audience: 'For payroll',
    description: 'Detail and summary sheets for one semi-monthly cutoff.',
    when: 'At each cutoff — the ~15th and the ~30th.',
    columnCount: 14,
    piiLevel: 'masked',
    filter: { status: 'realized' },
    cadence: 'Semi-monthly',
  },
  {
    code: 'C2',
    name: 'Clawback Ledger',
    audience: 'For payroll',
    description: 'Commission reversed, why, and which run it netted into.',
    when: 'With every payroll run, and whenever a paid pledge cancels.',
    columnCount: 11,
    piiLevel: 'masked',
    filter: { status: 'cancelled' },
  },
  {
    code: 'C3',
    name: 'Fundraiser Performance Statement',
    audience: 'For payroll',
    description: 'Monthly sign-ups, realization rate, earnings and rank.',
    when: 'Monthly, to each fundraiser and their leader.',
    columnCount: 13,
    piiLevel: 'none',
    filter: {},
    cadence: 'Monthly',
    aggregate: true,
  },

  // ---- For the charity --------------------------------------------------
  {
    code: 'D1',
    name: 'Charity Invoice',
    audience: 'For the charity',
    description: 'Charge and clawback-credit lines with a running total.',
    when: 'At each invoice run, per charity.',
    columnCount: 12,
    piiLevel: 'masked',
    filter: { status: 'realized' },
    cadence: 'Monthly',
  },
  {
    code: 'D2',
    name: 'Charity Donor Delivery',
    audience: 'For the charity',
    description:
      'Aggregate delivery per charity. No PII at all — safe to send outward as-is.',
    when: 'Monthly, to the client. Fans out one file per charity.',
    columnCount: 10,
    piiLevel: 'none',
    filter: {},
    cadence: 'Monthly',
    aggregate: true,
  },
  {
    code: 'D3',
    name: 'Management P&L',
    audience: 'For the charity',
    description: 'Revenue, commission cost and margin per charity per month.',
    when: 'Monthly, internal — this is the profitability view.',
    columnCount: 13,
    piiLevel: 'none',
    filter: {},
    cadence: 'Monthly',
    aggregate: true,
  },

  // ---- For the bank -----------------------------------------------------
  {
    code: 'E1',
    name: 'Bank Submission File',
    audience: 'For the bank',
    description:
      'New verified applications in the bank’s layout. Column set still pending the bank spec.',
    when: 'Each submission batch.',
    columnCount: 46,
    piiLevel: 'full',
    filter: {},
  },
]

export const PRESETS_BY_CODE = new Map(PRESETS.map((p) => [p.code, p]))

/**
 * What a consolidation run made newly true, and therefore which exports just
 * became worth sending.
 *
 * This is the inversion that makes presets useful: a passive list requires
 * someone to already know which report they want, whereas an upload knows what
 * changed. Each suggestion is an existing preset with a "changed in this
 * upload" filter applied — no new report types.
 */
export interface SuggestedExport {
  code: string
  name: string
  /** Rows this export would contain for this upload. */
  rows: number
  /** Why it is being suggested, in business terms. */
  reason: string
  piiLevel: ExportPreset['piiLevel']
  urgent?: boolean
}

export interface UploadImpact {
  uploadId: string
  newlyApproved: number
  newlyRetrying: number
  newlyFailedFinal: number
  newlyCancelled: number
  exceptions: number
  /** Whether this file changed the master copies at all. */
  changedMaster: boolean
  /** Applications created by this file. Only an Apps Tracker adds any. */
  newPledges?: number
  suggested: SuggestedExport[]
}

/**
 * Builds the suggestion list from an impact tally.
 *
 * Entries are merged BY REPORT CODE: two different changes can point at the
 * same report (a retryable failure and a final failure both belong in the retry
 * queue), and listing that report twice reads as a bug rather than as two
 * reasons. Counts add up and the reasons are joined.
 */
export function suggestionsFor(
  impact: Omit<UploadImpact, 'suggested'>,
): SuggestedExport[] {
  const byCode = new Map<string, SuggestedExport>()

  const add = (code: string, rows: number, reason: string, urgent = false) => {
    const preset = PRESETS_BY_CODE.get(code)
    if (!preset || rows <= 0) return
    const existing = byCode.get(code)
    if (existing) {
      existing.rows += rows
      existing.reason = `${existing.reason}; ${reason}`
      existing.urgent = existing.urgent || urgent
      return
    }
    byCode.set(code, {
      code,
      name: preset.name,
      rows,
      reason,
      piiLevel: preset.piiLevel,
      urgent,
    })
  }

  if (impact.newlyApproved > 0) {
    add('D1', impact.newlyApproved, `${impact.newlyApproved} newly approved → invoice the charity`)
    add('C1', impact.newlyApproved, `${impact.newlyApproved} became payroll-eligible`)
  }
  if (impact.newlyRetrying > 0) {
    add('B2', impact.newlyRetrying, `${impact.newlyRetrying} newly failed → CS call list`, true)
  }
  if (impact.newlyFailedFinal > 0) {
    add('B2', impact.newlyFailedFinal, `${impact.newlyFailedFinal} failed for good → need a new payment method`, true)
  }
  if (impact.newlyCancelled > 0) {
    add('C2', impact.newlyCancelled, `${impact.newlyCancelled} cancelled → reclaim commission`, true)
  }
  if (impact.exceptions > 0) {
    add('B4', impact.exceptions, `${impact.exceptions} rows would not consolidate`, true)
  }
  if (impact.changedMaster) {
    add('A3', 1, 'Snapshot of exactly what this file contained')
  }

  // Urgent work first, then by size — the call list should not sit below a
  // routine snapshot.
  return Array.from(byCode.values()).sort(
    (a, b) => Number(b.urgent ?? false) - Number(a.urgent ?? false) || b.rows - a.rows,
  )
}
