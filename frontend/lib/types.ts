/**
 * Domain types for the UI layer.
 *
 * These mirror the consolidated shape the Python preprocessing API will return
 * — not the raw 113/26-column spreadsheets. The spreadsheet columns are an
 * import/export concern; the UI works with normalized records.
 */

export type StatusClassification =
  | 'approved'
  | 'failed_retryable'
  | 'failed_final'
  | 'cancelled'
  | 'other'

export interface StatusCode {
  statusId: number
  description: string
  classification: StatusClassification
}

/** One bank outcome for one application. Append-only history. */
export interface BillingEvent {
  id: string
  serialNo: string
  statusId: number
  statusDescription: string
  reason: string | null
  reasonDesc: string | null
  statusDate: string
  bankBatchNo: string | null
  attemptNo: number
  /** Which upload this row arrived in. */
  uploadId: string
}

/**
 * A consolidated application record: the Apps Tracker row enriched with the
 * latest billing outcome — i.e. the thing the VLOOKUP step produces by hand
 * today.
 */
export interface Pledge {
  serialNo: string
  donorName: string
  donorEmail: string
  donorMobile: string
  donorDob: string
  gender: 'MALE' | 'FEMALE'
  city: string
  country: 'PH' | 'MY'

  charityCode: string
  campaignCode: string
  siteName: string
  locationName: string
  agentId: string
  fundraiserName: string
  leaderName: string

  amount: number
  currency: 'PHP' | 'MYR'
  frequency: 'Monthly' | 'Quarterly' | 'Semi-Annual' | 'Annual'
  instrumentType: 'CREDIT CARD' | 'DEBIT CARD'
  /** Masked only — never a full PAN. */
  maskedPan: string
  /** Zero-padded MMYY text; '0728' must keep its leading zero. */
  expiry: string
  issuingBank: string
  processingBank: string

  // the seven lifecycle dates
  signupDate: string
  submittedAt: string | null
  debitDate: string | null
  verifiedAt: string | null
  cancellationDate: string | null
  invoicedDate: string | null
  payoutDate: string | null

  verified: boolean
  verifiedBy: string | null
  appStatus: string
  currentStatusId: number | null
  currentStatusDescription: string | null
  currentStatusDate: string | null
  currentClassification: StatusClassification | null
  attempts: number
  cancelled: boolean
  invoiceNo: string | null
  commissionAmount: number | null
  payoutStatus: 'unpaid' | 'paid' | 'clawed_back' | null
  notes: string | null
}

/** An uploaded file and what consolidating it did. */
export interface Upload {
  id: string
  filename: string
  sourceType: 'status_report' | 'apps_tracker'
  uploadedAt: string
  uploadedBy: string
  rowCount: number
  matchedCount: number
  newRecordCount: number
  exceptionCount: number
  status: 'consolidated' | 'needs_review' | 'processing' | 'failed'
}

export type ImportProblem =
  | 'no_matching_pledge'
  | 'name_mismatch'
  | 'pan_mismatch'
  | 'unknown_status_id'
  | 'parse_error'

export interface ImportException {
  id: string
  uploadId: string
  filename: string
  serialNo: string | null
  problem: ImportProblem
  detail: string
  rawSummary: string
  resolved: boolean
  createdAt: string
}

export interface Donor {
  id: string
  fullName: string
  email: string
  mobile: string
  dob: string
  city: string
  country: 'PH' | 'MY'
  pledgeCount: number
  totalMonthlyValue: number
  currency: 'PHP' | 'MYR'
  firstSignup: string
  /** Set when another donor record shares an email/mobile/national id. */
  duplicateOf: string | null
  duplicateSignal: 'email' | 'mobile' | 'national_id' | null
}

export interface ExportTemplate {
  id: string
  code: string
  name: string
  description: string
  group: 'Legacy' | 'Operational' | 'Payroll' | 'Charity & financial' | 'Outbound'
  columnCount: number
  piiLevel: 'full' | 'masked' | 'none'
  /** True for the byte-compatible legacy master copies. */
  legacy: boolean
}

export interface ExportRun {
  id: string
  templateCode: string
  templateName: string
  runAt: string
  runBy: string
  rowCount: number
  fileName: string
  containsPii: boolean
}

export interface PayrollRun {
  id: string
  runDate: string
  cutoffStart: string
  cutoffEnd: string
  status: 'draft' | 'approved' | 'paid'
  fundraiserCount: number
  pledgeCount: number
  grossCommission: number
  clawbacks: number
  netPayable: number
}

export interface FundraiserPerformance {
  name: string
  leaderName: string
  signups: number
  realized: number
  realizationRate: number
  avgPledge: number
  pledgedValue: number
  grossCommission: number
  clawbacks: number
}

export interface SitePerformance {
  name: string
  locationName: string
  country: 'PH' | 'MY'
  charityCode: string
  startsOn: string
  endsOn: string | null
  staffCount: number
  signups: number
  realizationRate: number
  pledgedValue: number
}

export interface TimePoint {
  date: string
  signups: number
  value: number
  realized: number
}

export interface Kpis {
  signups: number
  pledgedValue: number
  realizationRate: number
  realizationDelta: number
  avgPledge: number
  avgLagDays: number
  verifiedPct: number
  activeDonors: number
  cancelledThisMonth: number
}
