import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth/auth'
import { permissionsFor } from '@/lib/auth/permissions'
import { Sidebar, type NavGroup } from '@/components/shell/sidebar'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { getExceptions } from '@/lib/data'
import { initials } from '@/lib/format'

/**
 * Protected shell. Middleware already gates /app; re-checking here is defence
 * in depth and gives every page below a guaranteed actor.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const actor = {
    id: session.user.id,
    role: session.user.role,
    charityId: session.user.charityId,
    permissions: session.user.permissions,
  }
  const perms = permissionsFor(actor)
  const isCharityViewer = actor.role === 'charity_viewer'

  const openExceptions = (await getExceptions()).filter((e) => !e.resolved).length

  // Nav is filtered by permission; the data layer enforces the same rules, so
  // hiding a link is convenience and never the security boundary.
  const groups: NavGroup[] = [
    {
      heading: null,
      items: [{ href: '/app', label: 'Overview', glyph: '◇' }],
    },
    {
      heading: 'Consolidated data',
      items: [
        { href: '/app/pledges', label: 'Applications', glyph: '▤' },
        ...(perms.includes('see_pii')
          ? [{ href: '/app/donors', label: 'Donors', glyph: '◎' }]
          : []),
        ...(!isCharityViewer
          ? [
              {
                href: '/app/uploads',
                label: 'Uploads',
                glyph: '↥',
                badge: openExceptions || undefined,
              },
            ]
          : []),
      ],
    },
    {
      heading: 'Output',
      items: [
        { href: '/app/exports', label: 'Exports', glyph: '↧' },
        ...(perms.includes('see_payroll')
          ? [{ href: '/app/payroll', label: 'Payroll', glyph: '₱' }]
          : []),
      ],
    },
    ...(actor.role === 'admin'
      ? [
          {
            heading: 'Admin',
            items: [{ href: '/app/settings', label: 'Settings', glyph: '⚙' }],
          },
        ]
      : []),
  ]

  return (
    <div className="app-canvas min-h-screen">
      {/* Topbar: glass, so the page washes through as it scrolls under. */}
      <header className="glass-strong sticky top-0 z-40 border-b border-line">
        <div className="flex h-14 items-center gap-4 px-4">
          <Link href="/app" className="flex items-center gap-2.5">
            <span
              className="grid size-7 place-items-center rounded-lg text-sm font-bold text-on-accent shadow-sm"
              style={{
                background:
                  'linear-gradient(135deg, var(--series-1), var(--series-3))',
              }}
              aria-hidden
            >
              ◈
            </span>
            <span className="text-sm font-semibold tracking-tight text-primary">
              FundPro
            </span>
          </Link>

          <span className="hidden text-xs text-muted sm:inline">
            Donor Management
          </span>

          <div className="flex-1" />

          {isCharityViewer ? (
            <span className="hidden rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-accent sm:inline">
              Scoped to {actor.charityId}
            </span>
          ) : null}

          <ThemeToggle />

          <div className="flex items-center gap-2.5 border-l border-line pl-3">
            <span
              className="grid size-7 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-secondary"
              aria-hidden
            >
              {initials(session.user.name ?? session.user.email)}
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-xs font-medium text-primary">
                {session.user.name}
              </span>
              <span className="block text-[10px] uppercase tracking-wide text-muted">
                {actor.role.replace('_', ' ')}
              </span>
            </span>
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/login' })
              }}
            >
              <button
                type="submit"
                className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="glass sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 border-r border-line lg:block">
          <Sidebar groups={groups} />
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[88rem]">{children}</div>
        </main>
      </div>
    </div>
  )
}
