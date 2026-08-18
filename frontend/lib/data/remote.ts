import 'server-only'

import { z } from 'zod'
import { apiGet, apiSend, apiUpload } from '@/lib/api/client'
import * as S from '@/lib/api/schemas'
import { PRESETS, suggestionsFor, type ExportPreset, type UploadImpact } from '@/lib/exports/presets'
import type {
  BillingEvent,
  Donor,
  ExportRun,
  ExportTemplate,
  FundraiserPerformance,
  ImportException,
  Kpis,
  Pledge,
  PledgeNote,
  SitePerformance,
  StatusCode,
  TimePoint,
  Upload,
  ExportField,
  FundraiserRecord,
  LeaderRecord,
} from '@/lib/types'

import type { PledgeFilters } from './filters'

/**
 * The live implementations behind the data seam.
 *
 * Every function here has a mock twin in `index.ts`, which picks between them.
 * The two must agree on their return SHAPE — that is what makes the swap
 * invisible to components, and why the shapes are Zod-checked on arrival.
 */

/** Frontend filter object → the backend's query parameters. */
function query(f: PledgeFilters = {}): Record<string, unknown> {
  return {
    q: f.q,
    charity: f.charityCode,
    status: f.status,
    fundraiser: f.fundraiserName,
    site: f.siteName,
    leader: f.leaderName,
    verified: f.verified,
    basis: f.basis,
    from: f.from,
    to: f.to,
  }
}

const list = <T>(schema: z.ZodType<T>) => z.array(schema)

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function getPledges(filters: PledgeFilters = {}): Promise<Pledge[]> {
  return (await apiGet('/pledges', list(S.PledgeSchema), query(filters))) as Pledge[]
}

export async function getPledge(serialNo: string): Promise<Pledge | null> {
  try {
    return (await apiGet(
      `/pledges/${encodeURIComponent(serialNo)}`,
      S.PledgeSchema,
    )) as Pledge
  } catch (error) {
    // A 404 is a legitimate answer here — the page renders notFound(). Any
    // other failure is a real problem and must not be swallowed.
    if (error instanceof Error && error.message.includes('→ 404')) return null
    throw error
  }
}

export async function getBillingEvents(serialNo: string): Promise<BillingEvent[]> {
  return (await apiGet(
    `/pledges/${encodeURIComponent(serialNo)}/events`,
    list(S.BillingEventSchema),
  )) as BillingEvent[]
}

export async function getPledgeNotes(serialNo: string): Promise<PledgeNote[]> {
  return (await apiGet(
    `/pledges/${encodeURIComponent(serialNo)}/notes`,
    list(S.PledgeNoteSchema),
  )) as PledgeNote[]
}

export async function addPledgeNote(input: {
  serialNo: string
  author: string
  text: string
}): Promise<PledgeNote> {
  return (await apiSend(
    'POST',
    `/pledges/${encodeURIComponent(input.serialNo)}/notes`,
    S.PledgeNoteSchema,
    { text: input.text, author: input.author },
  )) as PledgeNote
}

export async function getDonors(q?: string): Promise<Donor[]> {
  return (await apiGet('/donors', list(S.DonorSchema), { q })) as Donor[]
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getKpis(filters: PledgeFilters = {}): Promise<Kpis> {
  return (await apiGet('/kpis', S.KpisSchema, query(filters))) as Kpis
}

export async function getTimeSeries(filters: PledgeFilters = {}): Promise<TimePoint[]> {
  return (await apiGet('/timeseries', list(S.TimePointSchema), query(filters))) as TimePoint[]
}

export async function getResultsSplit(filters: PledgeFilters = {}) {
  return apiGet('/results-split', list(S.SplitSliceSchema), query(filters))
}

export async function getInstrumentSplit(filters: PledgeFilters = {}) {
  return apiGet('/instrument-split', list(S.InstrumentSplitSchema), query(filters))
}

export async function getAgeBands(filters: PledgeFilters = {}) {
  return apiGet('/age-bands', list(S.AgeBandSchema), query(filters))
}

export async function getFrequencyMix(filters: PledgeFilters = {}) {
  return apiGet('/frequency-mix', list(S.LabelledCountSchema), query(filters))
}

export async function getBankPerformance(filters: PledgeFilters = {}) {
  return apiGet('/bank-performance', list(S.BankPerformanceSchema), query(filters))
}

export async function getFundraiserPerformance(
  filters: PledgeFilters = {},
): Promise<FundraiserPerformance[]> {
  return (await apiGet(
    '/fundraiser-performance',
    list(S.FundraiserPerformanceSchema),
    query(filters),
  )) as FundraiserPerformance[]
}

export async function getSitePerformance(
  filters: PledgeFilters = {},
): Promise<SitePerformance[]> {
  return (await apiGet(
    '/sites',
    list(S.SitePerformanceSchema),
    query(filters),
  )) as unknown as SitePerformance[]
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export async function getFundraiserRecords(
  filters: PledgeFilters = {},
): Promise<FundraiserRecord[]> {
  return (await apiGet(
    '/team/fundraisers',
    list(S.FundraiserRecordSchema),
    query(filters),
  )) as unknown as FundraiserRecord[]
}

export async function getLeaderRecords(filters: PledgeFilters = {}): Promise<LeaderRecord[]> {
  return (await apiGet(
    '/leaders',
    list(S.LeaderRecordSchema),
    query(filters),
  )) as LeaderRecord[]
}

export async function getAllLeaderNames(): Promise<string[]> {
  return apiGet('/team/leaders', S.StringListSchema)
}

export async function getFundraiser(code: string): Promise<FundraiserRecord | null> {
  try {
    return (await apiGet(
      `/team/fundraisers/${encodeURIComponent(code)}`,
      S.FundraiserRecordSchema,
    )) as unknown as FundraiserRecord
  } catch (error) {
    if (error instanceof Error && error.message.includes('→ 404')) return null
    throw error
  }
}

export async function createFundraiser(input: {
  name: string
  code: string
  leaderNames: string[]
  active: boolean
  startDate: string
  endDate: string | null
}): Promise<FundraiserRecord> {
  return (await apiSend(
    'POST',
    '/team/fundraisers',
    S.FundraiserRecordSchema,
    input,
  )) as unknown as FundraiserRecord
}

export async function updateFundraiser(
  code: string,
  input: {
    name: string
    code: string
    leaderNames: string[]
    active: boolean
    startDate: string
    endDate: string | null
  },
): Promise<FundraiserRecord> {
  return (await apiSend(
    'PUT',
    `/team/fundraisers/${encodeURIComponent(code)}`,
    S.FundraiserRecordSchema,
    input,
  )) as unknown as FundraiserRecord
}

// ---------------------------------------------------------------------------
// Uploads & exceptions
// ---------------------------------------------------------------------------

export async function getUploads(): Promise<Upload[]> {
  return (await apiGet('/uploads', list(S.UploadSchema))) as Upload[]
}

export async function getExceptions(): Promise<ImportException[]> {
  return (await apiGet('/exceptions', list(S.ImportExceptionSchema))) as ImportException[]
}

export async function resolveException(id: string): Promise<void> {
  await apiSend('POST', `/exceptions/${encodeURIComponent(id)}/resolve`, S.ImportExceptionSchema)
}

export async function getUploadImpact(uploadId: string): Promise<UploadImpact> {
  const impact = await apiGet(
    `/uploads/${encodeURIComponent(uploadId)}/impact`,
    S.UploadImpactSchema,
  )
  // The suggestion list is a local presentation concern built from the tally,
  // so it stays in the frontend rather than becoming an API responsibility.
  return { ...impact, suggested: suggestionsFor(impact) }
}

/** Upload a workbook and consolidate it. Returns what changed. */
export async function uploadWorkbook(file: File): Promise<{
  upload: Upload
  impact: UploadImpact
  exceptions: ImportException[]
}> {
  const raw = await apiUpload('/uploads', file)
  const parsed = S.UploadResultSchema.parse(raw)
  return {
    upload: parsed.upload as Upload,
    impact: { ...parsed.impact, suggested: suggestionsFor(parsed.impact) },
    exceptions: parsed.exceptions as ImportException[],
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export async function getExportTemplates(): Promise<ExportTemplate[]> {
  const rows = await apiGet('/exports/templates', list(S.ExportTemplateSchema))
  return rows.map(({ rows: _rows, ...rest }) => rest) as ExportTemplate[]
}

export async function getExportRuns(): Promise<ExportRun[]> {
  return (await apiGet('/exports/runs', list(S.ExportRunSchema))) as ExportRun[]
}

/**
 * Presets with a live row count.
 *
 * The preset DEFINITIONS stay local — they are a serializable filter plus
 * copy, and the frontend owns how reports are described. Only the counts come
 * from the service, keyed by code.
 */
export async function getPresetSummaries(): Promise<(ExportPreset & { rows: number | null })[]> {
  const templates = await apiGet('/exports/templates', list(S.ExportTemplateSchema))
  const rowsByCode = new Map(templates.map((t) => [t.code, t.rows]))
  return PRESETS.map((preset) => ({
    ...preset,
    rows: preset.aggregate ? null : (rowsByCode.get(preset.code) ?? null),
  }))
}

// ---------------------------------------------------------------------------
// Payroll & settings
// ---------------------------------------------------------------------------

export async function getDerivedPayrollRun(asOf: string) {
  const run = await apiGet('/payroll/run', S.PayrollRunSchema, { as_of: asOf })
  return {
    cutoff: run.cutoff,
    lines: run.lines,
    nets: run.nets,
    clawbacks: run.clawbacks,
    bonuses: run.bonuses,
  }
}

export async function upsertStatusCode(input: {
  statusId: number
  description: string
  classification: string
}): Promise<StatusCode> {
  return (await apiSend(
    'PUT',
    '/settings/status-codes',
    S.StatusCodeSchema,
    input,
  )) as StatusCode
}

export async function getStatusCodes(): Promise<StatusCode[]> {
  return (await apiGet('/settings/status-codes', list(S.StatusCodeSchema))) as StatusCode[]
}

export async function getConfiguration() {
  return apiGet('/settings/configuration', list(S.ConfigurationEntrySchema))
}

export async function getCharities(): Promise<string[]> {
  return apiGet('/charities', S.StringListSchema)
}

export async function getFundraiserNames(): Promise<string[]> {
  const rows = await apiGet('/team/fundraisers', list(S.FundraiserRecordSchema))
  return rows.map((f) => f.name).sort()
}

export async function getSiteNames(): Promise<string[]> {
  const rows = await apiGet('/sites', list(S.SitePerformanceSchema))
  return rows.map((s) => s.name).sort()
}

export async function getLeaderNames(): Promise<string[]> {
  const rows = await apiGet('/leaders', list(S.LeaderRecordSchema))
  return rows.map((l) => l.name)
}

/**
 * Record — or clear — a cancellation by hand.
 *
 * Plenty of cancellations never reach a bank Status Report: the donor phones
 * the office, the charity pulls a campaign. Those get recorded here with a
 * reason, and the service marks them `manual` so the next import cannot
 * recompute them away.
 *
 * Pass `cancellationDate: null` to clear one recorded in error.
 */
export async function setCancellation(input: {
  serialNo: string
  cancellationDate: string | null
  reason?: string
}): Promise<Pledge> {
  return (await apiSend(
    'PATCH',
    `/pledges/${encodeURIComponent(input.serialNo)}/cancellation`,
    S.PledgeSchema,
    { cancellationDate: input.cancellationDate, reason: input.reason ?? '' },
  )) as Pledge
}

/** Columns the signed-in role may include in a custom export. */
export async function getExportFields(): Promise<ExportField[]> {
  return apiGet('/exports/fields', z.array(S.ExportFieldSchema))
}
