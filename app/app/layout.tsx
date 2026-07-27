import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth/auth'
import { permissionsFor } from '@/lib/auth/permissions'

/**
 * Protected shell. Middleware already gates /app, but this re-checks the
 * session server-side: defence in depth, and it gives every page below a
 * guaranteed actor.
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

  // Nav is filtered by permission; the service layer enforces the same rules
  // again, so hiding a link is convenience and never the security boundary.
  const nav = [
    { href: '/app/dashboard', label: 'Dashboard', show: true },
    { href: '/app/pledges', label: 'Pledges', show: true },
    { href: '/app/donors', label: 'Donors', show: perms.includes('see_pii') },
    { href: '/app/imports', label: 'Imports', show: perms.includes('edit_reference') },
    { href: '/app/payroll', label: 'Payroll', show: perms.includes('see_payroll') },
    { href: '/app/exports', label: 'Exports', show: perms.includes('run_exports') },
    { href: '/app/settings', label: 'Settings', show: actor.role === 'admin' },
  ].filter((item) => item.show)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/app" className="font-semibold text-slate-900">
              FundPro
            </Link>
            <nav className="flex gap-4 text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-slate-600 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              {session.user.email}
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {actor.role}
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
                className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  )
}
