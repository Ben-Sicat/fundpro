import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Card, CardHeader } from '@/components/ui'
import { FundraiserForm } from '@/components/team/fundraiser-form'
import { updateFundraiserAction } from '../actions'
import { auth } from '@/lib/auth/auth'
import { permissionsFor } from '@/lib/auth/permissions'
import { getAllLeaderNames, getFundraiser } from '@/lib/data'
import { count, date, money, percent } from '@/lib/format'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  return { title: `${code} · Team · FundPro` }
}

export default async function EditFundraiserPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const [fundraiser, leaders, session] = await Promise.all([
    getFundraiser(code),
    getAllLeaderNames(),
    auth(),
  ])
  if (!fundraiser) notFound()

  const perms = permissionsFor({
    id: session!.user.id,
    role: session!.user.role,
    charityId: session!.user.charityId,
    permissions: session!.user.permissions,
  })
  const canEdit = perms.includes('edit_reference')

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/team" className="text-xs text-muted hover:text-primary">
          ← Team
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-primary">
            {fundraiser.name}
          </h1>
          <span className="tabular text-sm text-muted">{fundraiser.code}</span>
          {fundraiser.active ? (
            <Badge tone="good" dot>
              Active
            </Badge>
          ) : (
            <Badge tone="neutral" dot>
              Retired
            </Badge>
          )}
        </div>
      </div>

      {/* Their numbers, so a status change is made with the record in view
          rather than from memory. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sign-ups" value={count(fundraiser.signups)} />
        <Stat label="Started paying" value={count(fundraiser.realized)} />
        <Stat label="Stick rate" value={percent(fundraiser.realizationRate, 0)} />
        <Stat label="Monthly value" value={money(fundraiser.pledgedValue)} />
      </div>

      <Card>
        <CardHeader
          title="Details"
          subtitle="Changing the name carries their entire sign-up history across with them."
        />
        {canEdit ? (
          <FundraiserForm
            action={updateFundraiserAction.bind(null, fundraiser.code)}
            leaders={leaders}
            submitLabel="Save changes"
            initial={{
              name: fundraiser.name,
              code: fundraiser.code,
              leaderNames: fundraiser.leaderNames,
              active: fundraiser.active,
              startDate: fundraiser.startDate,
              endDate: fundraiser.endDate,
            }}
          />
        ) : (
          <dl className="space-y-2.5 text-sm">
            <Row label="Reports to">{fundraiser.leaderNames.join(', ')}</Row>
            <Row label="Started">{date(fundraiser.startDate)}</Row>
            <Row label="Until">
              {fundraiser.endDate ? date(fundraiser.endDate) : 'present'}
            </Row>
            <p className="pt-2 text-xs text-muted">
              Your role can view the roster but not change it.
            </p>
          </dl>
        )}
      </Card>

      {fundraiser.sites.length > 0 ? (
        <Card>
          <CardHeader title="Sites worked" subtitle="Where their sign-ups came from" />
          <ul className="flex flex-wrap gap-2">
            {fundraiser.sites.map((s) => (
              <li key={s}>
                <Badge tone="neutral">{s}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="tabular mt-0.5 text-lg font-semibold text-primary">{value}</p>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-secondary">{children}</dd>
    </div>
  )
}
