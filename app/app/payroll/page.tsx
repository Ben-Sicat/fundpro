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
import { getFundraiserPerformance, getPayrollRuns } from '@/lib/data'
import { count, date, money, moneyCompact, percent } from '@/lib/format'

export const metadata: Metadata = { title: 'Payroll · FundPro' }

export default async function PayrollPage() {
  const [runs, performance] = await Promise.all([
    getPayrollRuns(),
    getFundraiserPerformance(),
  ])

  const draft = runs.find((r) => r.status === 'draft')
  const paid = runs.filter((r) => r.status === 'paid')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-primary">
            Payroll
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Semi-monthly cutoffs: 1st–15th pays in the ~15th run, 16th–EOM in the
            ~30th. Commissions are drafted, reviewed, then locked.
          </p>
        </div>
        <Button variant="primary" size="sm">
          Generate draft run
        </Button>
      </div>

      {/* Both business rules below are still unconfirmed by the client, so they
          are configuration rather than code. Saying so on the page keeps the
          assumption visible instead of buried. */}
      <div className="rounded-lg border border-line bg-warning-soft px-4 py-3">
        <p className="text-xs leading-relaxed text-warning-text">
          <strong>⚠ Two rules await client confirmation.</strong> Eligibility is
          set to <code>on_first_approval</code> and commission to a{' '}
          <code>×2.5</code> multiplier of pledge amount — both inferred from the
          payroll reference file, both editable in Settings. The sample files show
          multipliers of ×1, ×2.5, ×3 and ×4, and what drives the difference is
          not yet known.
        </p>
      </div>

      {draft ? (
        <Card glass>
          <CardHeader
            title="Current draft run"
            subtitle={`Cutoff ${date(draft.cutoffStart)} → ${date(draft.cutoffEnd)} · pays ${date(draft.runDate)}`}
            action={
              <span className="flex gap-2">
                <Button size="sm">Review lines</Button>
                <Button size="sm" variant="primary">
                  Approve &amp; lock
                </Button>
              </span>
            }
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label="Fundraisers" value={count(draft.fundraiserCount)} />
            <StatTile label="Pledges" value={count(draft.pledgeCount)} />
            <StatTile label="Gross" value={moneyCompact(draft.grossCommission)} />
            <StatTile
              label="Clawbacks"
              value={`−${moneyCompact(draft.clawbacks)}`}
              hint="cancelled or unrealized"
            />
            <StatTile accent label="Net payable" value={moneyCompact(draft.netPayable)} />
          </div>
        </Card>
      ) : null}

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
              note: `${percent(f.realizationRate, 0)} realized`,
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
        <SectionTitle>Run history</SectionTitle>
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Pay date</Th>
                <Th>Cutoff</Th>
                <Th align="right">Fundraisers</Th>
                <Th align="right">Pledges</Th>
                <Th align="right">Gross</Th>
                <Th align="right">Clawbacks</Th>
                <Th align="right">Net payable</Th>
                <Th>Status</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {[...(draft ? [draft] : []), ...paid].map((r) => (
                <Tr key={r.id}>
                  <Td className="tabular whitespace-nowrap font-medium text-primary">
                    {date(r.runDate)}
                  </Td>
                  <Td className="tabular whitespace-nowrap text-xs">
                    {date(r.cutoffStart)} → {date(r.cutoffEnd)}
                  </Td>
                  <Td align="right" className="tabular">
                    {r.fundraiserCount}
                  </Td>
                  <Td align="right" className="tabular">
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
