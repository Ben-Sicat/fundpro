'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cx } from '@/components/ui'

export interface NavItem {
  href: string
  label: string
  /** Single glyph — keeps the bundle free of an icon dependency. */
  glyph: string
  badge?: number
}

export interface NavGroup {
  heading: string | null
  items: NavItem[]
}

export function Sidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Main"
      className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4"
    >
      {groups.map((group) => (
        <div key={group.heading ?? 'root'}>
          {group.heading ? (
            <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {group.heading}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              // Exact match for the root, prefix match for sections, so a
              // detail page keeps its parent highlighted.
              const active =
                item.href === '/app'
                  ? pathname === '/app'
                  : pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  <Link
                    prefetch={false}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'rounded-[var(--r-sm)] group relative flex items-center gap-2.5 px-2.5 py-2 text-sm transition-colors',
                      active
                        ? 'bg-accent-soft font-medium text-accent'
                        : 'text-secondary hover:bg-surface-2 hover:text-primary',
                    )}
                  >
                    {/* Active rail: a second, non-colour cue for selection. */}
                    <span
                      className={cx(
                        'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 transition-all',
                        active ? 'bg-accent opacity-100' : 'opacity-0',
                      )}
                      aria-hidden
                    />
                    <span className="w-4 shrink-0 text-center text-xs" aria-hidden>
                      {item.glyph}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="tabular shrink-0 rounded-md bg-critical-soft px-1.5 py-0.5 text-[10px] font-semibold text-critical-text">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
