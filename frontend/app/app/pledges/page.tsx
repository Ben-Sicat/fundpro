import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { StatTile } from '@/components/charts/stat-tile'
import {
  DATE_BASIS_LABELS,
  getCharities,
  getFundraiserNames,
  getKpis,
  getPledges,
  type DateBasis,
  type PledgeFilters,
} from '@/lib/data'
import { count, date, money, moneyCompact, percent } from '@/lib/format'
import { StatusBadge } from '@/components/status-badge'

export const metadata: Metadata = { title: 'Applications · FundPro' }

const PAGE_SIZE = 40

export default async function PledgesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp = await searchParams
  const filters: PledgeFilters = {
    q: sp.q,
    charityCode: sp.charity,
    status: sp.status as PledgeFilters['status'],
    fundraiserName: sp.fundraiser,
    basis: (sp.basis as DateBasis) ?? 'signupDate',
    from: sp.from,
    to: sp.to,
  }

  const [rows, kpis, charities, fundraisers] = await Promise.all([
    getPledges(filters),
    getKpis(filters),
    getCharities(),
    getFundraiserNames(),
  ])

  const page = Math.max(1, Number(sp.page ?? '1') || 1)
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-primary">
            Applications
          </h1>
          <p className="mt-1 text-sm text-muted">
Every donor sign-up, with the latest word from the bank.
          </p>
        </div>
        <Link href="/app/exports">
          <Button variant="primary" size="sm">
            ↧ Export this view
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile label="Applications" value={count(rows.length)} hint="match your filters" />
        <StatTile
          accent
          label="Donors that stick"
          value={percent(kpis.realizationRate)}
          hint="of those sent to the bank"
        />
        <StatTile label="Monthly giving" value={moneyCompact(kpis.pledgedValue)} unit="/mo" hint="all shown donors combined" />
        <StatTile label="Phone-verified" value={percent(kpis.verifiedPct, 0)} hint="confirmed real by a call" />
      </div>

      {/* Filters in one row above the table. GET form so every filtered view is
          a shareable URL and survives a refresh. */}
      <Card>
        <form className="flex flex-wrap items-end gap-3" action="/app/pledges">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="q" className="mb-1.5 block text-xs font-medium text-secondary">
              Search
            </label>
            <Input
              id="q"
              name="q"
              defaultValue={sp.q ?? ''}
              placeholder="Serial no, donor, fundraiser, email…"
            />
          </div>

          <div>
            <label htmlFor="charity" className="mb-1.5 block text-xs font-medium text-secondary">
              Client
            </label>
            <Select id="charity" name="charity" defaultValue={sp.charity ?? ''}>
              <option value="">All</option>
              {charities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="status" className="mb-1.5 block text-xs font-medium text-secondary">
              Status
            </label>
            <Select id="status" name="status" defaultValue={sp.status ?? ''}>
              <option value="">Any</option>
              <option value="realized">Started paying</option>
              <option value="retrying">Payment retrying</option>
              <option value="failed">Failed for good</option>
              <option value="cancelled">Cancelled</option>
              <option value="pending">Not yet sent to bank</option>
            </Select>
          </div>

          <div>
            <label htmlFor="fundraiser" className="mb-1.5 block text-xs font-medium text-secondary">
              Fundraiser
            </label>
            <Select id="fundraiser" name="fundraiser" defaultValue={sp.fundraiser ?? ''}>
              <option value="">All</option>
              {fundraisers.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>

          {/* The date-basis selector: "sales in July" means different things on
              a sign-up vs a debit basis. */}
          <div>
            <label htmlFor="basis" className="mb-1.5 block text-xs font-medium text-secondary">
              Dates based on
            </label>
            <Select id="basis" name="basis" defaultValue={filters.basis}>
              {Object.entries(DATE_BASIS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="from" className="mb-1.5 block text-xs font-medium text-secondary">
              From
            </label>
            <Input id="from" name="from" type="date" defaultValue={sp.from ?? ''} className="w-[9.5rem]" />
          </div>
          <div>
            <label htmlFor="to" className="mb-1.5 block text-xs font-medium text-secondary">
              To
            </label>
            <Input id="to" name="to" type="date" defaultValue={sp.to ?? ''} className="w-[9.5rem]" />
          </div>

          <Button type="submit" variant="primary">
            Apply
          </Button>
          <Link href="/app/pledges">
            <Button variant="ghost">Reset</Button>
          </Link>
        </form>
      </Card>

      <Card>
        {shown.length === 0 ? (
          <EmptyState
            title="Nothing matches that"
            description="Try widening the date range or clearing a filter."
            action={
              <Link href="/app/pledges">
                <Button size="sm">Reset filters</Button>
              </Link>
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Serial no</Th>
                  <Th>Donor</Th>
                  <Th hide="lg">Charity</Th>
                  <Th hide="md">Fundraiser</Th>
                  <Th align="right">Amount</Th>
                  <Th hide="xl">How often</Th>
                  <Th hide="sm">Signed up</Th>
                  <Th hide="lg">First paid</Th>
                  <Th>Status</Th>
                  <Th align="center" hide="xl">Verified</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <Tr key={p.serialNo}>
                    <Td>
                      <Link
                        href={`/app/pledges/${p.serialNo}`}
                        className="tabular font-medium text-accent hover:underline"
                      >
                        {p.serialNo}
                      </Link>
                    </Td>
                    <Td className="text-primary">{p.donorName}</Td>
                    <Td hide="lg">
                      <Badge tone="neutral">{p.charityCode}</Badge>
                    </Td>
                    <Td hide="md">{p.fundraiserName}</Td>
                    <Td align="right" className="tabular text-primary">
                      {money(p.amount, p.currency)}
                    </Td>
                    <Td hide="xl" className="text-xs">{p.frequency}</Td>
                    <Td hide="sm" className="whitespace-nowrap">{date(p.signupDate)}</Td>
                    <Td hide="lg" className="whitespace-nowrap">{date(p.debitDate)}</Td>
                    <Td>
                      <StatusBadge pledge={p} />
                    </Td>
                    <Td align="center" hide="xl">
                      {p.verified ? (
                        <span className="text-good-text" title="Phoned and confirmed">
                          ✓
                        </span>
                      ) : (
                        <span className="text-muted" title="Not yet verified">
                          —
                        </span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>

            <div className="mt-4 flex items-center justify-between text-xs text-muted">
              <span>
                Showing {count((page - 1) * PAGE_SIZE + 1)}–
                {count(Math.min(page * PAGE_SIZE, rows.length))} of{' '}
                {count(rows.length)}
              </span>
              <span className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={{ pathname: '/app/pledges', query: { ...sp, page: page - 1 } }}
                  >
                    <Button size="sm">← Prev</Button>
                  </Link>
                ) : null}
                <span className="tabular">
                  Page {page} / {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={{ pathname: '/app/pledges', query: { ...sp, page: page + 1 } }}
                  >
                    <Button size="sm">Next →</Button>
                  </Link>
                ) : null}
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
