import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge, Button, Card, CardHeader, SectionTitle, Table, Td, Th, Tr } from '@/components/ui'
import { StatTile } from '@/components/charts/stat-tile'
import { AreaChart } from '@/components/charts/area-chart'
import { BarList } from '@/components/charts/bar-list'
import { Donut } from '@/components/charts/donut'
import { ColumnChart } from '@/components/charts/column-chart'
import {
  getAgeBands,
  getFrequencyMix,
  getFundraiserPerformance,
  getInstrumentSplit,
  getKpis,
  getResultsSplit,
  getSitePerformance,
  getTimeSeries,
  getUploads,
} from '@/lib/data'
import { count, date, moneyCompact, percent } from '@/lib/format'

export const metadata: Metadata = { title: 'Overview · FundPro' }

/**
 * Results split colours.
 *
 * Assigned so the hue does not fight the meaning: amber for "still retrying",
 * orange for "failed", and a neutral grey for "cancelled". The categorical
 * green is deliberately unused here — green on a cancelled segment reads as a
 * good outcome.
 */
const SPLIT_COLORS: Record<string, string> = {
  approved: 'var(--series-1)',
  failed_retryable: 'var(--series-4)',
  failed_final: 'var(--series-2)',
  cancelled: 'var(--axis)',
}

export default async function OverviewPage() {
  const [kpis, series, split, leaderboard, sites, instruments, ageBands, freq, uploads] =
    await Promise.all([
      getKpis(),
      getTimeSeries(),
      getResultsSplit(),
      getFundraiserPerformance(),
      getSitePerformance(),
      getInstrumentSplit(),
      getAgeBands(),
      getFrequencyMix(),
      getUploads(),
    ])

  const submitted = split.reduce((s, d) => s + d.value, 0)
  const recentUploads = uploads.slice(0, 4)

  return (
    <div className="space-y-8">
      {/* ---- Header ---- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-primary">
            Overview
          </h1>
          <p className="mt-1 text-sm text-muted">
            {count(kpis.signups)} donor sign-ups over the last 4 months
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">
            Last 90 days
          </Button>
          <Link href="/app/exports">
            <Button variant="primary" size="sm">
              ↧ Export
            </Button>
          </Link>
        </div>
      </div>

      {/* ---- KPI row. Realization rate is the headline metric. ---- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          accent
          label="Donors that stick"
          value={percent(kpis.realizationRate)}
          delta={kpis.realizationDelta}
          hint="vs prior period"
          spark={series.map((p) => (p.signups ? p.realized / p.signups : 0))}
        />
        <StatTile
          label="Sign-ups"
          value={count(kpis.signups)}
          hint={`${count(submitted)} submitted`}
          spark={series.map((p) => p.signups)}
          sparkColor="var(--series-3)"
        />
        <StatTile
          gold
          label="Pledged value"
          value={moneyCompact(kpis.pledgedValue)}
          unit="/mo"
          hint={`avg ${moneyCompact(kpis.avgPledge)}`}
          spark={series.map((p) => p.value)}
          sparkColor="var(--series-2)"
        />
        <StatTile
          label="Days to first payment"
          value={kpis.avgLagDays.toFixed(1)}
          unit="days"
          hint="from sign-up to money in"
        />
      </div>

      {/* ---- Primary chart + results split ---- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card feature className="xl:col-span-2">
          <CardHeader
            title="Pledged value over time"
            subtitle="How much monthly giving was signed up each week"
            action={
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: 'var(--series-1)' }}
                  aria-hidden
                />
                Pledged value
              </span>
            }
          />
          <AreaChart data={series} metric="value" />
        </Card>

        <Card feature>
          <CardHeader
            title="Billing results"
            subtitle={`${count(submitted)} sent to the bank so far`}
          />
          <Donut
            data={split.map((d) => ({
              label: d.label,
              value: d.value,
              color: SPLIT_COLORS[d.classification] ?? 'var(--series-1)',
            }))}
            centreLabel="approved and billing"
            centreValue={percent(kpis.realizationRate, 0)}
          />
        </Card>
      </div>

      {/* ---- Performance ---- */}
      <div>
        <SectionTitle hint="who is bringing in donors that stick">
          Performance
        </SectionTitle>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card feature>
            <CardHeader
              title="Top fundraisers"
              subtitle="By donors who actually started paying"
            />
            <BarList
              data={leaderboard.slice(0, 8).map((f) => ({
                label: f.name,
                sublabel: f.leaderName,
                value: f.realized,
                note: percent(f.realizationRate, 0),
              }))}
              format="count"
            />
          </Card>

          <Card>
            <CardHeader
              title="Sites"
              subtitle="Which venues bring in the most donors"
            />
            <BarList
              data={sites.map((s) => ({
                label: s.name,
                sublabel: `${s.charityCode} · ${s.country}`,
                value: s.signups,
                note: percent(s.realizationRate, 0),
                tone: 'series-3',
              }))}
              format="count"
            />
          </Card>
        </div>
      </div>

      {/* ---- Donor mix ---- */}
      <div>
        <SectionTitle>Donor &amp; payment mix</SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader
              title="Age bands"
              subtitle="Which age groups give, and how many stick"
            />
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
              data={freq.map((f) => ({
                label: f.label,
                value: f.value,
                tone: 'series-3',
              }))}
              format="count"
            />
            <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-[11px] leading-relaxed text-warning-text">
              <strong>⚠ One thing to confirm.</strong> The spreadsheets write
              giving frequency two different ways, so these totals need a quick
              check with the team before anyone relies on them.
            </p>
          </Card>
        </div>
      </div>

      {/* ---- Recent consolidation activity ---- */}
      <div>
        <SectionTitle hint="every file the bank sends us">
          Recent uploads
        </SectionTitle>
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
                      <span className="font-medium text-critical-text">
                        {u.exceptionCount}
                      </span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </Td>
                  <Td>
                    {u.status === 'consolidated' ? (
                      <Badge tone="good" dot>
                        Consolidated
                      </Badge>
                    ) : (
                      <Badge tone="warning" dot>
                        Needs review
                      </Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-4">
            <Link href="/app/uploads">
              <Button size="sm">View all uploads →</Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
