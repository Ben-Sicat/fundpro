import type { Metadata } from 'next'
import Link from 'next/link'
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
import { FilterBar } from '@/components/filter-bar'
import { filtersFromParams } from '@/lib/filters'
import {
  getCharities,
  getFundraiserRecords,
  getLeaderNames,
  getLeaderRecords,
  getSiteNames,
} from '@/lib/data'
import { count, money, moneyCompact, percent } from '@/lib/format'

export const metadata: Metadata = { title: 'Team · FundPro' }

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp = await searchParams
  const filters = filtersFromParams(sp)
  const view = sp.view === 'leaders' ? 'leaders' : 'fundraisers'

  const [fundraisers, leaders, charities, leaderNames, siteNames] = await Promise.all([
    getFundraiserRecords(filters),
    getLeaderRecords(filters),
    getCharities(),
    getLeaderNames(),
    getSiteNames(),
  ])

  const active = fundraisers.filter((f) => f.active)
  const totalSignups = fundraisers.reduce((s, f) => s + f.signups, 0)
  const totalRealized = fundraisers.reduce((s, f) => s + f.realized, 0)
  const shared = fundraisers.filter((f) => f.leaderNames.length > 1)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-primary">Team</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Everyone signing up donors, and the leaders they report to.
          </p>
        </div>

        {/* Roll-up switch, per the note that dashboards should total by leader
            as well as by fundraiser. */}
        <div className="flex gap-1.5">
          <Link href={{ pathname: '/app/team', query: { ...sp, view: 'fundraisers' } }}>
            <Button size="sm" variant={view === 'fundraisers' ? 'primary' : 'secondary'}>
              By fundraiser
            </Button>
          </Link>
          <Link href={{ pathname: '/app/team', query: { ...sp, view: 'leaders' } }}>
            <Button size="sm" variant={view === 'leaders' ? 'primary' : 'secondary'}>
              By leader
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile label="Fundraisers" value={count(active.length)} hint={`${fundraisers.length - active.length} inactive`} />
        <StatTile label="Leaders" value={count(leaders.length)} />
        <StatTile label="Sign-ups" value={count(totalSignups)} />
        <StatTile
          accent
          label="Donors that stick"
          value={percent(totalSignups ? totalRealized / totalSignups : 0)}
        />
      </div>

      <FilterBar
        action="/app/team"
        current={sp}
        charities={charities}
        leaders={leaderNames}
        sites={siteNames}
      />

      {view === 'leaders' ? (
        <>
          <div>
            <SectionTitle hint="a fundraiser under two leaders counts toward both, so these do not sum to the company total">
              By leader
            </SectionTitle>
            <Card feature>
              <CardHeader
                title="Leader roll-up"
                subtitle="Team totals for each leader"
              />
              <Table>
                <thead>
                  <tr>
                    <Th>Leader</Th>
                    <Th align="right">Team</Th>
                    <Th align="right">Sign-ups</Th>
                    <Th align="right">Started paying</Th>
                    <Th align="right">Stick rate</Th>
                    <Th align="right">Monthly value</Th>
                    <Th hide="lg">Members</Th>
                  </tr>
                </thead>
                <tbody>
                  {leaders.map((l) => (
                    <Tr key={l.name}>
                      <Td className="font-semibold text-primary">{l.name}</Td>
                      <Td align="right" className="tabular">
                        {l.teamSize}
                      </Td>
                      <Td align="right" className="tabular">
                        {count(l.signups)}
                      </Td>
                      <Td align="right" className="tabular">
                        {count(l.realized)}
                      </Td>
                      <Td align="right" className="tabular text-primary">
                        {percent(l.realizationRate, 0)}
                      </Td>
                      <Td align="right" className="tabular">
                        {money(l.pledgedValue)}
                      </Td>
                      <Td hide="lg" className="text-[11px] text-muted">
                        {l.fundraiserNames.join(', ')}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>

          <Card>
            <CardHeader title="Donors won per leader" subtitle="Ranked by donors who started paying" />
            <BarList
              data={leaders.map((l) => ({
                label: l.name,
                sublabel: `${l.teamSize} in team`,
                value: l.realized,
                note: percent(l.realizationRate, 0),
              }))}
              format="count"
            />
          </Card>
        </>
      ) : (
        <div>
          <SectionTitle>Fundraisers</SectionTitle>
          <Card feature>
            <CardHeader
              title="Everyone on the floor"
              subtitle="Ranked by donors who actually started paying"
            />
            <Table>
              <thead>
                <tr>
                  <Th>Fundraiser</Th>
                  <Th hide="lg">Code</Th>
                  <Th hide="md">Reports to</Th>
                  <Th align="right">Sign-ups</Th>
                  <Th align="right">Started paying</Th>
                  <Th align="right">Stick rate</Th>
                  <Th align="right" hide="lg">Avg gift</Th>
                  <Th align="right" hide="sm">Monthly value</Th>
                  <Th align="center" hide="xl">Status</Th>
                </tr>
              </thead>
              <tbody>
                {fundraisers.map((f) => (
                  <Tr key={f.name}>
                    <Td className="font-semibold text-primary">{f.name}</Td>
                    <Td hide="lg" className="tabular text-xs">
                      {f.code}
                    </Td>
                    <Td hide="md">
                      {/* Multiple leaders shown as separate chips — the notes
                          call out that a fundraiser can have more than one. */}
                      <span className="flex flex-wrap gap-1">
                        {f.leaderNames.map((l) => (
                          <Badge key={l} tone={f.leaderNames.length > 1 ? 'accent' : 'neutral'}>
                            {l}
                          </Badge>
                        ))}
                      </span>
                    </Td>
                    <Td align="right" className="tabular">
                      {count(f.signups)}
                    </Td>
                    <Td align="right" className="tabular">
                      {count(f.realized)}
                    </Td>
                    <Td align="right" className="tabular text-primary">
                      {percent(f.realizationRate, 0)}
                    </Td>
                    <Td align="right" hide="lg" className="tabular">
                      {moneyCompact(f.avgPledge)}
                    </Td>
                    <Td align="right" hide="sm" className="tabular">
                      {money(f.pledgedValue)}
                    </Td>
                    <Td align="center" hide="xl">
                      {f.active ? (
                        <Badge tone="good" dot>
                          Active
                        </Badge>
                      ) : (
                        <Badge tone="neutral" dot>
                          Inactive
                        </Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>

            {shared.length > 0 ? (
              <p className="mt-3 text-[11px] text-muted">
                {shared.length}{' '}
                {shared.length === 1 ? 'person reports' : 'people report'} to more
                than one leader, so leader totals overlap by design.
              </p>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  )
}
