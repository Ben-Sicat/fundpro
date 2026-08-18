import type { Metadata } from 'next'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  SectionTitle,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { StatTile } from '@/components/charts/stat-tile'
import { BarList } from '@/components/charts/bar-list'
import {
  getDerivedPayrollRun,
  getFundraiserPerformance,
  getPayrollRuns,
} from '@/lib/data'
import { count, date, money, percent } from '@/lib/format'

export const metadata: Metadata = { title: 'Payroll · FundPro' }

export default async function PayrollPage() {
  const [runs, performance, derived] = await Promise.all([
    getPayrollRuns(),
    getFundraiserPerformance(),
    // Computed by lib/services/payroll.ts from the pledge data, so what is on
    // screen comes from the same tested rules a real run would use.
    getDerivedPayrollRun(),
  ])

  const paid = runs.filter((r) => r.status === 'paid')
  const unconfirmed = derived.clawbacks.filter((c) => !c.confirmed)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-primary">
            Payroll
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Paid twice a month. Everything is worked out for you, then you
            review and approve it.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled
          title="The draft below is already live — approval is not built yet"
        >
          Generate draft run
        </Button>
      </div>

      {/* The multiplier is genuinely unknown, so the page says so rather than
          presenting a derived figure as settled. */}
      <div className="rounded-lg border border-line bg-warning-soft px-4 py-3">
        <p className="text-xs leading-relaxed text-warning-text">
          <strong>⚠ One number to confirm.</strong> Commission is set to ×3 of
          the pledge amount — the most common value in your own payroll sheets.
          They also show ×0.5, ×2, ×2.5 and ×4, and we could not work out what
          decides which. Confirm that with the team and it is a one-field change
          in Settings.
        </p>
      </div>

      {/* ---- Draft run, derived ---- */}
      <Card lead>
        <CardHeader
          title="Draft run"
          subtitle={`${derived.cutoff.label} · pays ${date(derived.cutoff.runDate)}`}
          action={
            <span className="flex gap-2">
              <Button size="sm" disabled title="Coming soon">Review lines</Button>
              <Button size="sm" variant="primary">
                Approve &amp; lock
              </Button>
            </span>
          }
        />

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <StatTile label="Fundraisers" value={count(new Set(derived.lines.map((l) => l.fundraiserName)).size)} hint="earning this cutoff" />
          <StatTile label="Donors being paid for" value={count(derived.lines.length)} hint="billed in this period" />
          <StatTile
            label="Clawbacks to review"
            value={count(unconfirmed.length)}
            hint={unconfirmed.length ? 'money to reclaim' : 'nothing to reclaim'}
          />
          <StatTile
            gold
            label="Total to pay (PHP)"
            value={derived.nets
              .filter((n) => n.currency === 'PHP')
              .reduce((s, n) => s + n.net, 0)
              .toLocaleString('en-PH', { maximumFractionDigits: 0 })}
            unit="₱"
            hint="ringgit listed per person below"
          />
        </div>

        {/* Per fundraiser AND per currency. The agency runs in the Philippines
            and Malaysia, and adding pesos to ringgit would produce a
            plausible-looking figure that means nothing. */}
        <div className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th>Fundraiser</Th>
                <Th>Currency</Th>
                <Th align="right">Donors</Th>
                <Th align="right">Earned</Th>
                <Th align="right">Reclaimed</Th>
                <Th align="right">Take home</Th>
              </tr>
            </thead>
            <tbody>
              {derived.nets.map((n) => (
                <Tr key={`${n.fundraiserName}-${n.currency}`}>
                  <Td className="font-medium text-primary">{n.fundraiserName}</Td>
                  <Td>
                    <Badge tone={n.currency === 'PHP' ? 'neutral' : 'accent'}>
                      {n.currency}
                    </Badge>
                  </Td>
                  <Td align="right" className="tabular">
                    {n.pledgeCount}
                  </Td>
                  <Td align="right" className="tabular">
                    {money(n.gross, n.currency)}
                  </Td>
                  <Td align="right" className="tabular text-critical-text">
                    {n.clawbacks > 0 ? `−${money(n.clawbacks, n.currency)}` : '—'}
                  </Td>
                  <Td align="right" className="tabular font-semibold text-primary">
                    {money(n.net, n.currency)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Commission by fundraiser"
            // Scope is spelled out: this is all periods, while the draft run
            // above covers one cutoff, so the two totals are not meant to tie.
            subtitle="All periods · gross, before clawbacks"
          />
          <BarList
            data={performance.slice(0, 8).map((f) => ({
              label: f.name,
              sublabel: f.leaderName,
              value: Math.round(f.grossCommission),
              note: `${percent(f.realizationRate, 0)} stick`,
            }))}
            format="moneyCompact"
          />
        </Card>

        <Card>
          <CardHeader
            title="Clawback exposure"
            subtitle="All periods · commission already paid on pledges that later failed or cancelled"
          />
          {performance.some((f) => f.clawbacks > 0) ? (
            <BarList
              data={performance
                .filter((f) => f.clawbacks > 0)
                .sort((a, b) => b.clawbacks - a.clawbacks)
                .slice(0, 8)
                .map((f) => ({
                  label: f.name,
                  sublabel: f.leaderName,
                  value: Math.round(f.clawbacks),
                  tone: 'series-2' as const,
                }))}
              format="moneyCompact"
            />
          ) : (
            <p className="py-8 text-center text-xs text-muted">
              No clawback exposure in this period.
            </p>
          )}
        </Card>
      </div>

      <div>
        <SectionTitle>Past pay runs</SectionTitle>
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Pay date</Th>
                <Th hide="lg">Period</Th>
                <Th align="right" hide="md">Fundraisers</Th>
                <Th align="right" hide="sm">Donors</Th>
                <Th align="right">Gross</Th>
                <Th align="right">Clawbacks</Th>
                <Th align="right">Take home</Th>
                <Th>Status</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {paid.map((r) => (
                <Tr key={r.id}>
                  <Td className="tabular whitespace-nowrap font-medium text-primary">
                    {date(r.runDate)}
                  </Td>
                  <Td hide="lg" className="tabular whitespace-nowrap text-xs">
                    {date(r.cutoffStart)} → {date(r.cutoffEnd)}
                  </Td>
                  <Td align="right" hide="md" className="tabular">
                    {r.fundraiserCount}
                  </Td>
                  <Td align="right" hide="sm" className="tabular">
                    {count(r.pledgeCount)}
                  </Td>
                  <Td align="right" className="tabular">
                    {money(r.grossCommission)}
                  </Td>
                  {/* nowrap: without it the minus sign wraps onto its own
                      line and the figure reads as two separate values. */}
                  <Td
                    align="right"
                    className="tabular whitespace-nowrap text-critical-text"
                  >
                    −{money(r.clawbacks)}
                  </Td>
                  <Td align="right" className="tabular font-semibold text-primary">
                    {money(r.netPayable)}
                  </Td>
                  <Td>
                    {r.status === 'paid' ? (
                      <Badge tone="good" dot>
                        Paid
                      </Badge>
                    ) : r.status === 'approved' ? (
                      <Badge tone="accent" dot>
                        Approved
                      </Badge>
                    ) : (
                      <Badge tone="warning" dot>
                        Draft
                      </Badge>
                    )}
                  </Td>
                  <Td align="right">
                    <Button size="sm">↧ C1</Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  )
}
