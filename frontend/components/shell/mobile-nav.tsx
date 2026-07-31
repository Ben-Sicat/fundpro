'use client'

/**
 * Mobile navigation.
 *
 * The desktop sidebar is hidden below `lg`, which previously left phones with
 * no navigation at all. Two pieces cover it:
 *
 *  - a bottom bar with the four highest-traffic destinations, thumb-reachable
 *  - a "More" sheet for everything else
 *
 * The bar sits above the iOS home indicator via env(safe-area-inset-bottom),
 * otherwise the last row of buttons is partly unreachable on a notched phone.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cx } from '@/components/ui'
import type { NavGroup } from './sidebar'

export function MobileNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)

  const items = groups.flatMap((g) => g.items)
  const primary = items.slice(0, 4)
  const rest = items.slice(4)

  // Close the sheet on navigation, otherwise it stays open over the new page.
  useEffect(() => {
    setSheetOpen(false)
  }, [pathname])

  // Prevent the page behind the sheet from scrolling under it.
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [sheetOpen])

  const isActive = (href: string) =>
    href === '/app' ? pathname === '/app' : pathname.startsWith(href)

  return (
    <>
      {/* ---- Bottom bar ---- */}
      <nav
        aria-label="Main"
        className="glass-strong fixed inset-x-0 bottom-0 z-50 border-t border-line lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="flex items-stretch">
          {primary.map((item) => {
            const active = isActive(item.href)
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'relative flex h-14 flex-col items-center justify-center gap-0.5',
                    active ? 'text-accent' : 'text-muted',
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-3 top-0 h-0.5 rounded-b bg-accent"
                    />
                  ) : null}
                  <span className="relative text-base leading-none" aria-hidden>
                    {item.glyph}
                    {item.badge ? (
                      <span className="tabular absolute -right-2.5 -top-1.5 rounded-full bg-critical px-1 text-[9px] font-bold text-white">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="hud max-w-full truncate px-1 text-[10px]">
                    {item.label}
                  </span>
                </Link>
              </li>
            )
          })}

          {rest.length > 0 ? (
            <li className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setSheetOpen((v) => !v)}
                aria-expanded={sheetOpen}
                className={cx(
                  'flex h-14 w-full flex-col items-center justify-center gap-0.5',
                  sheetOpen ? 'text-accent' : 'text-muted',
                )}
              >
                <span className="text-base leading-none" aria-hidden>
                  {sheetOpen ? '✕' : '⋯'}
                </span>
                <span className="hud text-[10px]">More</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {/* ---- Sheet ---- */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div
            className="glass-strong absolute inset-x-0 bottom-14 border-t border-line p-3"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
          >
            <ul className="grid grid-cols-2 gap-2">
              {rest.map((item) => {
                const active = isActive(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cx(
                        'chamfer-sm flex min-h-12 items-center gap-2.5 px-3 py-2 text-sm',
                        active
                          ? 'bg-accent-soft font-medium text-accent'
                          : 'bg-surface-2 text-secondary',
                      )}
                    >
                      <span className="text-xs" aria-hidden>
                        {item.glyph}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.badge ? (
                        <span className="tabular rounded bg-critical-soft px-1.5 text-[10px] font-bold text-critical-text">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  )
}
