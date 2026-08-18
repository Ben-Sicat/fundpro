/**
 * Donor Management Platform — database schema.
 *
 * Implements MASTER_SPEC.md Part 3. Structural notes worth knowing:
 *  - Money is `numeric` everywhere, never a float (see `money()` helper).
 *  - `billing_events` is APPEND-ONLY; a pledge's current status is derived
 *    from its latest event. Nothing in the app may update or delete a row.
 *  - Age is never stored; it is computed from `donors.dob` at query time.
 *  - Card data is masked-only. There is deliberately no column that could
 *    hold a full PAN.
 *  - Every constrained text column gets a CHECK built from the same exported
 *    array as its TypeScript union, so the DB and the types cannot drift.
 */
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Shared column helpers
// ---------------------------------------------------------------------------

/** Money: fixed-precision decimal. NEVER use a float for currency. */
const money = (name: string) => numeric(name, { precision: 12, scale: 2 })
const moneyWide = (name: string) => numeric(name, { precision: 14, scale: 2 })

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

const pk = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`)

/**
 * Build a CHECK constraint restricting a column to a fixed set of values.
 * Values are literal strings from the arrays below — never user input.
 */
const oneOf = (column: unknown, values: readonly string[]): SQL =>
  sql`${column} in ${sql.raw(`(${values.map((v) => `'${v}'`).join(', ')})`)}`

// ---------------------------------------------------------------------------
// Constrained value sets (single source of truth for CHECKs + TS unions)
// ---------------------------------------------------------------------------

export const STATUS_CLASSIFICATIONS = [
  'approved',
  'failed_retryable',
  'failed_final',
  'cancelled',
  'other',
] as const
export type StatusClassification = (typeof STATUS_CLASSIFICATIONS)[number]

export const IMPORT_SOURCE_TYPES = [
  'status_report',
  'apps_upload',
  'migration',
] as const
export type ImportSourceType = (typeof IMPORT_SOURCE_TYPES)[number]

export const IMPORT_PROBLEMS = [
  'no_matching_pledge',
  'name_mismatch',
  'pan_mismatch',
  'unknown_status_id',
  'parse_error',
] as const
export type ImportProblem = (typeof IMPORT_PROBLEMS)[number]

export const COMMISSION_TRIGGER_RULES = [
  'on_submission',
  'on_first_approval',
  'on_n_billings',
] as const
export type CommissionTriggerRule = (typeof COMMISSION_TRIGGER_RULES)[number]

export const PAYROLL_RUN_STATUSES = ['draft', 'approved', 'paid'] as const
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number]

export const PAYOUT_STATUSES = [
  'pending',
  'approved',
  'paid',
  'clawed_back',
  'excluded',
] as const
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

export const CLAWBACK_REASONS = [
  'cancelled',
  'unrealized',
  'failed_final',
] as const
export type ClawbackReason = (typeof CLAWBACK_REASONS)[number]

export const INVOICE_LINE_TYPES = ['charge', 'clawback_credit'] as const
export type InvoiceLineType = (typeof INVOICE_LINE_TYPES)[number]

export const EXPORT_BASE_DATASETS = [
  'pledges',
  'billing_events',
  'lifecycle',
  'payouts',
  'invoices',
] as const
export type ExportBaseDataset = (typeof EXPORT_BASE_DATASETS)[number]

export const EXPORT_PII_LEVELS = ['full', 'masked', 'none'] as const
export type ExportPiiLevel = (typeof EXPORT_PII_LEVELS)[number]

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export const charities = pgTable('charities', {
  id: pk(),
  /** e.g. 'STC'. Samples also contain UNHCR, WWF, World Vision. */
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  /** CHARITY SOURCE CODE in the legacy Apps Tracker. */
  sourceCode: text('source_code'),
  invoicePrefix: text('invoice_prefix'),
  createdAt: createdAt(),
})

export const locations = pgTable('locations', {
  id: pk(),
  code: text('code').unique(),
  /** Canonical venue name; legacy files spell these inconsistently. */
  name: text('name').notNull(),
  country: text('country'),
})

export const agents = pgTable('agents', {
  id: pk(),
  /** e.g. 'FPH316', 'RC054'. */
  agentId: text('agent_id').notNull().unique(),
  locationId: uuid('location_id').references(() => locations.id),
  description: text('description'),
})

export const campaigns = pgTable(
  'campaigns',
  {
    id: pk(),
    charityId: uuid('charity_id')
      .notNull()
      .references(() => charities.id),
    campaignCode: text('campaign_code'),
    fundCode: text('fund_code'),
    appealCode: text('appeal_code'),
    programCode: text('program_code'),
    eventCode: text('event_code'),
  },
  (t) => [
    unique('campaigns_natural_key').on(
      t.charityId,
      t.campaignCode,
      t.fundCode,
      t.appealCode,
      t.programCode,
      t.eventCode,
    ),
  ],
)

/**
 * Bank status codes. Business logic branches on `classification`, never on the
 * raw status_id — so a new bank code is a 30-second settings edit, not a code
 * change. Only 59 and 66 are known; the full dictionary is pending.
 */
export const statusCodes = pgTable(
  'status_codes',
  {
    statusId: integer('status_id').primaryKey(),
    description: text('description').notNull(),
    classification: text('classification').notNull(),
  },
  (t) => [
    check(
      'status_codes_classification_check',
      oneOf(t.classification, STATUS_CLASSIFICATIONS),
    ),
  ],
)

// ---------------------------------------------------------------------------
// People & teams
// ---------------------------------------------------------------------------

export const fundraisers = pgTable('fundraisers', {
  id: pk(),
  fullName: text('full_name').notNull(),
  employeeCode: text('employee_code').unique(),
  /** e.g. 'FP'. */
  recruiterCode: text('recruiter_code'),
  /** Performance tier (their STOPLIGHT). NULL until someone grades them. */
  tier: text('tier'),
  isActive: boolean('is_active').notNull().default(true),
  /** Employment window; end_date stays null while the person is active. */
  startDate: date('start_date'),
  endDate: date('end_date'),
  createdAt: createdAt(),
})

export const leaders = pgTable('leaders', {
  id: pk(),
  /** Leaders are often senior fundraisers themselves. */
  fundraiserId: uuid('fundraiser_id').references(() => fundraisers.id),
  fullName: text('full_name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
})

/** Many-to-many and effective-dated: team structure changes over time. */
export const fundraiserLeaders = pgTable(
  'fundraiser_leaders',
  {
    fundraiserId: uuid('fundraiser_id')
      .notNull()
      .references(() => fundraisers.id),
    leaderId: uuid('leader_id')
      .notNull()
      .references(() => leaders.id),
    effectiveFrom: date('effective_from').notNull().defaultNow(),
    effectiveTo: date('effective_to'),
  },
  (t) => [
    primaryKey({ columns: [t.fundraiserId, t.leaderId, t.effectiveFrom] }),
  ],
)

// ---------------------------------------------------------------------------
// Sites (scheduled events)
// ---------------------------------------------------------------------------

export const sites = pgTable('sites', {
  id: pk(),
  charityId: uuid('charity_id').references(() => charities.id),
  locationId: uuid('location_id').references(() => locations.id),
  name: text('name').notNull(),
  /**
   * Nullable since 2026-08-18: a site inferred from a legacy tracker row is
   * known only by name, and inventing a start date to satisfy NOT NULL would
   * put fiction in a column reporting filters on.
   */
  startsOn: date('starts_on'),
  endsOn: date('ends_on'),
  notes: text('notes'),
})

export const siteAssignments = pgTable(
  'site_assignments',
  {
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    fundraiserId: uuid('fundraiser_id')
      .notNull()
      .references(() => fundraisers.id),
    assignedOn: date('assigned_on'),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.fundraiserId] })],
)

// ---------------------------------------------------------------------------
// Donors
// ---------------------------------------------------------------------------

export const donors = pgTable(
  'donors',
  {
    id: pk(),
    title: text('title'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    fullName: text('full_name').notNull(),
    chineseName: text('chinese_name'),
    /** IC NUMBER / NRIC. */
    nationalId: text('national_id'),
    gender: text('gender'),
    /** Age is derived from this at query time and never stored. */
    dob: date('dob'),
    language: text('language'),
    spokenLanguage: text('spoken_language'),
    email: text('email'),
    telMobile: text('tel_mobile'),
    telHome: text('tel_home'),
    telOffice: text('tel_office'),
    address1: text('address_1'),
    address2: text('address_2'),
    address3: text('address_3'),
    address4: text('address_4'),
    postcode: text('postcode'),
    city: text('city'),
    state: text('state'),
    country: text('country'),
    postalMailOk: boolean('postal_mail_ok'),
    emailOk: boolean('email_ok'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Dedupe-hint lookups (§4.2): the same person signed up twice.
    index('donors_email_lower_idx').on(sql`lower(${t.email})`),
    index('donors_national_id_idx').on(t.nationalId),
    index('donors_tel_mobile_idx').on(t.telMobile),
  ],
)

// ---------------------------------------------------------------------------
// Pledges — the central entity
// ---------------------------------------------------------------------------

export const pledges = pgTable(
  'pledges',
  {
    id: pk(),
    /** SERIAL NO, e.g. 'FES48402552' — the universal join key. */
    serialNo: text('serial_no').notNull().unique(),
    donorId: uuid('donor_id')
      .notNull()
      .references(() => donors.id),
    charityId: uuid('charity_id')
      .notNull()
      .references(() => charities.id),
    fundraiserId: uuid('fundraiser_id').references(() => fundraisers.id),
    agentId: uuid('agent_id').references(() => agents.id),
    locationId: uuid('location_id').references(() => locations.id),
    campaignId: uuid('campaign_id').references(() => campaigns.id),
    siteId: uuid('site_id').references(() => sites.id),
    channel: text('channel'),
    country: text('country'),
    profileType: text('profile_type'),
    pledgeType: text('pledge_type'),
    doboType: text('dobo_type'),
    principal: text('principal'),
    amount: money('amount').notNull(),
    /**
     * Defaults to PHP, but the operation spans PH and Malaysia — always
     * populate explicitly on import rather than relying on this default.
     */
    currency: text('currency').notNull().default('PHP'),
    /** Canonical form ('Monthly'), used for reporting and grouping. */
    frequency: text('frequency').notNull(),
    /**
     * Exactly as the source file wrote it ('1', '12', 'Semi-annual'). The
     * legacy A1 export echoes THIS, because A1's job is to reproduce their
     * sheet rather than reinterpret it — and `Frequency` in the real files
     * mixes codes and text.
     */
    frequencyRaw: text('frequency_raw'),
    processingBank: text('processing_bank'),

    // ---- the seven lifecycle dates (6 = invoices, 7 = payouts) ----
    /** 1: acquisition in the field. */
    signupDate: date('signup_date'),
    /** 2: submitted to the bank. */
    submittedAt: date('submitted_at'),
    /** 3: when the card was actually charged — the money moment. */
    debitDate: date('debit_date'),
    /** 4: donor phoned and confirmed to be a real human. */
    verifiedAt: date('verified_at'),
    /** 5. */
    cancellationDate: date('cancellation_date'),

    verificationMethod: text('verification_method'),
    verificationCaller: text('verification_caller'),
    verified: boolean('verified').notNull().default(false),
    recruiterBatchNo: text('recruiter_batch_no'),
    anniversary: integer('anniversary'),
    /** Workflow state from the legacy tracker, e.g. 'SUBMISSION'. */
    appStatus: text('app_status'),
    /** Denormalized from the latest billing_event for fast filtering. */
    currentStatusId: integer('current_status_id').references(
      () => statusCodes.statusId,
    ),
    currentStatusDate: date('current_status_date'),
    /**
     * Classification of `currentStatusId`, denormalized from status_codes for
     * the same reason the id is: every dashboard filters on it.
     */
    currentClassification: text('current_classification'),
    cancelled: boolean('cancelled').notNull().default(false),

    // ---- cancellation provenance ----
    /**
     * Why this pledge was cancelled, in the operator's own words. Only ever
     * set alongside `cancellationDate`.
     */
    cancellationReason: text('cancellation_reason'),
    /**
     * Where the cancellation came from. 'bank' means a status code in a Status
     * Report said so; 'manual' means a human recorded it here. Load-bearing:
     * recomputing state from billing history must not overwrite a decision
     * somebody typed in.
     */
    cancellationSource: text('cancellation_source'),
    cancelledBy: text('cancelled_by'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

    // ---- retry counters, derived from billing_events ----
    /** Every billing event on this pledge, successful or not. */
    attempts: integer('attempts').notNull().default(0),
    /** Attempts the bank rejected — the counter operations watch. */
    failedAttempts: integer('failed_attempts').notNull().default(0),
    /**
     * How many attempts it took to get paid, counting the successful one.
     * NULL while the pledge has never billed.
     */
    attemptsToSuccess: integer('attempts_to_success'),
    unrealizedReportMonth: text('unrealized_report_month'),
    csTemplateSubmittedAt: date('cs_template_submitted_at'),
    csTeamActionAt: date('cs_team_action_at'),
    remarks: text('remarks'),
    otherNotes: text('other_notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('pledges_donor_id_idx').on(t.donorId),
    index('pledges_fundraiser_id_idx').on(t.fundraiserId),
    index('pledges_site_id_idx').on(t.siteId),
    index('pledges_current_status_id_idx').on(t.currentStatusId),
    index('pledges_signup_date_idx').on(t.signupDate),
    index('pledges_debit_date_idx').on(t.debitDate),
  ],
)

/**
 * Caller notes — the verification desk's remarks per application.
 * A thread, not a single overwritable column: like billing_events, rows are
 * only ever appended. (`pledges.remarks`/`other_notes` remain the legacy
 * one-cell fields for byte-compatible exports; they are not this feature.)
 */
export const pledgeNotes = pgTable(
  'pledge_notes',
  {
    id: pk(),
    pledgeId: uuid('pledge_id')
      .notNull()
      .references(() => pledges.id, { onDelete: 'cascade' }),
    /** Display name today; becomes a users FK when Supabase auth lands. */
    author: text('author').notNull(),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('pledge_notes_pledge_id_idx').on(t.pledgeId)],
)

/** Corporate / proxy donors ("on behalf of"). */
export const pledgeOnBehalf = pgTable('pledge_on_behalf', {
  pledgeId: uuid('pledge_id')
    .primaryKey()
    .references(() => pledges.id, { onDelete: 'cascade' }),
  bizName: text('biz_name'),
  designation: text('designation'),
  title: text('title'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  address1: text('address_1'),
  address2: text('address_2'),
  address3: text('address_3'),
  address4: text('address_4'),
  postcode: text('postcode'),
  city: text('city'),
  state: text('state'),
  gender: text('gender'),
  dob: date('dob'),
  email: text('email'),
  relationship: text('relationship'),
  tel: text('tel'),
})

// ---------------------------------------------------------------------------
// Payment methods — MASKED ONLY
// ---------------------------------------------------------------------------

/**
 * There is intentionally no column capable of holding a full PAN.
 * `maskedPan` stores exactly what the bank sends: '542550XXXXXX2906'.
 */
export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: pk(),
    pledgeId: uuid('pledge_id')
      .notNull()
      .references(() => pledges.id, { onDelete: 'cascade' }),
    /** 'CREDIT CARD' | 'DEBIT' | 'GIRO' | 'CHQ' — casing normalized on import. */
    instrumentType: text('instrument_type').notNull(),
    maskedPan: text('masked_pan'),
    cardType: text('card_type'),
    /** Zero-padded MMYY, e.g. '0728'. TEXT — numeric parsing destroys it. */
    expiry: text('expiry'),
    cardholderName: text('cardholder_name'),
    issuingBank: text('issuing_bank'),
    accountNumber: text('account_number'),
    bankCode: text('bank_code'),
    branchCode: text('branch_code'),
    giroRefNum: text('giro_ref_num'),
    chqMoPo: text('chq_mo_po'),
    isCurrent: boolean('is_current').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('payment_methods_pledge_id_idx').on(t.pledgeId)],
)

// ---------------------------------------------------------------------------
// Imports & billing history
// ---------------------------------------------------------------------------

export const importBatches = pgTable(
  'import_batches',
  {
    id: pk(),
    sourceType: text('source_type').notNull(),
    filename: text('filename'),
    uploadedBy: uuid('uploaded_by'),
    /**
     * Display name of the uploader. Separate from `uploadedBy` because auth is
     * still credentials-based with no users row to point a uuid at, and losing
     * who ran an import would gut the audit trail.
     */
    uploadedByName: text('uploaded_by_name'),
    rowCount: integer('row_count'),
    matchedCount: integer('matched_count'),
    unmatchedCount: integer('unmatched_count'),
    /** Records the file created rather than matched. */
    newRecordCount: integer('new_record_count'),
    exceptionCount: integer('exception_count'),
    /** 'consolidated' | 'needs_review' | 'processing' | 'failed'. */
    status: text('status'),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'import_batches_source_type_check',
      oneOf(t.sourceType, IMPORT_SOURCE_TYPES),
    ),
  ],
)

/**
 * APPEND-ONLY billing history. Never update or delete a row here: the pledge's
 * current status is derived from the latest event.
 *
 * The unique index is the re-upload guard — importing the same file twice must
 * not double-insert (§4.1 duplicate protection).
 */
export const billingEvents = pgTable(
  'billing_events',
  {
    id: pk(),
    pledgeId: uuid('pledge_id')
      .notNull()
      .references(() => pledges.id),
    importBatchId: uuid('import_batch_id').references(() => importBatches.id),
    statusId: integer('status_id')
      .notNull()
      .references(() => statusCodes.statusId),
    reason: text('reason'),
    reasonDesc: text('reason_desc'),
    statusDate: date('status_date').notNull(),
    /** e.g. 'STC2607003012'. */
    bankBatchNo: text('bank_batch_no'),
    attemptNo: integer('attempt_no'),
    anniversary: integer('anniversary'),
    /** Full source row, retained for audit and reprocessing. */
    rawRow: jsonb('raw_row'),
    createdAt: createdAt(),
  },
  (t) => [
    index('billing_events_pledge_status_date_idx').on(t.pledgeId, t.statusDate),
    index('billing_events_import_batch_id_idx').on(t.importBatchId),
    // Natural key for duplicate re-upload protection.
    uniqueIndex('billing_events_natural_key').on(
      t.pledgeId,
      t.statusId,
      t.statusDate,
    ),
  ],
)

export const importExceptions = pgTable(
  'import_exceptions',
  {
    id: pk(),
    importBatchId: uuid('import_batch_id')
      .notNull()
      .references(() => importBatches.id),
    serialNo: text('serial_no'),
    problem: text('problem').notNull(),
    /** Which file the bad row came from — the first thing an operator asks. */
    filename: text('filename'),
    /** Operator-facing explanation, e.g. 'STATUS ID 71 is not in the dictionary'. */
    detail: text('detail'),
    rawRow: jsonb('raw_row').notNull(),
    resolved: boolean('resolved').notNull().default(false),
    resolvedNote: text('resolved_note'),
    resolvedBy: uuid('resolved_by'),
    createdAt: createdAt(),
  },
  (t) => [
    check('import_exceptions_problem_check', oneOf(t.problem, IMPORT_PROBLEMS)),
  ],
)

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

/**
 * Commission rules as DATA, never code. Effective-dating protects history:
 * the plan applied to a pledge is the one active at its signup_date.
 *
 * Evidence from the payroll reference file suggests commission is a multiplier
 * of pledge amount (x1, x2.5, x3, x4), expressible via `pctOfPledge`
 * (250.00 = x2.5). What drives the multiplier is unconfirmed — see
 * docs/FINDINGS.md §3.3.
 */
export const commissionPlans = pgTable(
  'commission_plans',
  {
    id: pk(),
    name: text('name').notNull(),
    charityId: uuid('charity_id').references(() => charities.id),
    triggerRule: text('trigger_rule').notNull(),
    triggerN: integer('trigger_n'),
    amount: money('amount'),
    pctOfPledge: numeric('pct_of_pledge', { precision: 5, scale: 2 }),
    realizationWindowDays: integer('realization_window_days'),
    /** {'cancelled','failed_final','unrealized'} */
    clawbackOn: text('clawback_on').array(),
    effectiveFrom: date('effective_from').notNull().defaultNow(),
  },
  (t) => [
    check(
      'commission_plans_trigger_rule_check',
      oneOf(t.triggerRule, COMMISSION_TRIGGER_RULES),
    ),
  ],
)

export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: pk(),
    runDate: date('run_date').notNull(),
    /** 1st or 16th. */
    cutoffStart: date('cutoff_start').notNull(),
    /** 15th or end of month. */
    cutoffEnd: date('cutoff_end').notNull(),
    status: text('status').notNull().default('draft'),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check('payroll_runs_status_check', oneOf(t.status, PAYROLL_RUN_STATUSES)),
  ],
)

export const payouts = pgTable(
  'payouts',
  {
    id: pk(),
    pledgeId: uuid('pledge_id')
      .notNull()
      .references(() => pledges.id),
    fundraiserId: uuid('fundraiser_id')
      .notNull()
      .references(() => fundraisers.id),
    payrollRunId: uuid('payroll_run_id').references(() => payrollRuns.id),
    amount: money('amount').notNull(),
    conditionApplied: text('condition_applied'),
    status: text('status').notNull().default('pending'),
    excludedReason: text('excluded_reason'),
    /** Lifecycle date 7. */
    payoutDate: date('payout_date'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('payouts_pledge_fundraiser_key').on(t.pledgeId, t.fundraiserId),
    check('payouts_status_check', oneOf(t.status, PAYOUT_STATUSES)),
  ],
)

export const clawbacks = pgTable(
  'clawbacks',
  {
    id: pk(),
    payoutId: uuid('payout_id')
      .notNull()
      .references(() => payouts.id),
    reason: text('reason').notNull(),
    reportMonth: text('report_month'),
    clawbackDate: date('clawback_date'),
    confirmed: boolean('confirmed').notNull().default(false),
    confirmedBy: uuid('confirmed_by'),
    nettedInRun: uuid('netted_in_run').references(() => payrollRuns.id),
    createdAt: createdAt(),
  },
  (t) => [check('clawbacks_reason_check', oneOf(t.reason, CLAWBACK_REASONS))],
)

// ---------------------------------------------------------------------------
// Charity invoicing
// ---------------------------------------------------------------------------

export const invoices = pgTable('invoices', {
  id: pk(),
  charityId: uuid('charity_id')
    .notNull()
    .references(() => charities.id),
  invoiceNo: text('invoice_no').notNull().unique(),
  batchNo: text('batch_no'),
  /** Lifecycle date 6. */
  invoicedDate: date('invoiced_date'),
  total: moneyWide('total'),
  createdAt: createdAt(),
})

export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: pk(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    pledgeId: uuid('pledge_id')
      .notNull()
      .references(() => pledges.id),
    amount: money('amount').notNull(),
    /** 'charge' | 'clawback_credit' — credit-backs to the charity. */
    lineType: text('line_type').notNull().default('charge'),
  },
  (t) => [
    check('invoice_lines_line_type_check', oneOf(t.lineType, INVOICE_LINE_TYPES)),
  ],
)

// ---------------------------------------------------------------------------
// Export system
// ---------------------------------------------------------------------------

export const exportTemplates = pgTable(
  'export_templates',
  {
    id: pk(),
    name: text('name').notNull(),
    description: text('description'),
    baseDataset: text('base_dataset').notNull(),
    /** Ordered [{field, header, format, enabled}]. */
    columns: jsonb('columns').notNull(),
    filters: jsonb('filters').notNull().default({}),
    fileFormat: text('file_format').notNull().default('xlsx'),
    piiLevel: text('pii_level').notNull().default('full'),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    visibility: text('visibility').notNull().default('everyone'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'export_templates_base_dataset_check',
      oneOf(t.baseDataset, EXPORT_BASE_DATASETS),
    ),
    check(
      'export_templates_pii_level_check',
      oneOf(t.piiLevel, EXPORT_PII_LEVELS),
    ),
  ],
)

export const exportSchedules = pgTable('export_schedules', {
  id: pk(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => exportTemplates.id),
  /** 'daily' | 'weekly' | 'monthly'. */
  cadence: text('cadence').notNull(),
  /** {dow:1} | {dom:25} | {time:'08:00'} */
  cadenceDetail: jsonb('cadence_detail'),
  /** 'email_attachment' | 'email_link' | 'folder'. */
  delivery: text('delivery').notNull(),
  recipients: jsonb('recipients').notNull(),
  /** null = all charities; set = fan out per charity. */
  charityScope: uuid('charity_scope').references(() => charities.id),
  /** Required when piiLevel != 'none'. */
  approvedBy: uuid('approved_by'),
  isActive: boolean('is_active').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdAt: createdAt(),
})

export const exportRuns = pgTable('export_runs', {
  id: pk(),
  /**
   * Nullable since 2026-08-18. The built-in template catalogue (§4.5) lives in
   * code and is identified by code, not by an export_templates row, so
   * requiring the FK meant a built-in export could not be logged at all —
   * and an unlogged PII export is exactly what the audit rule forbids.
   */
  templateId: uuid('template_id').references(() => exportTemplates.id),
  /** e.g. 'A1'. Identifies a built-in template with no catalogue row. */
  templateCode: text('template_code'),
  templateName: text('template_name'),
  scheduleId: uuid('schedule_id').references(() => exportSchedules.id),
  runBy: uuid('run_by'),
  /** Display name of whoever ran it — see importBatches.uploadedByName. */
  runByName: text('run_by_name'),
  filtersApplied: jsonb('filters_applied'),
  rowCount: integer('row_count'),
  fileName: text('file_name'),
  containsPii: boolean('contains_pii').notNull(),
  createdAt: createdAt(),
})

// ---------------------------------------------------------------------------
// App plumbing
// ---------------------------------------------------------------------------

/** e.g. 'org.name', 'import.status_report.mapping', 'charity.aliases'. */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by'),
  updatedAt: updatedAt(),
})

export const auditLog = pgTable(
  'audit_log',
  {
    id: pk(),
    actorId: uuid('actor_id'),
    /**
     * Display name of the actor — see importBatches.uploadedByName. An audit
     * row that cannot say who acted is not an audit row.
     */
    actorName: text('actor_name'),
    /** 'import.run' | 'export.run' | 'payroll.approve' | 'settings.update' … */
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    detail: jsonb('detail'),
    containsPii: boolean('contains_pii').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_action_created_at_idx').on(t.action, t.createdAt)],
)
