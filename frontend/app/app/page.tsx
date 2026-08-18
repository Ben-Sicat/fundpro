import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { Button, Card, CardHeader } from '@/components/ui'
import { StatTile } from '@/components/charts/stat-tile'
import { AreaChart } from '@/components/charts/area-chart'
import { Donut } from '@/components/charts/donut'
import { ChartSkeleton, ListSkeleton, TableSkeleton } from '@/components/charts/skeleton'
import { ActivitySection, FilterSection, MixSection, PerformanceSection } from './sections'
import { filtersFromParams } from '@/lib/filters'
import { getKpis, getResultsSplit, getTimeSeries } from '@/lib/data'
import { count, moneyCompact, percent } from '@/lib/format'

export const metadata: Metadata = { title: 'Overview · FundPro' }

/** Same height as the real filter bar, so the KPI row below does not jump. */
function FilterBarSkeleton() {
  return (
    <span
      aria-hidden
      className="block h-[7.5rem] animate-pulse rounded-[var(--r-md)] border border-line bg-surface-2"
    />
  )
}

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

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp = await searchParams
  // One filter object drives every widget, so the whole page always describes
  // the same slice of data.
  const f = filtersFromParams(sp)

  // Only what the first screenful needs. Everything below streams in behind a
  // Suspense boundary, so one slow endpoint no longer holds up the whole page.
  const [kpis, series, split] = await Promise.all([
    getKpis(f),
    getTimeSeries(f),
    getResultsSplit(f),
  ])

  const submitted = split.reduce((s, d) => s + d.value, 0)

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
        <div className="flex flex-wrap gap-2">
          {/* Current filters travel with you, so the wall display shows the
              same slice that is on screen. */}
          <Link href={{ pathname: '/showcase', query: sp }}>
            <Button variant="secondary" size="sm">
              ⤢ Wall display
            </Button>
          </Link>
          <Link href="/app/exports">
            <Button variant="primary" size="sm">
              ↧ Export
            </Button>
          </Link>
        </div>
      </div>

      {/* The dropdown options are reference data for controls, not figures —
          no reason for the headline numbers to wait on them. */}
      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterSection action="/app" current={sp} />
      </Suspense>

      {/* ---- KPI row. Realization rate is the headline metric. ---- */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile
          accent
          label="Donors that stick"
          value={percent(kpis.realizationRate)}
          delta={kpis.realizationDelta}
          hint="of sign-ups keep paying"
          spark={series.map((p) => (p.signups ? p.realized / p.signups : 0))}
        />
        <StatTile
          label="Sign-ups"
          value={count(kpis.signups)}
          hint={`${count(submitted)} sent to the bank`}
          spark={series.map((p) => p.signups)}
          sparkColor="var(--series-3)"
        />
        <StatTile
          gold
          label="Monthly giving"
          value={moneyCompact(kpis.pledgedValue)}
          unit="/mo"
          hint="all donors combined"
          spark={series.map((p) => p.value)}
          sparkColor="var(--series-2)"
        />
        <StatTile
          label="Average gift"
          value={moneyCompact(kpis.avgPledge)}
          unit="/mo"
          hint="per donor, each month"
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
        <Card className="xl:col-span-2">
          <CardHeader
            title="Monthly giving over time"
            subtitle="How much monthly giving was signed up each week"
            action={
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: 'var(--series-1)' }}
                  aria-hidden
                />
                Monthly giving
              </span>
            }
          />
          <AreaChart data={series} metric="value" />
        </Card>

        <Card>
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
            centreLabel="keep paying"
            centreValue={percent(kpis.realizationRate, 0)}
          />
        </Card>
      </div>

      {/* Each section fetches its own data and streams into a skeleton of the
          same height. Matching heights matter: a fallback shorter than its
          content shifts the page when it resolves and loses your scroll
          position mid-read. */}
      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ListSkeleton rows={8} title="Top fundraisers" />
            <ListSkeleton rows={8} title="Sites" />
          </div>
        }
      >
        <PerformanceSection filters={f} />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartSkeleton height={180} title="Age bands" />
            <ChartSkeleton height={180} title="Instrument" />
            <ListSkeleton rows={3} title="Frequency mix" />
          </div>
        }
      >
        <MixSection filters={f} />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={4} cols={6} />}>
        <ActivitySection />
      </Suspense>
    </div>
  )
}
