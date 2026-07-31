import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/auth'
import { AreaChart } from '@/components/charts/area-chart'
import { Donut } from '@/components/charts/donut'
import { ShowcaseControls } from '@/components/showcase-controls'
import {
  getFundraiserPerformance,
  getKpis,
  getResultsSplit,
  getSitePerformance,
  getTimeSeries,
} from '@/lib/data'
import { filtersFromParams } from '@/lib/filters'
import { count, date, moneyCompact, percent } from '@/lib/format'

export const metadata: Metadata = { title: 'Wall display · FundPro' }

/**
 * Wall-display mode — for a TV mounted in the office.
 *
 * Deliberately NOT under /app: no sidebar, no topbar, no bottom nav, nothing to
 * click. Sized to fit a 1080p screen in one view, because a display nobody
 * touches must never need scrolling to show the important half.
 *
 * Type is much larger than the app's, since this is read from across a room
 * rather than from a desk.
 */
const SPLIT_COLORS: Record<string, string> = {
  approved: 'var(--series-1)',
  failed_retryable: 'var(--series-4)',
  failed_final: 'var(--series-2)',
  cancelled: 'var(--axis)',
}

export default async function ShowcasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  // This route sits outside /app, so it does its own auth check.
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const f = filtersFromParams(sp)

  const [kpis, series, split, leaders, sites] = await Promise.all([
    getKpis(f),
    getTimeSeries(f),
    getResultsSplit(f),
    getFundraiserPerformance(f),
    getSitePerformance(f),
  ])

  const submitted = split.reduce((s, d) => s + d.value, 0)
  const top = leaders.slice(0, 5)
  const maxRealized = Math.max(...top.map((t) => t.realized), 1)

  return (
    <div className="app-canvas flex min-h-screen flex-col overflow-hidden p-4 lg:p-6">
      <ShowcaseControls />

      {/* ---- Masthead ---- */}
      <header className="flex shrink-0 items-center justify-between gap-4 pb-4">
        <div className="flex items-center gap-3">
          <span
            className="chamfer-sm grid size-10 place-items-center text-lg font-bold text-on-accent lg:size-12"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--series-3))',
            }}
            aria-hidden
          >
            ◈
          </span>
          <div>
            <p className="hud text-lg leading-none text-primary lg:text-2xl">
              FundPro
            </p>
            <p className="mt-1 text-xs text-muted lg:text-sm">
              {sp.charity ? `${sp.charity} · ` : ''}Last 4 months
            </p>
          </div>
        </div>
        <p className="hud text-right text-xs text-muted lg:text-sm">
          As of {date('2026-07-27')}
        </p>
      </header>

      {/* ---- Hero numbers. Large enough to read across a room. ---- */}
      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: 'Donors that stick',
            value: percent(kpis.realizationRate, 1),
            sub: `${count(submitted)} sent to bank`,
            glow: 'glow-accent',
          },
          {
            label: 'Sign-ups',
            value: count(kpis.signups),
            sub: 'donors recruited',
            glow: '',
          },
          {
            label: 'Monthly giving',
            value: moneyCompact(kpis.pledgedValue),
            sub: `avg ${moneyCompact(kpis.avgPledge)}`,
            glow: 'glow-gold',
          },
          {
            label: 'Days to first payment',
            value: kpis.avgLagDays.toFixed(1),
            sub: 'sign-up to money in',
            glow: '',
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`panel chamfer chamfer-ring plate-gold p-4 lg:p-5 ${s.glow}`}
          >
            <p className="hud text-[10px] text-muted lg:text-xs">{s.label}</p>
            <p className="numeral mt-1 text-4xl leading-none text-primary lg:text-6xl">
              {s.value}
            </p>
            <p className="mt-2 text-[11px] text-muted lg:text-sm">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ---- Charts. min-h-0 lets the flex children actually shrink, which is
              what keeps the whole thing inside one screen. ---- */}
      <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="panel chamfer chamfer-ring plate-gold flex min-h-0 flex-col p-4 lg:col-span-2">
          <p className="hud shrink-0 text-xs text-secondary lg:text-sm">
            Monthly giving signed up each week
          </p>
          <div className="mt-2 min-h-0 flex-1">
            <AreaChart data={series} metric="value" />
          </div>
        </div>

        <div className="panel chamfer chamfer-ring plate-gold flex min-h-0 flex-col p-4">
          <p className="hud shrink-0 text-xs text-secondary lg:text-sm">
            Billing results
          </p>
          <div className="mt-2 flex min-h-0 flex-1 items-center">
            <Donut
              data={split.map((d) => ({
                label: d.label,
                value: d.value,
                color: SPLIT_COLORS[d.classification] ?? 'var(--series-1)',
              }))}
              centreLabel="keep paying"
              centreValue={percent(kpis.realizationRate, 0)}
              maxSize={150}
            />
          </div>
        </div>
      </div>

      {/* ---- Leaderboard + sites ---- */}
      <div className="mt-3 grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="panel chamfer chamfer-ring plate-gold p-4">
          <p className="hud text-xs text-secondary lg:text-sm">Top fundraisers</p>
          <ol className="mt-2 space-y-1.5">
            {top.map((t, i) => (
              <li key={t.name} className="flex items-center gap-3">
                <span className="numeral w-5 shrink-0 text-sm text-muted lg:text-base">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-primary lg:text-lg">
                      {t.name}
                    </span>
                    <span className="numeral shrink-0 text-sm text-primary lg:text-lg">
                      {count(t.realized)}
                      <span className="ml-1.5 text-[11px] font-normal text-muted lg:text-sm">
                        {percent(t.realizationRate, 0)}
                      </span>
                    </span>
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(t.realized / maxRealized) * 100}%`,
                        backgroundColor: 'var(--series-1)',
                      }}
                    />
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="panel chamfer chamfer-ring plate-gold p-4">
          <p className="hud text-xs text-secondary lg:text-sm">Sites</p>
          <ol className="mt-2 space-y-1.5">
            {sites.slice(0, 5).map((s) => (
              <li
                key={s.name}
                className="flex items-baseline justify-between gap-3 text-sm lg:text-base"
              >
                <span className="min-w-0 truncate text-secondary">
                  {s.name}
                  <span className="ml-2 text-[11px] text-muted lg:text-xs">
                    {s.charityCode} · {s.staffCount} staff
                  </span>
                </span>
                <span className="numeral shrink-0 text-primary">
                  {count(s.signups)}
                  <span className="ml-1.5 text-[11px] font-normal text-muted lg:text-sm">
                    {percent(s.realizationRate, 0)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
