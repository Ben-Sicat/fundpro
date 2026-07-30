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

export default async function DonorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const donors = await getDonors(q)
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
        <StatTile label="Donors" value={count(donors.length)} />
        <StatTile label="Multiple pledges" value={count(multi.length)} />
        <StatTile
          label="Possible duplicates"
          value={count(duplicates.length)}
          hint={duplicates.length ? 'review before payroll' : 'none flagged'}
        />
        <StatTile
          label="Monthly value"
          value={money(donors.reduce((s, d) => s + d.totalMonthlyValue, 0))}
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
                        <Button size="sm">Not a duplicate</Button>
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

      <Card glass>
        <form className="flex items-end gap-3" action="/app/donors">
          <div className="max-w-md flex-1">
            <label htmlFor="q" className="mb-1.5 block text-xs font-medium text-secondary">
              Search donors
            </label>
            <Input id="q" name="q" defaultValue={q ?? ''} placeholder="Name or email…" />
          </div>
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
            {donors.slice(0, 60).map((d) => (
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
      </Card>
    </div>
  )
}
