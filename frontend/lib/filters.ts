/**
 * Filter parsing, kept separate from the filter-bar component.
 *
 * The bar is a Client Component (it holds collapse state), and server pages
 * need this parser — importing it from a `'use client'` module would drag the
 * whole component into their bundle.
 */
import { DATE_BASIS_LABELS, type DateBasis, type PledgeFilters } from '@/lib/data/filters'

export function filtersFromParams(
  sp: Record<string, string | undefined>,
): PledgeFilters {
  return {
    q: sp.q,
    charityCode: sp.charity,
    siteName: sp.site,
    leaderName: sp.leader,
    fundraiserName: sp.fundraiser,
    status: sp.status as PledgeFilters['status'],
    // Only treat it as a filter when explicitly present; absent means "either".
    verified: sp.verified === undefined ? undefined : sp.verified === 'true',
    basis: (sp.basis as DateBasis) ?? 'signupDate',
    from: sp.from,
    to: sp.to,
  }
}

/**
 * Human-readable summary of the filters in force.
 *
 * Shown on the collapsed bar. Without it, someone could collapse the bar while
 * a client filter is active and then read the numbers as company-wide — the
 * whole page would be lying by omission.
 */
const STATUS_LABELS: Record<string, string> = {
  realized: 'Started paying',
  retrying: 'Payment failed, retrying',
  failed: 'Failed for good',
  cancelled: 'Cancelled',
  pending: 'Not yet sent to bank',
}

export function activeFilterSummary(
  sp: Record<string, string | undefined>,
): string[] {
  const out: string[] = []
  if (sp.charity) out.push(sp.charity)
  if (sp.status) out.push(STATUS_LABELS[sp.status] ?? sp.status)
  if (sp.verified === 'false') out.push('Not yet called')
  if (sp.verified === 'true') out.push('Called and confirmed')
  if (sp.site) out.push(sp.site)
  if (sp.leader) out.push(`Leader: ${sp.leader}`)
  if (sp.fundraiser) out.push(sp.fundraiser)
  if (sp.from || sp.to) {
    const basis = DATE_BASIS_LABELS[(sp.basis as DateBasis) ?? 'signupDate']
    out.push(`${basis}: ${sp.from || '…'} → ${sp.to || '…'}`)
  } else if (sp.basis && sp.basis !== 'signupDate') {
    out.push(DATE_BASIS_LABELS[sp.basis as DateBasis])
  }
  return out
}

// ---------------------------------------------------------------------------
// Filter presets
// ---------------------------------------------------------------------------

/**
 * One-click filter presets.
 *
 * Defined as plain query objects, not code paths, for two reasons: they drop
 * straight into a URL, and when user-saved presets arrive they become rows in
 * a table with exactly this shape — no rewrite.
 *
 * Dates are relative to the dataset's fixed reference day so the demo stays
 * stable; against live data these become offsets from today.
 */
export interface FilterPreset {
  id: string
  label: string
  /** Why someone reaches for it — shown as a tooltip. */
  hint: string
  query: Record<string, string>
}

const TODAY = '2026-07-27'

function shift(days: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'cutoff',
    label: 'This pay period',
    hint: 'The current semi-monthly payroll cutoff, 16th to end of month',
    query: { basis: 'signupDate', from: '2026-07-16', to: '2026-07-31' },
  },
  {
    id: 'month',
    label: 'This month',
    hint: 'Sign-ups so far this calendar month',
    query: { basis: 'signupDate', from: '2026-07-01', to: '2026-07-31' },
  },
  {
    id: 'last30',
    label: 'Last 30 days',
    hint: 'Rolling 30 days by sign-up date',
    query: { basis: 'signupDate', from: shift(-30), to: TODAY },
  },
  {
    id: 'last90',
    label: 'Last 90 days',
    hint: 'Rolling 90 days by sign-up date',
    query: { basis: 'signupDate', from: shift(-90), to: TODAY },
  },
  {
    id: 'money-in',
    label: 'Money collected',
    hint: 'Filtered on DEBIT date — when cards were actually charged, not when donors signed',
    query: { basis: 'debitDate', from: '2026-07-01', to: '2026-07-31' },
  },
  {
    id: 'needs-attention',
    label: 'Needs chasing',
    hint: 'Donors whose payment failed and will be retried',
    query: { status: 'retrying' },
  },
  {
    id: 'unverified',
    label: 'Not yet called',
    hint: 'Sign-ups still waiting on a verification call',
    query: { verified: 'false' },
  },
]

/** True when the current params match this preset exactly. */
export function isPresetActive(
  preset: FilterPreset,
  sp: Record<string, string | undefined>,
): boolean {
  return Object.entries(preset.query).every(([k, v]) => sp[k] === v)
}
