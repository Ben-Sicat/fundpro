import { z } from 'zod'

/**
 * Zod mirrors of the API contract.
 *
 * These duplicate `lib/types.ts` on purpose: the types describe what the app
 * expects, and these describe what arrived. When the two drift — a renamed
 * field, a null where a number was promised — the schema is what turns a
 * mystery render failure into a named error at the boundary.
 *
 * Dates stay ISO strings, matching the mock dataset, so no component needs to
 * change.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'expected an ISO date')
const nullableDate = isoDate.nullable().catch(null)

export const StatusClassificationSchema = z.enum([
  'approved',
  'failed_retryable',
  'failed_final',
  'cancelled',
  'other',
])

export const PledgeSchema = z.object({
  serialNo: z.string(),
  donorName: z.string(),
  donorEmail: z.string(),
  donorMobile: z.string(),
  donorDob: z.string().nullable(),
  gender: z.string().nullable(),
  city: z.string(),
  country: z.enum(['PH', 'MY']),

  charityCode: z.string(),
  campaignCode: z.string(),
  siteName: z.string(),
  locationName: z.string(),
  agentId: z.string(),
  fundraiserName: z.string(),
  leaderName: z.string(),

  amount: z.number(),
  currency: z.enum(['PHP', 'MYR']),
  frequency: z.string(),
  instrumentType: z.string(),
  maskedPan: z.string(),
  expiry: z.string(),
  issuingBank: z.string(),
  processingBank: z.string(),

  signupDate: nullableDate,
  submittedAt: nullableDate,
  debitDate: nullableDate,
  verifiedAt: nullableDate,
  cancellationDate: nullableDate,
  cancellationReason: z.string().nullable().default(null),
  cancellationSource: z.enum(['bank', 'manual']).nullable().default(null),
  cancelledBy: z.string().nullable().default(null),
  invoicedDate: nullableDate,
  payoutDate: nullableDate,

  verified: z.boolean(),
  verifiedBy: z.string().nullable(),
  appStatus: z.string(),
  currentStatusId: z.number().nullable(),
  currentStatusDescription: z.string().nullable(),
  currentStatusDate: nullableDate,
  currentClassification: StatusClassificationSchema.nullable(),
  attempts: z.number(),
  failedAttempts: z.number().default(0),
  attemptsToSuccess: z.number().nullable().default(null),
  cancelled: z.boolean(),
  invoiceNo: z.string().nullable(),
  commissionAmount: z.number().nullable(),
  payoutStatus: z.enum(['unpaid', 'paid', 'clawed_back']).nullable(),
})

export const BillingEventSchema = z.object({
  id: z.string(),
  serialNo: z.string(),
  statusId: z.number(),
  statusDescription: z.string(),
  reason: z.string().nullable(),
  reasonDesc: z.string().nullable(),
  statusDate: isoDate,
  bankBatchNo: z.string().nullable(),
  attemptNo: z.number(),
  uploadId: z.string(),
})

export const PledgeNoteSchema = z.object({
  id: z.string(),
  serialNo: z.string(),
  author: z.string(),
  createdAt: z.string(),
  text: z.string(),
})

export const UploadSchema = z.object({
  id: z.string(),
  filename: z.string(),
  sourceType: z.enum(['status_report', 'apps_tracker']),
  uploadedAt: z.string(),
  uploadedBy: z.string(),
  rowCount: z.number(),
  matchedCount: z.number(),
  newRecordCount: z.number(),
  exceptionCount: z.number(),
  status: z.enum(['consolidated', 'needs_review', 'processing', 'failed']),
})

export const ImportExceptionSchema = z.object({
  id: z.string(),
  uploadId: z.string(),
  filename: z.string(),
  serialNo: z.string().nullable(),
  problem: z.enum([
    'no_matching_pledge',
    'name_mismatch',
    'pan_mismatch',
    'unknown_status_id',
    'parse_error',
  ]),
  detail: z.string(),
  rawSummary: z.string(),
  resolved: z.boolean(),
  createdAt: z.string(),
})

export const DonorSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  mobile: z.string(),
  dob: z.string().nullable(),
  city: z.string(),
  country: z.enum(['PH', 'MY']),
  pledgeCount: z.number(),
  totalMonthlyValue: z.number(),
  currency: z.enum(['PHP', 'MYR']),
  firstSignup: z.string().nullable(),
  duplicateOf: z.string().nullable(),
  duplicateSignal: z.enum(['email', 'mobile', 'national_id']).nullable(),
})

export const KpisSchema = z.object({
  signups: z.number(),
  pledgedValue: z.number(),
  realizationRate: z.number(),
  realizationDelta: z.number(),
  avgPledge: z.number(),
  avgLagDays: z.number(),
  verifiedPct: z.number(),
  activeDonors: z.number(),
  cancelledThisMonth: z.number(),
})

export const TimePointSchema = z.object({
  date: isoDate,
  signups: z.number(),
  value: z.number(),
  realized: z.number(),
})

export const SplitSliceSchema = z.object({
  label: z.string(),
  value: z.number(),
  classification: z.string(),
})

export const InstrumentSplitSchema = z.object({
  label: z.string(),
  count: z.number(),
  approvalRate: z.number(),
})

export const AgeBandSchema = z.object({
  band: z.string(),
  count: z.number(),
  realizationRate: z.number(),
})

export const LabelledCountSchema = z.object({
  label: z.string(),
  value: z.number(),
})

export const BankPerformanceSchema = z.object({
  bank: z.string(),
  role: z.enum(['issuing', 'processing']),
  submitted: z.number(),
  approved: z.number(),
  failedRetryable: z.number(),
  failedFinal: z.number(),
  cancelled: z.number(),
  realizationRate: z.number(),
  pledgedValue: z.number(),
})

export const FundraiserPerformanceSchema = z.object({
  name: z.string(),
  leaderName: z.string(),
  signups: z.number(),
  realized: z.number(),
  realizationRate: z.number(),
  avgPledge: z.number(),
  pledgedValue: z.number(),
  grossCommission: z.number(),
  clawbacks: z.number(),
})

export const FundraiserRecordSchema = z.object({
  name: z.string(),
  code: z.string(),
  active: z.boolean(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  leaderNames: z.array(z.string()),
  signups: z.number(),
  realized: z.number(),
  realizationRate: z.number(),
  pledgedValue: z.number(),
  avgPledge: z.number(),
  sites: z.array(z.string()),
})

export const LeaderRecordSchema = z.object({
  name: z.string(),
  teamSize: z.number(),
  fundraiserNames: z.array(z.string()),
  signups: z.number(),
  realized: z.number(),
  realizationRate: z.number(),
  pledgedValue: z.number(),
})

export const SitePerformanceSchema = z.object({
  name: z.string(),
  locationName: z.string(),
  country: z.enum(['PH', 'MY']),
  charityCode: z.string(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  staffCount: z.number(),
  signups: z.number(),
  realized: z.number(),
  realizationRate: z.number(),
  pledgedValue: z.number(),
})

export const StatusCodeSchema = z.object({
  statusId: z.number(),
  description: z.string(),
  classification: StatusClassificationSchema,
})

export const ExportTemplateSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  group: z.string(),
  columnCount: z.number(),
  piiLevel: z.enum(['full', 'masked', 'none']),
  legacy: z.boolean(),
  rows: z.number().nullable(),
})

export const ExportRunSchema = z.object({
  id: z.string(),
  templateCode: z.string(),
  templateName: z.string(),
  runAt: z.string(),
  runBy: z.string(),
  rowCount: z.number(),
  fileName: z.string(),
  containsPii: z.boolean(),
})

export const UploadImpactSchema = z.object({
  uploadId: z.string(),
  newlyApproved: z.number(),
  newlyRetrying: z.number(),
  newlyFailedFinal: z.number(),
  newlyCancelled: z.number(),
  exceptions: z.number(),
  changedMaster: z.boolean(),
  newPledges: z.number().default(0),
})

export const UploadResultSchema = z.object({
  upload: UploadSchema,
  impact: UploadImpactSchema,
  exceptions: z.array(ImportExceptionSchema),
})

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

export const CutoffSchema = z.object({
  label: z.string(),
  start: isoDate,
  end: isoDate,
  runDate: isoDate,
})

export const PayoutLineSchema = z.object({
  serialNo: z.string(),
  fundraiserName: z.string(),
  charityCode: z.string(),
  pledgeAmount: z.number(),
  currency: z.enum(['PHP', 'MYR']),
  commission: z.number(),
  conditionApplied: z.enum(['on_submission', 'on_first_approval', 'on_n_billings']),
  eligibilityDate: isoDate,
  planId: z.string(),
})

export const ClawbackCandidateSchema = z.object({
  serialNo: z.string(),
  fundraiserName: z.string(),
  originalCommission: z.number(),
  currency: z.enum(['PHP', 'MYR']),
  reason: z.enum(['cancelled', 'unrealized', 'failed_final']),
  triggeredOn: isoDate,
  confirmed: z.boolean(),
})

export const FundraiserNetSchema = z.object({
  fundraiserName: z.string(),
  currency: z.enum(['PHP', 'MYR']),
  gross: z.number(),
  bonuses: z.number().default(0),
  clawbacks: z.number(),
  net: z.number(),
  pledgeCount: z.number(),
})

export const BonusLineSchema = z.object({
  fundraiserName: z.string(),
  currency: z.enum(['PHP', 'MYR']),
  ruleId: z.string(),
  ruleName: z.string(),
  basis: z.string(),
  basisValue: z.number(),
  threshold: z.number(),
  amount: z.number(),
})

export const PayrollRunSchema = z.object({
  cutoff: CutoffSchema,
  lines: z.array(PayoutLineSchema),
  nets: z.array(FundraiserNetSchema),
  clawbacks: z.array(ClawbackCandidateSchema),
  bonuses: z.array(BonusLineSchema).default([]),
})

export const ConfigurationEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.unknown(),
  status: z.enum(['confirmed', 'assumed']),
  risk: z.string(),
  endpoint: z.string(),
})

export const StringListSchema = z.array(z.string())


/** One column a custom export can include. */
export const ExportFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  group: z.string(),
  pii: z.enum(['none', 'masked', 'full']),
})
