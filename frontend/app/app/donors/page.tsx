import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  SectionTitle,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { StatTile } from '@/components/charts/stat-tile'
import { getDonors } from '@/lib/data'
import { age, count, date, money } from '@/lib/format'

export const metadata: Metadata = { title: 'Donors · FundPro' }

const PAGE_SIZE = 40

export default async function DonorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const sp = await searchParams
  const { q } = sp
  const donors = await getDonors(q)

  // Previously this rendered donors.slice(0, 60) with no pagination and no
  // indicator: 245 of 305 people were silently invisible, so anyone searching
  // for a donor outside the first 60 would conclude they were not in the system.
  const page = Math.max(1, Number(sp.page ?? '1') || 1)
  const totalPages = Math.max(1, Math.ceil(donors.length / PAGE_SIZE))
  const shown = donors.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const duplicates = donors.filter((d) => d.duplicateOf)
  const multi = donors.filter((d) => d.pledgeCount > 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-primary">
          Donors
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
One card per person. If someone signed up twice, we flag it so nobody gets paid twice.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Donors" value={count(donors.length)} hint="unique people" />
        <StatTile label="Give more than once" value={count(multi.length)} hint="hold several pledges" />
        <StatTile
          label="Possible duplicates"
          value={count(duplicates.length)}
          hint={duplicates.length ? 'review before payroll' : 'none flagged'}
        />
        <StatTile
          label="Monthly giving"
          value={money(donors.reduce((s, d) => s + d.totalMonthlyValue, 0))}
          hint="everyone combined"
        />
      </div>

      {duplicates.length > 0 ? (
        <div>
          <SectionTitle hint="matched on email, mobile or national id">
            Duplicate candidates
          </SectionTitle>
          <Card>
            <CardHeader
              title="Needs a human decision"
              subtitle="We flag these but never merge them for you — that call is yours."
            />
            <Table>
              <thead>
                <tr>
                  <Th>Donor</Th>
                  <Th>Signal</Th>
                  <Th>Email</Th>
                  <Th>Mobile</Th>
                  <Th align="right">Pledges</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map((d) => (
                  <Tr key={d.id}>
                    <Td className="font-medium text-primary">{d.fullName}</Td>
                    <Td>
                      <Badge tone="warning" dot>
                        Same {d.duplicateSignal}
                      </Badge>
                    </Td>
                    <Td className="text-xs">{d.email}</Td>
                    <Td className="tabular text-xs">{d.mobile}</Td>
                    <Td align="right" className="tabular">
                      {d.pledgeCount}
                    </Td>
                    <Td align="right">
                      <span className="flex justify-end gap-1.5">
                        <Button size="sm" disabled title="Coming soon">Not a duplicate</Button>
                        <Button size="sm" variant="primary">
                          Review
                        </Button>
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      ) : null}

      <Card>
        <form className="flex items-end gap-3" action="/app/donors">
          <div className="max-w-md flex-1">
            <label htmlFor="q" className="mb-1.5 block text-xs font-medium text-secondary">
              Search donors
            </label>
            <Input id="q" name="q" defaultValue={q ?? ''} placeholder="Name or email…" />
          </div>
          <input type="hidden" name="page" value="1" />
          <Button type="submit" variant="primary">
            Search
          </Button>
          {q ? (
            <Link href="/app/donors">
              <Button variant="ghost">Clear</Button>
            </Link>
          ) : null}
        </form>
      </Card>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Donor</Th>
              <Th>Email</Th>
              <Th>Mobile</Th>
              <Th align="right">Age</Th>
              <Th>City</Th>
              <Th align="right">Pledges</Th>
              <Th align="right">Monthly</Th>
              <Th>First sign-up</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <Tr key={d.id}>
                <Td className="font-medium text-primary">
                  <span className="flex items-center gap-2">
                    {d.fullName}
                    {d.duplicateOf ? (
                      <span title="Possible duplicate" className="text-warning-text">
                        ⚠
                      </span>
                    ) : null}
                  </span>
                </Td>
                <Td className="text-xs">{d.email}</Td>
                <Td className="tabular text-xs">{d.mobile}</Td>
                <Td align="right" className="tabular">
                  {age(d.dob)}
                </Td>
                <Td>{d.city}</Td>
                <Td align="right" className="tabular">
                  {d.pledgeCount}
                </Td>
                <Td align="right" className="tabular text-primary">
                  {money(d.totalMonthlyValue, d.currency)}
                </Td>
                <Td className="whitespace-nowrap">{date(d.firstSignup)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>
            Showing {count((page - 1) * PAGE_SIZE + 1)}–
            {count(Math.min(page * PAGE_SIZE, donors.length))} of{' '}
            {count(donors.length)}
          </span>
          <span className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={{ pathname: '/app/donors', query: { ...sp, page: page - 1 } }}>
                <Button size="sm">← Prev</Button>
              </Link>
            ) : null}
            <span className="tabular">
              Page {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={{ pathname: '/app/donors', query: { ...sp, page: page + 1 } }}>
                <Button size="sm">Next →</Button>
              </Link>
            ) : null}
          </span>
        </div>
      </Card>
    </div>
  )
}
