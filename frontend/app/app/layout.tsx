import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth/auth'
import { permissionsFor } from '@/lib/auth/permissions'
import { Sidebar, type NavGroup } from '@/components/shell/sidebar'
import { MobileNav } from '@/components/shell/mobile-nav'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { GridTracer } from '@/components/grid-tracer'
import { AutoRefresh } from '@/components/shell/auto-refresh'
import { ExceptionBadge } from '@/components/shell/exception-badge'
import { initials } from '@/lib/format'

/**
 * Never prerender, never cache, for any page under /app.
 *
 * Reading the session already forces dynamic rendering, so this is belt and
 * braces — but it is the kind of thing a later refactor silently removes. Every
 * figure here comes from a live import; a statically prerendered or
 * revalidate-cached page would show numbers from build time and give no clue it
 * was doing so.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

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
        { href: '/app/team', label: 'Team', glyph: '⧉' },
        ...(perms.includes('see_pii')
          ? [{ href: '/app/donors', label: 'Donors', glyph: '◎' }]
          : []),
        ...(!isCharityViewer
          ? [
              {
                href: '/app/uploads',
                label: 'Uploads',
                glyph: '↥',
                // Streamed, so the shell paints without waiting on it.
                badge: (
                  <Suspense fallback={null}>
                    <ExceptionBadge />
                  </Suspense>
                ),
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
      <GridTracer />
      {/* Topbar: glass, so the page washes through as it scrolls under. */}
      <header className="glass-strong sticky top-0 z-40 border-b border-line">
        <div className="flex h-14 items-center gap-2 px-3 sm:gap-4 sm:px-4">
          <Link href="/app" className="flex shrink-0 items-center gap-2.5">
            <span
              className="rounded-[var(--r-sm)] grid size-8 place-items-center text-sm font-bold text-on-accent shadow-sm"
              style={{
                background:
                  'linear-gradient(135deg, var(--accent), var(--series-3))',
              }}
              aria-hidden
            >
              ◈
            </span>
            <span className="hud text-sm text-primary">FundPro</span>
          </Link>

          <span className="hidden text-xs text-muted xl:inline">
            Donor Management
          </span>

          <div className="flex-1" />

          {isCharityViewer ? (
            <span className="rounded-[var(--r-sm)] hidden bg-accent-soft px-2 py-1 text-xs font-medium text-accent sm:inline">
              Scoped to {actor.charityId}
            </span>
          ) : null}

          <AutoRefresh />

          <ThemeToggle />

          <div className="flex items-center gap-2.5 border-l border-line pl-2 sm:pl-3">
            <span
              className="rounded-[var(--r-sm)] grid size-8 place-items-center bg-surface-3 text-[11px] font-semibold text-secondary"
              aria-hidden
            >
              {initials(session.user.name ?? session.user.email)}
            </span>
            {/* Identity text is the first thing to go on a narrow screen; the
                avatar and sign-out stay. */}
            <span className="hidden leading-tight md:block">
              <span className="block text-xs font-medium text-primary">
                {session.user.name}
              </span>
              <span className="hud block text-[10px] text-muted">
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
                title="Sign out"
                className="rounded-[var(--r-sm)] flex min-h-9 items-center border border-line-strong bg-surface-2 px-2.5 text-xs text-secondary transition-colors hover:bg-surface-3 hover:text-primary"
              >
                <span className="hidden sm:inline">Sign out</span>
                <span className="sm:hidden" aria-hidden>
                  ⏻
                </span>
                <span className="sr-only sm:hidden">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="glass-strong sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 border-r border-line lg:block">
          <Sidebar groups={groups} />
        </aside>

        {/* pb-20 on mobile clears the fixed bottom nav so the last card is not
            hidden behind it. */}
        <main className="min-w-0 flex-1 px-3 pb-24 pt-5 sm:px-6 sm:pb-8 sm:pt-6 lg:px-8">
          <div className="mx-auto max-w-[92rem]">{children}</div>
        </main>
      </div>

      <MobileNav groups={groups} />
    </div>
  )
}
