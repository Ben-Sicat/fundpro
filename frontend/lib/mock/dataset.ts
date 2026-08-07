/**
 * Deterministic mock dataset.
 *
 * Shapes and vocabularies are taken from the real sample files (see
 * docs/FINDINGS.md): four charities with PH and MY sites, mixed frequencies,
 * FES/FEH serial prefixes, masked PANs, zero-padded MMYY expiries, bank status
 * 66 (approved) / 59 (failed, will retry).
 *
 * ALL NAMES AND CONTACTS ARE SYNTHETIC. `.invalid` is reserved by RFC 2606 and
 * can never route. No real donor data belongs in this file.
 *
 * Deterministic (seeded PRNG, fixed "today") so the UI is stable across renders
 * and server/client boundaries — a random dataset would cause hydration
 * mismatches and make screenshots unrepeatable.
 */
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
  PledgeNote,
  SitePerformance,
  StatusCode,
  TimePoint,
  Upload,
} from '@/lib/types'

/** Fixed reference date so the dataset never shifts under the reader. */
export const TODAY = new Date('2026-07-27T00:00:00Z')

function makeRng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = makeRng(20260727)
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]
const int = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min

function iso(base: Date, dayOffset: number): string {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + dayOffset)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Reference vocabularies (from the real files)
// ---------------------------------------------------------------------------

export const STATUS_CODES: StatusCode[] = [
  { statusId: 66, description: 'Billing Approved', classification: 'approved' },
  {
    statusId: 59,
    description: 'Billing Failed (DNH - Will retry)',
    classification: 'failed_retryable',
  },
  {
    statusId: 71,
    description: 'Card Expired',
    classification: 'failed_final',
  },
  {
    statusId: 84,
    description: 'Cancelled by Donor',
    classification: 'cancelled',
  },
]

const STATUS_BY_ID = new Map(STATUS_CODES.map((s) => [s.statusId, s]))

export const CHARITIES = [
  { code: 'STC', name: 'Save the Children' },
  { code: 'UNHCR', name: 'UNHCR' },
  { code: 'WV', name: 'World Vision' },
  { code: 'WWF', name: 'WWF' },
] as const

const SITES = [
  {
    name: 'MCIA T1 — July drive',
    locationName: 'Mactan-Cebu International Airport Terminal 1',
    country: 'PH' as const,
    charityCode: 'STC',
    startsOn: '2026-04-06',
    endsOn: '2026-07-31',
  },
  {
    name: 'MCIA T2 — July drive',
    locationName: 'Mactan-Cebu International Airport Terminal 2',
    country: 'PH' as const,
    charityCode: 'STC',
      startsOn: '2026-05-01',
    endsOn: '2026-07-31',
  },
  {
    name: 'SM Light Mall — atrium',
    locationName: 'SM Light Mall',
    country: 'PH' as const,
    charityCode: 'UNHCR',
      startsOn: '2026-04-20',
    endsOn: null,
  },
  {
    name: 'Laguindingan — arrivals',
    locationName: 'Laguindingan International Airport',
    country: 'PH' as const,
    charityCode: 'WV',
      startsOn: '2026-05-11',
    endsOn: '2026-07-15',
  },
  {
    name: 'LRT Sri Rampai — concourse',
    locationName: 'LRT Sri Rampai',
    country: 'MY' as const,
    charityCode: 'UNHCR',
      startsOn: '2026-04-13',
    endsOn: null,
  },
  {
    name: 'Amcorp Mall — ground',
    locationName: 'Amcorp Mall',
    country: 'MY' as const,
    charityCode: 'WWF',
      startsOn: '2026-06-01',
    endsOn: null,
  },
]

const LEADERS = ['Adora Lumbre', 'Mark Ramayrat', 'Jhon Magno'] as const

/**
 * `leaderNames` is a LIST: the notes call out that a fundraiser can report to
 * more than one leader, and the schema models it as an effective-dated m2m.
 * Two people below sit under two leaders — a single-leader mock would have
 * hidden that case entirely.
 *
 * `endDate` is null while the person is still on the team; an inactive
 * fundraiser keeps their history, so the dates say when it applies.
 */
const FUNDRAISERS = [
  { name: 'Almara Pasco', leaderNames: ['Adora Lumbre'], code: 'FR001', active: true, startDate: '2024-03-04', endDate: null },
  { name: 'Rico Salvador', leaderNames: ['Adora Lumbre'], code: 'FR002', active: true, startDate: '2024-08-19', endDate: null },
  { name: 'Carmela Dimaano', leaderNames: ['Adora Lumbre', 'Jhon Magno'], code: 'FR003', active: true, startDate: '2023-11-13', endDate: null },
  { name: 'Noel Gatchalian', leaderNames: ['Mark Ramayrat'], code: 'FR004', active: true, startDate: '2025-01-06', endDate: null },
  { name: 'Imelda Padilla', leaderNames: ['Mark Ramayrat'], code: 'FR005', active: true, startDate: '2025-04-21', endDate: null },
  { name: 'Boyet Calderon', leaderNames: ['Mark Ramayrat'], code: 'FR006', active: true, startDate: '2024-06-10', endDate: null },
  { name: 'Grace Tolentino', leaderNames: ['Jhon Magno'], code: 'FR007', active: true, startDate: '2025-09-01', endDate: null },
  { name: 'Vicente Ocampo', leaderNames: ['Jhon Magno'], code: 'FR008', active: true, startDate: '2026-02-02', endDate: null },
  { name: 'Sanya Rivera', leaderNames: ['Jhon Magno', 'Mark Ramayrat'], code: 'FR009', active: true, startDate: '2024-10-07', endDate: null },
  { name: 'Paulo Espino', leaderNames: ['Adora Lumbre'], code: 'FR010', active: false, startDate: '2024-01-15', endDate: '2026-05-31' },
] as const

const FIRST_NAMES = [
  'Alina', 'Boyet', 'Carmela', 'Dario', 'Elsie', 'Fidel', 'Grace', 'Hector',
  'Imelda', 'Jomar', 'Karla', 'Lito', 'Marisol', 'Noel', 'Odette', 'Paulo',
  'Queenie', 'Rico', 'Sanya', 'Tomas', 'Ursula', 'Vicente', 'Wilma', 'Yolanda',
  'Chih Chien', 'Nabila', 'Pilvathashenee', 'Jonah',
] as const

const LAST_NAMES = [
  'Abadilla', 'Bacani', 'Calderon', 'Dimaano', 'Espino', 'Fabros', 'Gatchalian',
  'Hidalgo', 'Ilagan', 'Jacinto', 'Kabigting', 'Lorenzo', 'Macaraeg', 'Nuqui',
  'Ocampo', 'Padilla', 'Quiambao', 'Rivera', 'Salvador', 'Tolentino', 'Hung',
  'Roslan', 'Jaganathan', 'Decena',
] as const

const AMOUNTS = [500, 600, 750, 780, 800, 900, 1000, 1200, 1500] as const
const FREQUENCIES = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual'] as const
const AGENTS = ['FPH316', 'RC054', 'FPH420', 'FEH201'] as const
const ISSUING_BANKS = [
  'HSBC Philippines',
  'BDO Unibank',
  'Maybank Berhad',
  'Metrobank',
] as const
const FAIL_REASONS = [
  { reason: 'DNH', desc: 'Do not honour - will retry' },
  { reason: 'INSUF', desc: 'Insufficient funds' },
  { reason: 'EXPIRED', desc: 'Card expired' },
  { reason: 'INVALID', desc: 'Invalid account number' },
] as const

// ---------------------------------------------------------------------------
// Uploads — the increments that were consolidated into the master
// ---------------------------------------------------------------------------

export const UPLOADS: Upload[] = Array.from({ length: 14 }, (_, i) => {
  const dayOffset = -(i * 3 + 1)
  const isApps = i % 5 === 4
  const rowCount = isApps ? int(40, 120) : int(18, 64)
  const exceptionCount = i === 0 ? 6 : i % 4 === 0 ? int(1, 4) : 0
  const matched = rowCount - exceptionCount
  const d = iso(TODAY, dayOffset).replace(/-/g, '')
  return {
    id: `upl_${String(i + 1).padStart(3, '0')}`,
    filename: isApps
      ? `Master Apps Tracker - ${d}.xlsx`
      : `Status Report - ${d}.xlsx`,
    sourceType: isApps ? 'apps_tracker' : 'status_report',
    uploadedAt: iso(TODAY, dayOffset),
    uploadedBy: pick(['Ops Desk', 'Rhea Santos', 'Ben Sicat']),
    rowCount,
    matchedCount: matched,
    newRecordCount: isApps ? matched : 0,
    exceptionCount,
    status: exceptionCount > 4 ? 'needs_review' : 'consolidated',
  }
})

// ---------------------------------------------------------------------------
// Pledges (the consolidated master) + billing events
// ---------------------------------------------------------------------------

const pledges: Pledge[] = []
const billingEvents: BillingEvent[] = []

const PLEDGE_COUNT = 420

for (let i = 0; i < PLEDGE_COUNT; i++) {
  const site = pick(SITES)
  const fundraiser = pick(FUNDRAISERS)
  const first = pick(FIRST_NAMES)
  const last = pick(LAST_NAMES)
  const donorName = `${first} ${last}`
  const signupOffset = -int(2, 118)
  const amount = pick(AMOUNTS)
  const instrument = rng() > 0.42 ? 'CREDIT CARD' : 'DEBIT CARD'
  const serialPrefix = site.country === 'MY' ? 'FEH' : 'FES'
  const serialNo = `${serialPrefix}${48000000 + i * 137 + int(0, 90)}`

  const submitOffset = signupOffset + int(1, 6)
  const submitted = submitOffset <= 0
  const uploadForEvents = UPLOADS[int(0, UPLOADS.length - 1)]

  // Billing outcome mix, roughly matching a healthy-but-imperfect book.
  const roll = rng()
  let currentStatusId: number | null = null
  let currentStatusDate: string | null = null
  let debitDate: string | null = null
  let attempts = 0
  let cancelled = false
  let cancellationDate: string | null = null

  if (submitted) {
    const firstAttemptOffset = submitOffset + int(1, 9)
    if (firstAttemptOffset <= 0) {
      attempts = 1
      if (roll < 0.63) {
        // approved first time
        currentStatusId = 66
        currentStatusDate = iso(TODAY, firstAttemptOffset)
        debitDate = currentStatusDate
      } else if (roll < 0.79) {
        // failed then approved on retry
        billingEvents.push(makeEvent(serialNo, 59, firstAttemptOffset, 1, uploadForEvents.id))
        const retryOffset = firstAttemptOffset + int(7, 21)
        attempts = 2
        if (retryOffset <= 0) {
          currentStatusId = 66
          currentStatusDate = iso(TODAY, retryOffset)
          debitDate = currentStatusDate
        } else {
          currentStatusId = 59
          currentStatusDate = iso(TODAY, firstAttemptOffset)
        }
      } else if (roll < 0.9) {
        // still retrying
        currentStatusId = 59
        currentStatusDate = iso(TODAY, firstAttemptOffset)
        attempts = int(1, 3)
      } else if (roll < 0.95) {
        // failed final
        currentStatusId = 71
        currentStatusDate = iso(TODAY, firstAttemptOffset)
        attempts = int(2, 4)
      } else {
        // approved then cancelled — the clawback path
        billingEvents.push(makeEvent(serialNo, 66, firstAttemptOffset, 1, uploadForEvents.id))
        debitDate = iso(TODAY, firstAttemptOffset)
        const cancelOffset = firstAttemptOffset + int(10, 30)
        cancelled = true
        if (cancelOffset <= 0) {
          currentStatusId = 84
          currentStatusDate = iso(TODAY, cancelOffset)
          cancellationDate = currentStatusDate
        } else {
          currentStatusId = 66
          currentStatusDate = debitDate
          cancelled = false
        }
        attempts = 1
      }
    }
  }

  if (currentStatusId !== null && currentStatusDate !== null) {
    billingEvents.push(
      makeEvent(
        serialNo,
        currentStatusId,
        Math.round(
          (new Date(currentStatusDate).getTime() - TODAY.getTime()) / 86400000,
        ),
        attempts,
        uploadForEvents.id,
      ),
    )
  }

  /**
   * "Ever billed" and "still realized" are different questions, and conflating
   * them makes the clawback case unreachable.
   *
   * Commission is paid because the pledge BILLED. If the donor then cancels,
   * the pledge stops being realized but the money has already gone out — that
   * is precisely the clawback the business needs to see. Gating `paidOut` on
   * `realized` (which excludes cancelled) meant a cancelled pledge could never
   * have been paid, so 'clawed_back' was dead code.
   */
  const everBilled = debitDate !== null
  const realized = everBilled && !cancelled
  const verified = realized ? rng() > 0.24 : rng() > 0.8
  const invoiced = realized && rng() > 0.35
  const paidOut = everBilled && rng() > 0.4

  pledges.push({
    serialNo,
    donorName,
    donorEmail: `${first.toLowerCase().replace(/\s/g, '')}.${last.toLowerCase()}${i}@example.invalid`,
    donorMobile:
      site.country === 'MY'
        ? `+601${String(10000000 + i * 7919).slice(0, 8)}`
        : `+639${String(100000000 + i * 7919).slice(0, 9)}`,
    donorDob: iso(TODAY, -365 * int(19, 64) - int(0, 364)),
    gender: rng() > 0.5 ? 'FEMALE' : 'MALE',
    city:
      site.country === 'MY'
        ? pick(['Kuala Lumpur', 'Petaling Jaya', 'Shah Alam'])
        : pick(['Cebu City', 'Mandaue', 'Lapu-Lapu', 'Cagayan de Oro']),
    country: site.country,

    charityCode: site.charityCode,
    campaignCode: `${site.charityCode}-F2F-2026`,
    siteName: site.name,
    locationName: site.locationName,
    agentId: pick(AGENTS),
    fundraiserName: fundraiser.name,
    leaderName: fundraiser.leaderNames[0],

    amount,
    currency: site.country === 'MY' ? 'MYR' : 'PHP',
    frequency: pick(FREQUENCIES),
    instrumentType: instrument,
    maskedPan: `54255${int(0, 9)}XXXXXX${String(1000 + (i % 8999)).padStart(4, '0')}`,
    // Zero-padded MMYY text — the leading zero is load-bearing.
    expiry: `${String(int(1, 12)).padStart(2, '0')}${int(27, 31)}`,
    issuingBank: pick(ISSUING_BANKS),
    processingBank: 'HSBC',

    signupDate: iso(TODAY, signupOffset),
    submittedAt: submitted ? iso(TODAY, submitOffset) : null,
    debitDate,
    verifiedAt: verified ? iso(TODAY, signupOffset + int(2, 9)) : null,
    cancellationDate,
    invoicedDate: invoiced ? iso(TODAY, signupOffset + int(20, 40)) : null,
    payoutDate: paidOut ? iso(TODAY, signupOffset + int(14, 30)) : null,

    verified,
    verifiedBy: verified ? pick(['Verification Desk', 'Rhea Santos']) : null,
    appStatus: submitted ? 'SUBMISSION' : 'PENDING',
    currentStatusId,
    currentStatusDescription:
      currentStatusId !== null
        ? (STATUS_BY_ID.get(currentStatusId)?.description ?? null)
        : null,
    currentStatusDate,
    currentClassification:
      currentStatusId !== null
        ? (STATUS_BY_ID.get(currentStatusId)?.classification ?? null)
        : null,
    attempts,
    cancelled,
    invoiceNo: invoiced ? `${site.charityCode}-2607-${1000 + i}` : null,
    commissionAmount: paidOut ? Math.round(amount * 2.5) : null,
    payoutStatus: paidOut ? (cancelled ? 'clawed_back' : 'paid') : realized ? 'unpaid' : null,
  })
}

function makeEvent(
  serialNo: string,
  statusId: number,
  dayOffset: number,
  attemptNo: number,
  uploadId: string,
): BillingEvent {
  const code = STATUS_BY_ID.get(statusId)
  const failed = code?.classification !== 'approved'
  const fail = FAIL_REASONS[Math.floor(rng() * FAIL_REASONS.length)]
  return {
    id: `evt_${serialNo}_${statusId}_${dayOffset}`,
    serialNo,
    statusId,
    statusDescription: code?.description ?? 'Unknown',
    reason: failed ? fail.reason : null,
    reasonDesc: failed ? fail.desc : null,
    statusDate: iso(TODAY, dayOffset),
    bankBatchNo: `STC2607${String(300000 + Math.abs(dayOffset) * 37).slice(0, 6)}`,
    attemptNo,
    uploadId,
  }
}

export const PLEDGES: Pledge[] = pledges
export const BILLING_EVENTS: BillingEvent[] = billingEvents

// ---------------------------------------------------------------------------
// Caller notes — the verification desk's remarks per application
// ---------------------------------------------------------------------------

/** Remark pools per situation, so a note matches the pledge it sits on. */
const NOTE_POOLS = {
  verified: [
    'Donor answered on the first try — confirmed the pledge and the monthly amount.',
    'Spoke with the donor, all details confirmed. Prefers Viber for follow-ups.',
    'Confirmed. Donor asked when the first charge lands; explained the billing cycle.',
    'Verified on call. Donor mentioned signing up for a friend as well — expect a referral.',
  ],
  unverified: [
    'No answer at 10am. Will try again after office hours.',
    'Number rings out — second attempt scheduled for tomorrow.',
    'Reached voicemail, left a callback message. Flagging for the evening shift.',
    'Donor asked to be called back on the weekend. Set a reminder.',
  ],
  retrying: [
    'Called about the failed charge. Donor will top up the card before the retry.',
    'Donor says the card was replaced — new expiry to be collected on next call.',
    'Aware of the failed billing; asked us to retry after payday on the 15th.',
  ],
  cancelled: [
    'Donor asked to stop — budget reasons. Polite call, no complaint about the sign-up.',
    'Cancellation confirmed. Donor may resume after December; keep on the warm list.',
  ],
} as const

const NOTE_AUTHORS = ['Rhea Santos', 'Verification Desk', 'Ops Desk'] as const

/**
 * Mutable on purpose: `addPledgeNote` in the data seam appends here, exactly
 * as an INSERT will once the API exists. Roughly a third of applications
 * carry notes — a thread on every row would read as noise, none at all would
 * hide the feature.
 */
export const PLEDGE_NOTES: PledgeNote[] = (() => {
  const out: PledgeNote[] = []
  for (const p of PLEDGES) {
    if (rng() > 0.34) continue
    const pool = p.cancelled
      ? NOTE_POOLS.cancelled
      : p.currentClassification === 'failed_retryable'
        ? NOTE_POOLS.retrying
        : p.verified
          ? NOTE_POOLS.verified
          : NOTE_POOLS.unverified
    const n = int(1, Math.min(3, pool.length))
    // Notes trail the sign-up by a few days each, mirroring real call attempts.
    let offset = Math.max(
      -118,
      Math.round((new Date(p.signupDate).getTime() - TODAY.getTime()) / 86400000) +
        int(1, 4),
    )
    for (let k = 0; k < n; k++) {
      out.push({
        id: `note_${p.serialNo}_${k}`,
        serialNo: p.serialNo,
        author: pick(NOTE_AUTHORS),
        createdAt: `${iso(TODAY, Math.min(offset, 0))}T${String(int(9, 18)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:00Z`,
        text: pool[k % pool.length],
      })
      offset += int(2, 6)
    }
  }
  return out
})()

// ---------------------------------------------------------------------------
// Derived collections
// ---------------------------------------------------------------------------

export const EXCEPTIONS: ImportException[] = (() => {
  const problems: {
    problem: ImportException['problem']
    detail: string
  }[] = [
    {
      problem: 'no_matching_pledge',
      detail: 'SERIAL NO not present in the master apps tracker',
    },
    {
      problem: 'name_mismatch',
      detail: "Bank CUSTOMERS NAME does not match the donor on file",
    },
    {
      problem: 'unknown_status_id',
      detail: 'STATUS ID is not in the status code dictionary',
    },
    {
      problem: 'parse_error',
      detail: 'STATUS DATE could not be parsed from "=DATE(2026,7,)"',
    },
    {
      problem: 'pan_mismatch',
      detail: 'Masked card number differs from the stored instrument',
    },
  ]
  const out: ImportException[] = []
  UPLOADS.filter((u) => u.exceptionCount > 0).forEach((u) => {
    for (let i = 0; i < u.exceptionCount; i++) {
      const p = problems[(i + u.filename.length) % problems.length]
      const serial = `FES${48000000 + int(0, 60000)}`
      out.push({
        id: `exc_${u.id}_${i}`,
        uploadId: u.id,
        filename: u.filename,
        serialNo: p.problem === 'parse_error' ? null : serial,
        problem: p.problem,
        detail: p.detail,
        rawSummary:
          p.problem === 'unknown_status_id'
            ? `STATUS ID 77 · ${serial} · 2026-07-08`
            : `${serial} · STATUS ID 59 · 1,000.00`,
        resolved: u.status === 'consolidated',
        createdAt: u.uploadedAt,
      })
    }
  })
  return out
})()

export const DONORS: Donor[] = (() => {
  const byName = new Map<string, Pledge[]>()
  PLEDGES.forEach((p) => {
    const list = byName.get(p.donorName) ?? []
    list.push(p)
    byName.set(p.donorName, list)
  })
  return Array.from(byName.entries()).map(([name, list], i) => {
    const head = list[0]
    // Flag a handful as dedupe candidates — the real risk is paying commission
    // twice on the same human.
    const dup = list.length > 1 && i % 3 === 0
    return {
      id: `dnr_${String(i + 1).padStart(4, '0')}`,
      fullName: name,
      email: head.donorEmail,
      mobile: head.donorMobile,
      dob: head.donorDob,
      city: head.city,
      country: head.country,
      pledgeCount: list.length,
      totalMonthlyValue: list.reduce((s, p) => s + p.amount, 0),
      currency: head.currency,
      firstSignup: list
        .map((p) => p.signupDate)
        .sort()
        .at(0)!,
      duplicateOf: dup ? `dnr_${String(i).padStart(4, '0')}` : null,
      duplicateSignal: dup ? (i % 2 === 0 ? 'mobile' : 'email') : null,
    }
  })
})()

export const EXPORT_TEMPLATES: ExportTemplate[] = [
  {
    id: 'a1',
    code: 'A1',
    name: 'Master Apps Tracker',
    description:
      'The full legacy layout, 111 columns, headers byte-for-byte including CUSTOMER’S NAME and Fax AREACODE. The org’s safety net.',
    group: 'Legacy',
    columnCount: 111,
    piiLevel: 'full',
    legacy: true,
  },
  {
    id: 'a2',
    code: 'A2',
    name: 'Master Results Tracker',
    description:
      'All 26 bank columns, flattened from the accumulated billing history.',
    group: 'Legacy',
    columnCount: 26,
    piiLevel: 'full',
    legacy: true,
  },
  {
    id: 'a3',
    code: 'A3',
    name: 'Daily Status Report snapshot',
    description:
      'The 26 columns scoped to a single upload, plus import batch id and time.',
    group: 'Legacy',
    columnCount: 28,
    piiLevel: 'full',
    legacy: true,
  },
  {
    id: 'b1',
    code: 'B1',
    name: 'Pledge Lifecycle',
    description:
      'One row per application across all seven dates, with realization flags.',
    group: 'Operational',
    columnCount: 22,
    piiLevel: 'masked',
    legacy: false,
  },
  {
    id: 'b2',
    code: 'B2',
    name: 'Retry / Failed Billing Queue',
    description:
      'Everything currently failing, with attempts, days in state and card expiry risk.',
    group: 'Operational',
    columnCount: 16,
    piiLevel: 'full',
    legacy: false,
  },
  {
    id: 'b3',
    code: 'B3',
    name: 'Verification Backlog',
    description: 'Unverified sign-ups ranked by days waiting on a call.',
    group: 'Operational',
    columnCount: 10,
    piiLevel: 'full',
    legacy: false,
  },
  {
    id: 'b4',
    code: 'B4',
    name: 'Import Exceptions',
    description: 'Every row that would not consolidate, with the raw values.',
    group: 'Operational',
    columnCount: 11,
    piiLevel: 'masked',
    legacy: false,
  },
  {
    id: 'c1',
    code: 'C1',
    name: 'Payroll Run',
    description: 'Detail and summary sheets for one semi-monthly cutoff.',
    group: 'Payroll',
    columnCount: 14,
    piiLevel: 'masked',
    legacy: false,
  },
  {
    id: 'c2',
    code: 'C2',
    name: 'Clawback Ledger',
    description: 'Commissions reversed, why, and which run they netted into.',
    group: 'Payroll',
    columnCount: 11,
    piiLevel: 'masked',
    legacy: false,
  },
  {
    id: 'c3',
    code: 'C3',
    name: 'Fundraiser Performance Statement',
    description: 'Monthly sign-ups, realization rate, earnings and rank.',
    group: 'Payroll',
    columnCount: 13,
    piiLevel: 'none',
    legacy: false,
  },
  {
    id: 'd1',
    code: 'D1',
    name: 'Charity Invoice',
    description: 'Charge and clawback-credit lines with a running total.',
    group: 'Charity & financial',
    columnCount: 12,
    piiLevel: 'masked',
    legacy: false,
  },
  {
    id: 'd2',
    code: 'D2',
    name: 'Charity Donor Delivery',
    description:
      'Aggregate delivery per charity. No PII at all — safe to send outward.',
    group: 'Charity & financial',
    columnCount: 10,
    piiLevel: 'none',
    legacy: false,
  },
  {
    id: 'd3',
    code: 'D3',
    name: 'Management P&L',
    description: 'Revenue, commission cost and margin per charity per month.',
    group: 'Charity & financial',
    columnCount: 13,
    piiLevel: 'none',
    legacy: false,
  },
  {
    id: 'e1',
    code: 'E1',
    name: 'Bank Submission File',
    description:
      'New verified applications in the bank’s layout. Column set pending the bank spec.',
    group: 'Outbound',
    columnCount: 46,
    piiLevel: 'full',
    legacy: false,
  },
]

export const EXPORT_RUNS: ExportRun[] = Array.from({ length: 9 }, (_, i) => {
  const t = EXPORT_TEMPLATES[(i * 3) % EXPORT_TEMPLATES.length]
  const d = iso(TODAY, -i * 2 - 1)
  return {
    id: `run_${String(i + 1).padStart(3, '0')}`,
    templateCode: t.code,
    templateName: t.name,
    runAt: d,
    runBy: ['Ben Sicat', 'Ops Desk', 'Rhea Santos'][i % 3],
    rowCount: int(120, 4200),
    fileName: `${t.code}_${t.name.replace(/[^A-Za-z]+/g, '_')}_${d.replace(/-/g, '')}.xlsx`,
    containsPii: t.piiLevel !== 'none',
  }
})

export const PAYROLL_RUNS: PayrollRun[] = (
  [
    { runDate: iso(TODAY, 3), cutoffStart: iso(TODAY, -11), cutoffEnd: iso(TODAY, 4), status: 'draft' },
    { runDate: iso(TODAY, -12), cutoffStart: iso(TODAY, -26), cutoffEnd: iso(TODAY, -12), status: 'paid' },
    { runDate: iso(TODAY, -27), cutoffStart: iso(TODAY, -42), cutoffEnd: iso(TODAY, -27), status: 'paid' },
    { runDate: iso(TODAY, -42), cutoffStart: iso(TODAY, -57), cutoffEnd: iso(TODAY, -43), status: 'paid' },
  ] satisfies Omit<
    PayrollRun,
    'id' | 'fundraiserCount' | 'pledgeCount' | 'grossCommission' | 'clawbacks' | 'netPayable'
  >[]
).map((r, i) => {
  const gross = int(180000, 420000)
  const claw = int(4000, 38000)
  return {
    id: `pay_${String(i + 1).padStart(3, '0')}`,
    ...r,
    fundraiserCount: int(7, 10),
    pledgeCount: int(60, 190),
    grossCommission: gross,
    clawbacks: claw,
    netPayable: gross - claw,
  }
})

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

const isRealized = (p: Pledge) => p.debitDate !== null && !p.cancelled

export function computeKpis(rows: Pledge[] = PLEDGES): Kpis {
  const signups = rows.length
  const realized = rows.filter(isRealized).length
  const submitted = rows.filter((p) => p.submittedAt !== null)
  const pledgedValue = rows.reduce((s, p) => s + p.amount, 0)

  const lags = rows
    .filter((p) => p.debitDate && p.signupDate)
    .map(
      (p) =>
        (new Date(p.debitDate!).getTime() - new Date(p.signupDate).getTime()) /
        86400000,
    )

  const monthStart = iso(TODAY, -27)
  return {
    signups,
    pledgedValue,
    realizationRate: submitted.length ? realized / submitted.length : 0,
    // Prior-period comparison, expressed in percentage points.
    realizationDelta: 0.021,
    avgPledge: signups ? pledgedValue / signups : 0,
    avgLagDays: lags.length ? lags.reduce((a, b) => a + b, 0) / lags.length : 0,
    verifiedPct: signups ? rows.filter((p) => p.verified).length / signups : 0,
    activeDonors: realized,
    cancelledThisMonth: rows.filter(
      (p) => p.cancellationDate && p.cancellationDate >= monthStart,
    ).length,
  }
}

/**
 * Weekly buckets across the dataset window.
 *
 * Stops at the last COMPLETE week. Including the current part-week would draw a
 * cliff to near-zero on the right-hand edge of every trend line — an artifact of
 * the bucket being 1 day old, which reads as a collapse in performance.
 */
export function computeTimeSeries(rows: Pledge[] = PLEDGES): TimePoint[] {
  const buckets = new Map<string, TimePoint>()
  for (let w = 16; w >= 1; w--) {
    const key = iso(TODAY, -w * 7)
    buckets.set(key, { date: key, signups: 0, value: 0, realized: 0 })
  }
  rows.forEach((p) => {
    // Week 0 is the current, incomplete week; 1..16 are complete weeks back.
    // Bucketing by explicit index (rather than "nearest key at or before")
    // keeps week-0 rows out instead of folding them into week 1.
    const daysBack = Math.floor(
      (TODAY.getTime() - new Date(p.signupDate).getTime()) / 86400000,
    )
    const weekIndex = Math.floor(daysBack / 7)
    if (weekIndex < 1 || weekIndex > 16) return

    const b = buckets.get(iso(TODAY, -weekIndex * 7))
    if (!b) return
    b.signups += 1
    b.value += p.amount
    if (isRealized(p)) b.realized += 1
  })
  return Array.from(buckets.values())
}

export function computeFundraiserPerformance(
  rows: Pledge[] = PLEDGES,
): FundraiserPerformance[] {
  const map = new Map<string, Pledge[]>()
  rows.forEach((p) => {
    const list = map.get(p.fundraiserName) ?? []
    list.push(p)
    map.set(p.fundraiserName, list)
  })
  return Array.from(map.entries())
    .map(([name, list]) => {
      const submitted = list.filter((p) => p.submittedAt !== null)
      const realized = list.filter(isRealized)
      const value = list.reduce((s, p) => s + p.amount, 0)
      return {
        name,
        leaderName: list[0].leaderName,
        signups: list.length,
        realized: realized.length,
        realizationRate: submitted.length ? realized.length / submitted.length : 0,
        avgPledge: list.length ? value / list.length : 0,
        pledgedValue: value,
        grossCommission: realized.reduce((s, p) => s + p.amount * 2.5, 0),
        clawbacks: list
          .filter((p) => p.payoutStatus === 'clawed_back')
          .reduce((s, p) => s + p.amount * 2.5, 0),
      }
    })
    .sort((a, b) => b.realized - a.realized)
}

export function computeSitePerformance(
  rows: Pledge[] = PLEDGES,
): SitePerformance[] {
  return SITES.map((site) => {
    const list = rows.filter((p) => p.siteName === site.name)
    const submitted = list.filter((p) => p.submittedAt !== null)
    const realized = list.filter(isRealized)
    return {
      name: site.name,
      locationName: site.locationName,
      country: site.country,
      charityCode: site.charityCode,
      startsOn: site.startsOn,
      endsOn: site.endsOn ?? null,
      staffCount: new Set(list.map((p) => p.fundraiserName)).size,
      signups: list.length,
      realizationRate: submitted.length ? realized.length / submitted.length : 0,
      pledgedValue: list.reduce((s, p) => s + p.amount, 0),
    }
  }).sort((a, b) => b.signups - a.signups)
}

export { LEADERS, SITES, FUNDRAISERS }


// ---------------------------------------------------------------------------
// Team — fundraisers and leaders
// ---------------------------------------------------------------------------

export interface FundraiserRecord {
  name: string
  code: string
  active: boolean
  /** First day on the team. */
  startDate: string
  /** Last day, or null while still active. */
  endDate: string | null
  /** A fundraiser can report to more than one leader. */
  leaderNames: string[]
  signups: number
  realized: number
  realizationRate: number
  pledgedValue: number
  avgPledge: number
  sites: string[]
}

export interface LeaderRecord {
  name: string
  teamSize: number
  fundraiserNames: string[]
  signups: number
  realized: number
  realizationRate: number
  pledgedValue: number
}

export function computeFundraiserRecords(rows: Pledge[] = PLEDGES): FundraiserRecord[] {
  return FUNDRAISERS.map((fr) => {
    const list = rows.filter((p) => p.fundraiserName === fr.name)
    const submitted = list.filter((p) => p.submittedAt !== null)
    const realized = list.filter(isRealized)
    const value = list.reduce((s, p) => s + p.amount, 0)
    return {
      name: fr.name,
      code: fr.code,
      active: fr.active,
      startDate: fr.startDate,
      endDate: fr.endDate,
      leaderNames: [...fr.leaderNames],
      signups: list.length,
      realized: realized.length,
      realizationRate: submitted.length ? realized.length / submitted.length : 0,
      pledgedValue: value,
      avgPledge: list.length ? value / list.length : 0,
      sites: Array.from(new Set(list.map((p) => p.siteName))).filter(Boolean),
    }
  }).sort((a, b) => b.realized - a.realized)
}

/**
 * Leader roll-up.
 *
 * A fundraiser under two leaders counts toward BOTH, so the per-leader figures
 * deliberately do not sum to the company total. Anything else would either
 * drop a leader's team member or silently pick one leader as "the real" one.
 */
export function computeLeaderRecords(rows: Pledge[] = PLEDGES): LeaderRecord[] {
  const frs = computeFundraiserRecords(rows)
  return LEADERS.map((leader) => {
    const team = frs.filter((f) => f.leaderNames.includes(leader))
    const signups = team.reduce((s, f) => s + f.signups, 0)
    const realized = team.reduce((s, f) => s + f.realized, 0)
    return {
      name: leader,
      teamSize: team.length,
      fundraiserNames: team.map((f) => f.name),
      signups,
      realized,
      realizationRate: signups ? realized / signups : 0,
      pledgedValue: team.reduce((s, f) => s + f.pledgedValue, 0),
    }
  }).sort((a, b) => b.realized - a.realized)
}
