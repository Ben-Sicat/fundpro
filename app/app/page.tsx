import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { auth } from '@/lib/auth/auth'

export const metadata = { title: 'FundPro' }
export const dynamic = 'force-dynamic'

/**
 * Phase 0 landing page: proves auth, the DB connection and the schema are all
 * wired together. Replaced by the real dashboard in Phase 4.
 */
export default async function AppHome() {
  const session = await auth()

  let dbStatus = 'ok'
  let counts: { pledges: number; donors: number; statusCodes: number } = {
    pledges: 0,
    donors: 0,
    statusCodes: 0,
  }

  try {
    const [row] = await db.execute<{
      pledges: string
      donors: string
      status_codes: string
    }>(sql`
      select
        (select count(*) from pledges)      as pledges,
        (select count(*) from donors)       as donors,
        (select count(*) from status_codes) as status_codes
    `)
    counts = {
      pledges: Number(row?.pledges ?? 0),
      donors: Number(row?.donors ?? 0),
      statusCodes: Number(row?.status_codes ?? 0),
    }
  } catch {
    dbStatus = 'unreachable'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome{session?.user?.name ? `, ${session.user.name}` : ''}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Phase 0 + 1 scaffold. Schema is live; features land in later phases.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Database', value: dbStatus },
          { label: 'Pledges', value: counts.pledges.toLocaleString() },
          { label: 'Donors', value: counts.donors.toLocaleString() },
          { label: 'Status codes', value: counts.statusCodes.toLocaleString() },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              {stat.label}
            </dt>
            <dd className="mt-1 text-lg font-semibold text-slate-900">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
