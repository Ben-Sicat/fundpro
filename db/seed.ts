/**
 * Seed script — `pnpm db:seed`.
 *
 * ALL DATA HERE IS SYNTHETIC. No real donor PII may ever enter this file
 * (PH Data Privacy Act, RA 10173). Names are generated from fixed word lists,
 * emails use the reserved `.invalid` TLD, and card numbers are masked shapes
 * that were never issued.
 *
 * Deterministic: a seeded PRNG means repeated runs produce identical data, so
 * test expectations stay stable. Idempotent: re-running clears seeded rows
 * first rather than duplicating them.
 */
import { config } from 'dotenv'
import { sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'
import * as authSchema from './auth-schema'

config({ path: '.env.local' })
config({ path: '.env' })

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set.')

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — no Math.random, so seeds are reproducible.
// ---------------------------------------------------------------------------
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
const int = (min: number, max: number) =>
  Math.floor(rng() * (max - min + 1)) + min

const FIRST_NAMES = [
  'Alina', 'Boyet', 'Carmela', 'Dario', 'Elsie', 'Fidel', 'Grace', 'Hector',
  'Imelda', 'Jomar', 'Karla', 'Lito', 'Marisol', 'Noel', 'Odette', 'Paulo',
  'Queenie', 'Rico', 'Sanya', 'Tomas', 'Ursula', 'Vicente', 'Wilma', 'Yolanda',
] as const
const LAST_NAMES = [
  'Abadilla', 'Bacani', 'Calderon', 'Dimaano', 'Espino', 'Fabros', 'Gatchalian',
  'Hidalgo', 'Ilagan', 'Jacinto', 'Kabigting', 'Lorenzo', 'Macaraeg', 'Nuqui',
  'Ocampo', 'Padilla', 'Quiambao', 'Rivera', 'Salvador', 'Tolentino',
] as const

const fullName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`

/** ISO date string offset by whole days from a base. */
function isoDate(base: Date, dayOffset: number): string {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + dayOffset)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const client = postgres(url!, { max: 1 })
  const db = drizzle(client, { schema: { ...schema, ...authSchema } })

  try {
    console.log('Seeding…')

    // -- Clear previously seeded data (children first). ---------------------
    // TRUNCATE ... CASCADE keeps this idempotent without hand-ordering every FK.
    await db.execute(sql`
      truncate table
        clawbacks, payouts, payroll_runs, commission_plans,
        invoice_lines, invoices,
        billing_events, import_exceptions, import_batches,
        payment_methods, pledge_on_behalf, pledges,
        donors, site_assignments, sites,
        fundraiser_leaders, leaders, fundraisers,
        campaigns, agents, locations, charities,
        export_runs, export_schedules, export_templates,
        app_settings, audit_log, users
      restart identity cascade
    `)

    // -- status_codes: the two CONFIRMED codes (spec Part 5). --------------
    // Others are added via admin settings when the bank dictionary arrives.
    await db
      .insert(schema.statusCodes)
      .values([
        { statusId: 66, description: 'Billing Approved', classification: 'approved' },
        {
          statusId: 59,
          description: 'Billing Failed (DNH - Will retry)',
          classification: 'failed_retryable',
        },
      ])
      .onConflictDoNothing()

    // -- Charities. --------------------------------------------------------
    // STC per the spec, plus the others found in the real payroll reference.
    const charityRows = await db
      .insert(schema.charities)
      .values([
        { code: 'STC', name: 'Save the Children', sourceCode: 'STC', invoicePrefix: 'STC' },
        { code: 'UNHCR', name: 'UNHCR', sourceCode: 'UNHCR', invoicePrefix: 'UNH' },
        { code: 'WV', name: 'World Vision', sourceCode: 'WV', invoicePrefix: 'WVI' },
        { code: 'WWF', name: 'WWF', sourceCode: 'WWF', invoicePrefix: 'WWF' },
      ])
      .returning()
    const stc = charityRows.find((c) => c.code === 'STC')!

    // -- Locations (PH and MY, mirroring the real spread). -----------------
    const locationRows = await db
      .insert(schema.locations)
      .values([
        { code: 'MCIA-T1', name: 'Mactan-Cebu International Airport Terminal 1', country: 'PH' },
        { code: 'MCIA-T2', name: 'Mactan-Cebu International Airport Terminal 2', country: 'PH' },
        { code: 'LAG-INTL', name: 'Laguindingan International Airport', country: 'PH' },
        { code: 'SM-LIGHT', name: 'SM Light Mall', country: 'PH' },
        { code: 'LRT-SRIRAMPAI', name: 'LRT Sri Rampai', country: 'MY' },
        { code: 'AMCORP', name: 'Amcorp Mall', country: 'MY' },
      ])
      .returning()

    // -- Agents. -----------------------------------------------------------
    const agentRows = await db
      .insert(schema.agents)
      .values([
        { agentId: 'FPH316', locationId: locationRows[0].id, description: 'Cebu team' },
        { agentId: 'RC054', locationId: locationRows[2].id, description: 'Mindanao team' },
        { agentId: 'FPH420', locationId: locationRows[3].id, description: 'Mall team' },
      ])
      .returning()

    // -- Campaigns. --------------------------------------------------------
    const campaignRows = await db
      .insert(schema.campaigns)
      .values([
        {
          charityId: stc.id,
          campaignCode: 'STC-F2F-2026',
          fundCode: 'GEN',
          appealCode: 'F2F',
          programCode: 'CHILD',
          eventCode: 'AIRPORT',
        },
        {
          charityId: charityRows[1].id,
          campaignCode: 'UNHCR-F2F-2026',
          fundCode: 'GEN',
          appealCode: 'F2F',
          programCode: 'REFUGEE',
          eventCode: 'MALL',
        },
      ])
      .returning()

    // -- 10 fundraisers, 3 leaders, m2m effective-dated. -------------------
    const fundraiserRows = await db
      .insert(schema.fundraisers)
      .values(
        Array.from({ length: 10 }, (_, i) => ({
          fullName: fullName(),
          employeeCode: `FR${String(i + 1).padStart(3, '0')}`,
          recruiterCode: 'FP',
          isActive: i < 9, // one inactive, to exercise filtering
        })),
      )
      .returning()

    const leaderRows = await db
      .insert(schema.leaders)
      .values([
        { fullName: fundraiserRows[0].fullName, fundraiserId: fundraiserRows[0].id },
        { fullName: fundraiserRows[1].fullName, fundraiserId: fundraiserRows[1].id },
        { fullName: fullName() },
      ])
      .returning()

    const today = new Date('2026-07-27T00:00:00Z')

    await db.insert(schema.fundraiserLeaders).values(
      fundraiserRows.map((fr, i) => ({
        fundraiserId: fr.id,
        leaderId: leaderRows[i % leaderRows.length].id,
        effectiveFrom: isoDate(today, -120),
      })),
    )
    // One fundraiser moved teams: closes the old row, opens a new one. This is
    // what makes leader roll-ups history-aware rather than "current team only".
    await db.execute(sql`
      update fundraiser_leaders
         set effective_to = ${isoDate(today, -30)}
       where fundraiser_id = ${fundraiserRows[2].id}
    `)
    await db.insert(schema.fundraiserLeaders).values({
      fundraiserId: fundraiserRows[2].id,
      leaderId: leaderRows[2].id,
      effectiveFrom: isoDate(today, -29),
    })

    // -- 2 sites with assignments. -----------------------------------------
    const siteRows = await db
      .insert(schema.sites)
      .values([
        {
          charityId: stc.id,
          locationId: locationRows[0].id,
          name: 'MCIA T1 — July drive',
          startsOn: isoDate(today, -90),
          endsOn: isoDate(today, -10),
          notes: 'Airport arrivals hall',
        },
        {
          charityId: charityRows[1].id,
          locationId: locationRows[3].id,
          name: 'SM Light Mall — July drive',
          startsOn: isoDate(today, -60),
          endsOn: null,
          notes: 'Ground floor atrium',
        },
      ])
      .returning()

    await db.insert(schema.siteAssignments).values(
      fundraiserRows.slice(0, 8).map((fr, i) => ({
        siteId: siteRows[i % siteRows.length].id,
        fundraiserId: fr.id,
        assignedOn: isoDate(today, -60),
      })),
    )

    // -- Commission plan (placeholder; real structure is OPEN). ------------
    // Multiplier-of-pledge shape per docs/FINDINGS.md §3.3: 250.00 = x2.5.
    // trigger_rule defaults to 'on_first_approval' per spec Part 5.
    await db.insert(schema.commissionPlans).values({
      name: 'Placeholder — x2.5 of pledge on first approval',
      charityId: null,
      triggerRule: 'on_first_approval',
      pctOfPledge: '250.00',
      realizationWindowDays: 90,
      clawbackOn: ['cancelled', 'failed_final', 'unrealized'],
      effectiveFrom: isoDate(today, -180),
    })

    // -- 200 donors + pledges over ~3 months, varied billing histories. ----
    const FREQUENCIES = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual'] as const
    const INSTRUMENTS = ['CREDIT CARD', 'DEBIT CARD'] as const
    const AMOUNTS = [500, 600, 750, 780, 800, 900, 1000, 1200] as const

    const donorValues = Array.from({ length: 200 }, (_, i) => {
      const first = pick(FIRST_NAMES)
      const last = pick(LAST_NAMES)
      return {
        title: pick(['Mr', 'Ms', 'Mrs', 'Dr'] as const),
        firstName: first,
        lastName: last,
        fullName: `${first} ${last}`,
        // .invalid is reserved by RFC 2606 and can never route anywhere.
        email: `donor${i + 1}@example.invalid`,
        telMobile: `+639${String(100000000 + i * 7919).slice(0, 9)}`,
        gender: pick(['MALE', 'FEMALE'] as const),
        // Spread across the age bands (18-24, 25-30, 31-40, 41-50, 51+).
        dob: isoDate(today, -365 * int(19, 62) - int(0, 364)),
        city: pick(['Cebu City', 'Mandaue', 'Lapu-Lapu', 'Cagayan de Oro', 'Kuala Lumpur'] as const),
        country: pick(['PH', 'PH', 'PH', 'MY'] as const),
        postalMailOk: rng() > 0.3,
        emailOk: rng() > 0.2,
      }
    })
    const donorRows = await db.insert(schema.donors).values(donorValues).returning()

    // Build pledges. Serial prefix mirrors the real files (FES…/FEH…).
    const pledgeValues = donorRows.map((donor, i) => {
      const signupOffset = -int(5, 95) // within the last ~3 months
      const charity = pick(charityRows)
      const site = donor.country === 'MY' ? null : pick(siteRows)
      return {
        serialNo: `FES${48000000 + i * 137}`,
        donorId: donor.id,
        charityId: charity.id,
        fundraiserId: pick(fundraiserRows).id,
        agentId: pick(agentRows).id,
        locationId: pick(locationRows).id,
        campaignId: pick(campaignRows).id,
        siteId: site?.id ?? null,
        channel: 'F2F',
        country: donor.country,
        amount: String(pick(AMOUNTS)),
        // Multi-country: currency follows the donor, never the default.
        currency: donor.country === 'MY' ? 'MYR' : 'PHP',
        frequency: pick(FREQUENCIES),
        processingBank: 'HSBC',
        signupDate: isoDate(today, signupOffset),
        submittedAt: isoDate(today, signupOffset + int(1, 5)),
        appStatus: 'SUBMISSION',
        _signupOffset: signupOffset,
      }
    })

    const pledgeRows = await db
      .insert(schema.pledges)
      .values(pledgeValues.map(({ _signupOffset, ...rest }) => rest))
      .returning()

    // Payment methods — masked PAN shapes only, never a real card number.
    await db.insert(schema.paymentMethods).values(
      pledgeRows.map((p, i) => {
        const instrument = pick(INSTRUMENTS)
        return {
          pledgeId: p.id,
          instrumentType: instrument,
          maskedPan: `54255${int(0, 9)}XXXXXX${String(1000 + (i % 8999)).slice(0, 4)}`,
          cardType: instrument === 'CREDIT CARD' ? 'VISA' : 'MASTERCARD',
          // Zero-padded MMYY text — the leading zero must survive.
          expiry: `${String(int(1, 12)).padStart(2, '0')}${int(27, 31)}`,
          cardholderName: pledgeRows[i] ? donorRows[i].fullName : null,
          issuingBank: pick(['HSBC Philippines', 'BDO Unibank', 'Maybank'] as const),
          isCurrent: true,
        }
      }),
    )

    // -- Billing histories. ------------------------------------------------
    // A realistic mix: approved, retry-then-approve, still-failing, cancelled.
    const importBatch = await db
      .insert(schema.importBatches)
      .values({
        sourceType: 'migration',
        filename: 'seed-synthetic.xlsx',
        rowCount: pledgeRows.length,
        matchedCount: pledgeRows.length,
        unmatchedCount: 0,
      })
      .returning()

    type EventInsert = typeof schema.billingEvents.$inferInsert
    const events: EventInsert[] = []
    const approvedPledges: { id: string; debitDate: string; fundraiserId: string | null; amount: string }[] = []
    const cancelledPledgeIds: string[] = []

    pledgeRows.forEach((p, i) => {
      const signupOffset = pledgeValues[i]._signupOffset
      const firstAttempt = signupOffset + int(3, 12)
      if (firstAttempt > 0) return // not yet submitted to the bank

      const roll = rng()
      if (roll < 0.62) {
        // Approved on the first attempt.
        const d = isoDate(today, firstAttempt)
        events.push({
          pledgeId: p.id,
          importBatchId: importBatch[0].id,
          statusId: 66,
          statusDate: d,
          bankBatchNo: `STC2607${String(3000 + i).slice(0, 6)}`,
          attemptNo: 1,
          anniversary: 0,
        })
        approvedPledges.push({ id: p.id, debitDate: d, fundraiserId: p.fundraiserId, amount: p.amount })
      } else if (roll < 0.8) {
        // Failed, retried, then approved — exercises multi-event history.
        events.push({
          pledgeId: p.id,
          importBatchId: importBatch[0].id,
          statusId: 59,
          reason: 'DNH',
          reasonDesc: 'Do not honour - will retry',
          statusDate: isoDate(today, firstAttempt),
          attemptNo: 1,
          anniversary: 0,
        })
        const retry = firstAttempt + int(7, 20)
        if (retry <= 0) {
          const d = isoDate(today, retry)
          events.push({
            pledgeId: p.id,
            importBatchId: importBatch[0].id,
            statusId: 66,
            statusDate: d,
            attemptNo: 2,
            anniversary: 0,
          })
          approvedPledges.push({ id: p.id, debitDate: d, fundraiserId: p.fundraiserId, amount: p.amount })
        }
      } else if (roll < 0.92) {
        // Still failing.
        events.push({
          pledgeId: p.id,
          importBatchId: importBatch[0].id,
          statusId: 59,
          reason: 'DNH',
          reasonDesc: 'Do not honour - will retry',
          statusDate: isoDate(today, firstAttempt),
          attemptNo: int(1, 3),
          anniversary: 0,
        })
      } else {
        // Approved then cancelled — the clawback path.
        const d = isoDate(today, firstAttempt)
        events.push({
          pledgeId: p.id,
          importBatchId: importBatch[0].id,
          statusId: 66,
          statusDate: d,
          attemptNo: 1,
          anniversary: 0,
        })
        approvedPledges.push({ id: p.id, debitDate: d, fundraiserId: p.fundraiserId, amount: p.amount })
        cancelledPledgeIds.push(p.id)
      }
    })

    if (events.length) {
      await db.insert(schema.billingEvents).values(events).onConflictDoNothing()
    }

    // Derive pledge current status from the latest event — the same rule the
    // app uses, rather than a second source of truth.
    await db.execute(sql`
      update pledges p
         set current_status_id   = latest.status_id,
             current_status_date = latest.status_date
        from (
          select distinct on (pledge_id)
                 pledge_id, status_id, status_date
            from billing_events
           order by pledge_id, status_date desc, created_at desc
        ) latest
       where latest.pledge_id = p.id
    `)

    // debit_date = first approved event (§4.1).
    await db.execute(sql`
      update pledges p
         set debit_date = first_ok.status_date
        from (
          select be.pledge_id, min(be.status_date) as status_date
            from billing_events be
            join status_codes sc on sc.status_id = be.status_id
           where sc.classification = 'approved'
           group by be.pledge_id
        ) first_ok
       where first_ok.pledge_id = p.id
         and p.debit_date is null
    `)

    // Verification: a subset were phoned and confirmed.
    await db.execute(sql`
      update pledges
         set verified = true,
             verified_at = signup_date + 3,
             verification_method = 'call',
             verification_caller = 'Verification Desk'
       where debit_date is not null
         and random() < 0.7
    `)

    // Cancellations.
    if (cancelledPledgeIds.length) {
      await db.execute(sql`
        update pledges
           set cancelled = true,
               cancellation_date = current_status_date + 14,
               unrealized_report_month = to_char(current_status_date + 14, 'YYYY-MM')
         where id in ${sql`(${sql.join(
           cancelledPledgeIds.map((id) => sql`${id}::uuid`),
           sql`, `,
         )})`}
      `)
    }

    // -- A payroll run with a few payouts and one clawback. ----------------
    const run = await db
      .insert(schema.payrollRuns)
      .values({
        runDate: isoDate(today, -12),
        cutoffStart: isoDate(today, -42),
        cutoffEnd: isoDate(today, -27),
        status: 'paid',
      })
      .returning()

    const payoutSubset = approvedPledges
      .filter((p) => p.fundraiserId)
      .slice(0, 25)

    if (payoutSubset.length) {
      const payoutRows = await db
        .insert(schema.payouts)
        .values(
          payoutSubset.map((p) => ({
            pledgeId: p.id,
            fundraiserId: p.fundraiserId!,
            payrollRunId: run[0].id,
            // Placeholder x2.5 multiplier, matching the seeded plan.
            amount: (Number(p.amount) * 2.5).toFixed(2),
            conditionApplied: 'on_first_approval',
            status: 'paid',
            payoutDate: isoDate(today, -12),
          })),
        )
        .onConflictDoNothing()
        .returning()

      // Clawback candidates: paid pledges that later cancelled.
      const clawbackTargets = payoutRows.filter((po) =>
        cancelledPledgeIds.includes(po.pledgeId),
      )
      if (clawbackTargets.length) {
        await db.insert(schema.clawbacks).values(
          clawbackTargets.map((po) => ({
            payoutId: po.id,
            reason: 'cancelled' as const,
            reportMonth: isoDate(today, -5).slice(0, 7),
            clawbackDate: isoDate(today, -5),
            confirmed: false, // admin confirms before netting
          })),
        )
      }
    }

    // -- Settings defaults. ------------------------------------------------
    await db.insert(schema.appSettings).values([
      { key: 'org.name', value: 'FundPro' },
      { key: 'org.timezone', value: 'Asia/Manila' },
      { key: 'org.financial_month_start', value: 1 },
      // Alias maps for the drift found in the real files (FINDINGS §3.1).
      {
        key: 'charity.aliases',
        value: {
          'UNHCR MY': 'UNHCR',
          'UNHCR Malaysia': 'UNHCR',
          'World Vision': 'WV',
          WV: 'WV',
        },
      },
      // Frequency meaning is OPEN — the mapping is data, not code.
      {
        key: 'import.frequency_map',
        value: {
          '1': 'Monthly',
          '3': 'Quarterly',
          '6': 'Semi-Annual',
          '12': 'Monthly',
          Monthly: 'Monthly',
          Quarterly: 'Quarterly',
          'Semi-Annual': 'Semi-Annual',
          'Semi-annual': 'Semi-Annual',
          Annual: 'Annual',
        },
      },
      { key: 'payroll.eligibility_rule', value: 'on_first_approval' },
      { key: 'invoice.timing_rule', value: 'on_first_approval' },
    ])

    // -- Admin user. -------------------------------------------------------
    const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@fundpro.local').toLowerCase()
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!123'
    await db.insert(authSchema.users).values({
      email: adminEmail,
      name: 'Seed Admin',
      role: 'admin',
      passwordHash: await bcrypt.hash(adminPassword, 12),
    })

    // A charity_viewer, so isolation can be tested from Phase 3 onward.
    await db.insert(authSchema.users).values({
      email: 'stc.viewer@fundpro.local',
      name: 'STC Charity Viewer',
      role: 'charity_viewer',
      charityId: stc.id,
      passwordHash: await bcrypt.hash(adminPassword, 12),
    })

    // -- Report. -----------------------------------------------------------
    const [summary] = await db.execute<Record<string, string>>(sql`
      select
        (select count(*) from charities)      as charities,
        (select count(*) from fundraisers)    as fundraisers,
        (select count(*) from sites)          as sites,
        (select count(*) from donors)         as donors,
        (select count(*) from pledges)        as pledges,
        (select count(*) from billing_events) as billing_events,
        (select count(*) from payouts)        as payouts,
        (select count(*) from clawbacks)      as clawbacks,
        (select count(*) from pledges where debit_date is not null) as realized,
        (select count(*) from pledges where cancelled)              as cancelled,
        (select count(*) from users)          as users
    `)
    console.log('Seed complete:', summary)
    console.log(`Admin login: ${adminEmail} (password from SEED_ADMIN_PASSWORD)`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
