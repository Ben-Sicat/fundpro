import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { auth, signIn } from '@/lib/auth/auth'
import { Button, Input, Label } from '@/components/ui'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { MOCK_USERS } from '@/lib/mock/users'

export const metadata: Metadata = { title: 'Sign in · FundPro' }

async function authenticate(formData: FormData) {
  'use server'
  try {
    await signIn('credentials', {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      redirectTo: '/app',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      // Generic message only: never reveal whether the account exists.
      redirect('/login?error=1')
    }
    throw error
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect('/app')
  const { error } = await searchParams

  return (
    <div className="app-canvas grid min-h-screen lg:grid-cols-2">
      {/* ---- Left: the pitch ---- */}
      <div className="relative hidden flex-col justify-between p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-8 place-items-center rounded-lg text-sm font-bold text-on-accent shadow-sm"
            style={{
              background: 'linear-gradient(135deg, var(--series-1), var(--series-3))',
            }}
            aria-hidden
          >
            ◈
          </span>
          <span className="font-semibold tracking-tight text-primary">FundPro</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-primary">
            Three spreadsheets,
            <br />
            consolidated automatically.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-secondary">
            Upload the daily bank Status Report, match it on SERIAL NO, and get
            the master copy back out in the exact legacy layout — plus payroll,
            invoicing and the realization rate that decides profitability.
          </p>

          <dl className="mt-8 grid grid-cols-3 gap-4">
            {[
              { k: '111', v: 'columns reproduced exactly' },
              { k: '7', v: 'lifecycle dates, all filterable' },
              { k: '0', v: 'manual VLOOKUPs' },
            ].map((s) => (
              <div key={s.k} className="border-l-2 border-accent/40 pl-3">
                <dt className="text-2xl font-semibold tracking-tight text-primary">
                  {s.k}
                </dt>
                <dd className="mt-0.5 text-[11px] leading-tight text-muted">
                  {s.v}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-[11px] text-muted">
          Donor data is covered by the PH Data Privacy Act (RA 10173).
        </p>
      </div>

      {/* ---- Right: the form ---- */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <span className="flex items-center gap-2.5">
              <span
                className="grid size-8 place-items-center rounded-lg text-sm font-bold text-on-accent"
                style={{
                  background:
                    'linear-gradient(135deg, var(--series-1), var(--series-3))',
                }}
                aria-hidden
              >
                ◈
              </span>
              <span className="font-semibold tracking-tight text-primary">
                FundPro
              </span>
            </span>
            <ThemeToggle />
          </div>

          <div className="glass glass-edge rounded-xl border border-line p-7 shadow-float">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-primary">
                  Sign in
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Donor Management Platform
                </p>
              </div>
              <span className="hidden lg:block">
                <ThemeToggle />
              </span>
            </div>

            {error ? (
              <p
                role="alert"
                className="mb-4 flex items-center gap-2 rounded-lg bg-critical-soft px-3 py-2 text-xs font-medium text-critical-text"
              >
                <span aria-hidden>⚠</span>
                Invalid email or password.
              </p>
            ) : null}

            <form action={authenticate} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  defaultValue="admin@fundpro.local"
                  placeholder="you@fundpro.local"
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  defaultValue="demo1234"
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" variant="primary" className="w-full">
                Sign in →
              </Button>
            </form>

            {/* Demo accounts are listed because this build is mock-driven and
                has no sign-up flow. Remove when real auth lands. */}
            <div className="mt-6 border-t border-line pt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Demo accounts · password demo1234
              </p>
              <ul className="space-y-1">
                {MOCK_USERS.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="tabular text-secondary">{u.email}</span>
                    <span className="text-muted">
                      {u.role.replace('_', ' ')}
                      {u.charityCode ? ` · ${u.charityCode}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
