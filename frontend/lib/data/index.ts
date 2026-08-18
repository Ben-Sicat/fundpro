/**
 * DATA ACCESS SEAM.
 *
 * Every page reads its data through these functions and nothing else.
 *
 * There is ONE implementation: the Python processing service, via `./remote`,
 * with every response Zod-checked on arrival. There is deliberately no mock
 * fallback any more.
 *
 * WHY THE MOCK IS GONE. While the UI was being built ahead of the backend, a
 * seeded dataset stood in for it. Once the service was wired up, that fallback
 * became a liability: a page could quietly render invented donors and
 * plausible-looking totals that came from nowhere, which is exactly what
 * happened after the first live upload — real figures next to fabricated ones,
 * with nothing on screen distinguishing them. Every number in this app now
 * traces back to a file somebody uploaded.
 *
 * With no fallback, an unconfigured or unreachable service is an ERROR rather
 * than an empty page. That is the honest outcome: "we cannot reach the
 * service" and "you have not uploaded anything yet" are different states and
 * must not look alike.
 */
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
import { backendEnabled } from '@/lib/api/client'
import * as remote from './remote'
import type { PledgeFilters } from './filters'
import {
  PRESETS,
  suggestionsFor,
  type ExportPreset,
  type UploadImpact,
} from '@/lib/exports/presets'
import type {
  BillingEvent,
  Donor,
  ExportField,
  ExportRun,
  ExportTemplate,
  FundraiserPerformance,
  FundraiserRecord,
  ImportException,
  Kpis,
  LeaderRecord,
  PayrollRun,
  Pledge,
  PledgeNote,
  SitePerformance,
  StatusCode,
  TimePoint,
  Upload,
} from '@/lib/types'

// Re-exported so every existing `from '@/lib/data'` import keeps working.
export {
  DATE_BASIS_LABELS,
  type DateBasis,
  type PledgeFilters,
} from './filters'

export type { FundraiserRecord, LeaderRecord } from '@/lib/types'

/**
 * Fail loudly when the service is not configured.
 *
 * Returning empty data here would render as "no applications yet", which is a
 * lie when the truth is "nobody set PREPROCESS_API_URL". The error boundary
 * showing this message is the correct outcome.
 */
function requireBackend(): void {
  if (!backendEnabled()) {
    throw new Error(
      'The processing service is not configured. Set PREPROCESS_API_URL and ' +
        'PREPROCESS_API_KEY, then reload.',
    )
  }
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function getPledges(filters: PledgeFilters = {}): Promise<Pledge[]> {
  requireBackend()
  return remote.getPledges(filters)
}

export async function getPledge(serialNo: string): Promise<Pledge | null> {
  requireBackend()
  return remote.getPledge(serialNo)
}

export async function getBillingEvents(serialNo: string): Promise<BillingEvent[]> {
  requireBackend()
  return remote.getBillingEvents(serialNo)
}

export async function getPledgeNotes(serialNo: string): Promise<PledgeNote[]> {
  requireBackend()
  return remote.getPledgeNotes(serialNo)
}

export async function addPledgeNote(input: {
  serialNo: string
  author: string
  text: string
}): Promise<PledgeNote> {
  requireBackend()
  return remote.addPledgeNote(input)
}

export async function getDonors(q?: string): Promise<Donor[]> {
  requireBackend()
  return remote.getDonors(q)
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getKpis(filters: PledgeFilters = {}): Promise<Kpis> {
  requireBackend()
  return remote.getKpis(filters)
}

export async function getTimeSeries(filters: PledgeFilters = {}): Promise<TimePoint[]> {
  requireBackend()
  return remote.getTimeSeries(filters)
}

export async function getFundraiserPerformance(
  filters: PledgeFilters = {},
): Promise<FundraiserPerformance[]> {
  requireBackend()
  return remote.getFundraiserPerformance(filters)
}

export async function getSitePerformance(
  filters: PledgeFilters = {},
): Promise<SitePerformance[]> {
  requireBackend()
  return remote.getSitePerformance(filters)
}

export async function getResultsSplit(filters: PledgeFilters = {}) {
  requireBackend()
  return remote.getResultsSplit(filters)
}

export async function getInstrumentSplit(filters: PledgeFilters = {}) {
  requireBackend()
  return remote.getInstrumentSplit(filters)
}

export async function getAgeBands(filters: PledgeFilters = {}) {
  requireBackend()
  return remote.getAgeBands(filters)
}

export async function getFrequencyMix(filters: PledgeFilters = {}) {
  requireBackend()
  return remote.getFrequencyMix(filters)
}

export async function getBankPerformance(filters: PledgeFilters = {}) {
  requireBackend()
  return remote.getBankPerformance(filters)
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export async function getUploads(): Promise<Upload[]> {
  requireBackend()
  return remote.getUploads()
}

export async function getExceptions(): Promise<ImportException[]> {
  requireBackend()
  return remote.getExceptions()
}

export async function getUploadImpact(uploadId: string): Promise<UploadImpact> {
  requireBackend()
  return remote.getUploadImpact(uploadId)
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export async function getExportTemplates(): Promise<ExportTemplate[]> {
  requireBackend()
  return remote.getExportTemplates()
}

export async function getExportFields(): Promise<ExportField[]> {
  requireBackend()
  return remote.getExportFields()
}

export async function getExportRuns(): Promise<ExportRun[]> {
  requireBackend()
  return remote.getExportRuns()
}

export async function getPresetSummaries(): Promise<
  (ExportPreset & { rows: number | null })[]
> {
  requireBackend()
  return remote.getPresetSummaries()
}

export { PRESETS, suggestionsFor, type ExportPreset, type UploadImpact }

// ---------------------------------------------------------------------------
// Reference
// ---------------------------------------------------------------------------

export async function getStatusCodes(): Promise<StatusCode[]> {
  requireBackend()
  return remote.getStatusCodes()
}

export async function getCharities(): Promise<string[]> {
  requireBackend()
  return remote.getCharities()
}

export async function getFundraiserNames(): Promise<string[]> {
  requireBackend()
  return remote.getFundraiserNames()
}

export async function getSiteNames(): Promise<string[]> {
  requireBackend()
  return remote.getSiteNames()
}

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

/**
 * Approved, locked runs.
 *
 * Always empty: nothing has been approved through this platform yet, and the
 * service derives the CURRENT draft rather than storing history. Once approval
 * persists, this becomes a real call.
 */
export async function getPayrollRuns(): Promise<PayrollRun[]> {
  return []
}

export async function getDerivedPayrollRun(asOf = '2026-07-28') {
  requireBackend()
  return remote.getDerivedPayrollRun(asOf)
}

export {
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
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export async function getFundraiserRecords(
  filters: PledgeFilters = {},
): Promise<FundraiserRecord[]> {
  requireBackend()
  return remote.getFundraiserRecords(filters)
}

export async function getLeaderRecords(
  filters: PledgeFilters = {},
): Promise<LeaderRecord[]> {
  requireBackend()
  return remote.getLeaderRecords(filters)
}

export async function getLeaderNames(): Promise<string[]> {
  requireBackend()
  return remote.getAllLeaderNames()
}

export async function getAllLeaderNames(): Promise<string[]> {
  requireBackend()
  return remote.getAllLeaderNames()
}

export async function getFundraiser(code: string): Promise<FundraiserRecord | null> {
  requireBackend()
  return remote.getFundraiser(code)
}

export interface FundraiserInput {
  name: string
  code: string
  leaderNames: string[]
  active: boolean
  startDate: string
  endDate: string | null
}

/**
 * Field-level validation, shared by create and update so the two cannot drift.
 * Returns a map of field → message; empty means valid.
 *
 * Pure: the caller supplies the roster to check uniqueness against, rather
 * than this module reaching for one. The service re-runs these same rules and
 * is the authority; this pass exists so the form can show a field-level error
 * without a round trip.
 *
 * `existingCode` is the record being edited, excluded from the uniqueness
 * check so saving someone without changing their ID is not a clash with
 * themselves.
 */
export function validateFundraiser(
  input: FundraiserInput,
  existingCode?: string,
  roster: { code: string }[] = [],
  leaderNames: string[] = [],
): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!input.name.trim()) errors.name = 'Name is required.'
  if (!input.code.trim()) {
    errors.code = 'ID number is required.'
  } else if (
    roster.some(
      (f) =>
        f.code.toLowerCase() === input.code.trim().toLowerCase() &&
        f.code !== existingCode,
    )
  ) {
    errors.code = `ID number ${input.code.trim()} already belongs to someone else.`
  }

  if (input.leaderNames.length === 0) errors.leaderNames = 'Assign at least one leader.'
  if (leaderNames.length > 0) {
    for (const leader of input.leaderNames) {
      if (!leaderNames.includes(leader)) errors.leaderNames = `Unknown leader: ${leader}.`
    }
  }

  if (!input.startDate) errors.startDate = 'Start date is required.'

  // A retired person needs an end date — that date is what stops their
  // commission accruing, so leaving it blank is a payroll problem, not a
  // cosmetic one.
  if (!input.active && !input.endDate) {
    errors.endDate = 'A retired fundraiser needs an end date.'
  }
  if (input.endDate && input.startDate && input.endDate < input.startDate) {
    errors.endDate = 'End date cannot be before the start date.'
  }
  if (input.active && input.endDate) {
    errors.endDate = 'An active fundraiser should not have an end date.'
  }

  return errors
}

export async function createFundraiser(input: FundraiserInput): Promise<FundraiserRecord> {
  requireBackend()
  return remote.createFundraiser(input)
}

export async function updateFundraiser(
  code: string,
  input: FundraiserInput,
): Promise<FundraiserRecord> {
  requireBackend()
  return remote.updateFundraiser(code, input)
}
