/**
 * Overview sections that fetch their own data and stream in independently.
 *
 * WHY THEY ARE NOT ON THE PAGE. The Overview used to await thirteen API calls
 * in one `Promise.all` before rendering anything, so the whole page waited on
 * the slowest of them and then appeared at once. With a few thousand pledges
 * behind it that is a long blank pause, and it reads as "the charts are not
 * loading".
 *
 * Split this way, the header, filters, KPI row and main chart paint as soon as
 * their own data is in, and each section below streams into a skeleton of the
 * same height. Nothing is lazy in the JavaScript sense — these are Server
 * Components and the charts they render are plain SVG with no client bundle to
 * fetch. What is deferred is the DATA, which is what was actually slow.
 *
 * Filters are passed as a plain object. That is safe across this boundary
 * because these are Server Components, not Client Components — a function prop
 * would be the thing that breaks.
 */
import Link from 'next/link'
import { FilterBar } from '@/components/filter-bar'
import { Badge, Button, Card, CardHeader, SectionTitle, Table, Td, Th, Tr } from '@/components/ui'
import { BarList } from '@/components/charts/bar-list'
import { ColumnChart } from '@/components/charts/column-chart'
import {
  getAgeBands,
  getCharities,
  getFrequencyMix,
  getFundraiserPerformance,
  getFundraiserNames,
  getInstrumentSplit,
  getLeaderNames,
  getSiteNames,
  getSitePerformance,
  getUploads,
} from '@/lib/data'
import type { PledgeFilters } from '@/lib/data'
import { count, date, dateShort, percent } from '@/lib/format'

export async function PerformanceSection({ filters }: { filters: PledgeFilters }) {
  const [leaderboard, sites] = await Promise.all([
    getFundraiserPerformance(filters),
    getSitePerformance(filters),
  ])

  return (
    <div>
      <SectionTitle hint="who is bringing in donors that stick">Performance</SectionTitle>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Top fundraisers"
            subtitle="By donors who actually started paying"
          />
          {leaderboard.length > 0 ? (
            <BarList
              data={leaderboard.slice(0, 8).map((f) => ({
                label: f.name,
                sublabel: f.leaderName,
                value: f.realized,
                note: percent(f.realizationRate, 0),
              }))}
              format="count"
            />
          ) : (
            // An empty bar list renders as an unexplained blank panel. The
            // daily Submissions files name the recruiter in AGENT NAME rather
            // than a Fundraiser Name column, so this is the state you see if
            // an import predates that mapping.
            <p className="py-6 text-center text-xs text-muted">
              No fundraiser attribution in the imported files yet.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Sites" subtitle="Where, when, and how many people worked it" />
          <BarList
            data={sites.map((s) => ({
              label: s.name,
              // Who and when, not just where.
              sublabel: `${s.charityCode} · ${s.staffCount} staff · from ${dateShort(s.startsOn)}${
                s.endsOn ? ` to ${dateShort(s.endsOn)}` : ' (running)'
              }`,
              value: s.signups,
              note: percent(s.realizationRate, 0),
              tone: 'series-3',
            }))}
            format="count"
          />
        </Card>
      </div>
    </div>
  )
}

export async function MixSection({ filters }: { filters: PledgeFilters }) {
  const [instruments, ageBands, freq] = await Promise.all([
    getInstrumentSplit(filters),
    getAgeBands(filters),
    getFrequencyMix(filters),
  ])

  return (
    <div>
      <SectionTitle>Donor &amp; payment mix</SectionTitle>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Age bands" subtitle="Which age groups give, and how many stick" />
          <ColumnChart
            data={ageBands.map((b) => ({
              label: b.band,
              value: b.count,
              rate: b.realizationRate,
              highlight: b.band === '25–30',
            }))}
          />
        </Card>

        <Card>
          <CardHeader
            title="Instrument"
            subtitle="Credit vs debit, and how often each goes through"
          />
          <ColumnChart
            data={instruments.map((d) => ({
              label: d.label,
              value: d.count,
              rate: d.approvalRate,
            }))}
          />
        </Card>

        <Card>
          <CardHeader title="Frequency mix" subtitle="How often donors give" />
          <BarList
            data={freq.map((f) => ({ label: f.label, value: f.value, tone: 'series-3' }))}
            format="count"
          />
          <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-[11px] leading-relaxed text-warning-text">
            <strong>⚠ One thing to confirm.</strong> The spreadsheets write giving
            frequency two different ways, so these totals need a quick check with
            the team before anyone relies on them.
          </p>
        </Card>
      </div>
    </div>
  )
}

export async function ActivitySection() {
  const uploads = await getUploads()
  const recentUploads = uploads.slice(0, 4)

  return (
    <div>
      <SectionTitle hint="every file the bank sends us">Recent uploads</SectionTitle>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>File</Th>
              <Th>Uploaded</Th>
              <Th align="right">Rows</Th>
              <Th align="right">Matched</Th>
              <Th align="right">Exceptions</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {recentUploads.map((u) => (
              <Tr key={u.id}>
                <Td className="font-medium text-primary">
                  <span className="flex items-center gap-2">
                    <span className="text-muted" aria-hidden>
                      {u.sourceType === 'status_report' ? '▤' : '▦'}
                    </span>
                    {u.filename}
                  </span>
                </Td>
                <Td>{date(u.uploadedAt)}</Td>
                <Td align="right" className="tabular">
                  {count(u.rowCount)}
                </Td>
                <Td align="right" className="tabular">
                  {count(u.matchedCount)}
                </Td>
                <Td align="right" className="tabular">
                  {u.exceptionCount > 0 ? (
                    <span className="font-medium text-critical-text">{u.exceptionCount}</span>
                  ) : (
                    <span className="text-muted">0</span>
                  )}
                </Td>
                <Td>
                  <UploadStatusBadge status={u.status} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <div className="mt-4">
          <Link href="/app/uploads" prefetch={false}>
            <Button size="sm">View all uploads →</Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}

/**
 * Every status except `consolidated` used to render as "Needs review", so a
 * file still being read showed up as a problem — 0 rows matched, 0 exceptions,
 * and a warning badge. During a migration that is most of the table.
 */
function UploadStatusBadge({ status }: { status: string }) {
  if (status === 'consolidated') {
    return (
      <Badge tone="good" dot>
        Consolidated
      </Badge>
    )
  }
  if (status === 'processing') {
    return (
      <Badge tone="neutral" dot>
        Reading…
      </Badge>
    )
  }
  if (status === 'failed') {
    return (
      <Badge tone="critical" dot>
        Failed
      </Badge>
    )
  }
  return (
    <Badge tone="warning" dot>
      Needs review
    </Badge>
  )
}


/**
 * The filter bar, with the four lists that populate its dropdowns.
 *
 * Separated because those lists are reference data for controls, not figures.
 * Awaiting them alongside the KPIs meant the headline numbers waited on
 * whichever of the four was slowest — and over a few thousand pledges the
 * distinct-name queries are not the fast ones.
 */
export async function FilterSection({
  action,
  current,
}: {
  action: string
  current: Record<string, string | undefined>
}) {
  const [charities, fundraisers, leaders, sites] = await Promise.all([
    getCharities(),
    getFundraiserNames(),
    getLeaderNames(),
    getSiteNames(),
  ])
  return (
    <FilterBar
      action={action}
      current={current}
      charities={charities}
      fundraisers={fundraisers}
      leaders={leaders}
      sites={sites}
    />
  )
}
