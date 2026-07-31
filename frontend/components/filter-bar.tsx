'use client'

/**
 * The global filter bar — collapsed by default.
 *
 * Six controls permanently open dominated every page, so the bar starts as a
 * single row and expands on demand. The critical part is the collapsed state:
 * it lists the filters currently in force. Hiding the controls is fine; hiding
 * the fact that the numbers are filtered is not — someone would read a
 * single-client view as company-wide.
 *
 * A plain GET form, so a filtered view stays a shareable URL that survives a
 * refresh.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Button, Card, Input, Select, cx } from '@/components/ui'
import { DATE_BASIS_LABELS, type DateBasis } from '@/lib/data'
import {
  FILTER_PRESETS,
  activeFilterSummary,
  isPresetActive,
} from '@/lib/filters'

export function FilterBar({
  action,
  current,
  charities,
  fundraisers,
  leaders,
  sites,
  showDateBasis = true,
}: {
  action: string
  current: Record<string, string | undefined>
  charities: string[]
  fundraisers?: string[]
  leaders?: string[]
  sites?: string[]
  showDateBasis?: boolean
}) {
  const summary = activeFilterSummary(current)
  const hasFilters = summary.length > 0
  // Open automatically when filters are already applied, so an arriving
  // shared URL shows what produced it.
  const [open, setOpen] = useState(hasFilters)
  const basis = (current.basis as DateBasis) ?? 'signupDate'

  return (
    <Card padded={false} className="overflow-hidden">
      {/* ---- Collapsed header ---- */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-h-9 items-center gap-2 rounded-md px-2 text-xs font-semibold text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
        >
          <span
            aria-hidden
            className={cx('text-[10px] transition-transform', open && 'rotate-90')}
          >
            ▶
          </span>
          Filters
        </button>

        {hasFilters ? (
          <>
            <span className="flex flex-wrap items-center gap-1.5">
              {summary.map((s) => (
                <span
                  key={s}
                  className="rounded bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent"
                >
                  {s}
                </span>
              ))}
            </span>
            <Link href={action} className="text-[11px] text-muted hover:text-primary">
              Clear
            </Link>
          </>
        ) : (
          <span className="text-[11px] text-muted">
            Showing everything · all clients, all sites, all time
          </span>
        )}
      </div>

      {/* ---- Quick presets. On the always-visible row, so the views people
              actually want are one click away without expanding anything. ---- */}
      <div className="flex gap-1.5 overflow-x-auto border-t border-line px-3 py-2 sm:px-4">
        {FILTER_PRESETS.map((preset) => {
          const active = isPresetActive(preset, current)
          return (
            <Link
              key={preset.id}
              // Presets replace the date/status keys they own but keep the
              // dimension filters, so "STC + this pay period" composes.
              href={{ pathname: action, query: { ...dimensionsOnly(current), ...preset.query } }}
              title={preset.hint}
              className={cx(
                'shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                active
                  ? 'border-transparent bg-accent text-on-accent'
                  : 'border-line-strong bg-surface-2 text-secondary hover:text-primary',
              )}
            >
              {preset.label}
            </Link>
          )
        })}
      </div>

      {/* ---- Expanded controls ---- */}
      {open ? (
        <form
          className="flex flex-wrap items-end gap-2 border-t border-line px-3 py-3 sm:gap-3 sm:px-4"
          action={action}
        >
          <Field label="Client" htmlFor="charity">
            <Select id="charity" name="charity" defaultValue={current.charity ?? ''}>
              <option value="">All clients</option>
              {charities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          {sites ? (
            <Field label="Site" htmlFor="site">
              <Select id="site" name="site" defaultValue={current.site ?? ''}>
                <option value="">All sites</option>
                {sites.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {leaders ? (
            <Field label="Leader" htmlFor="leader">
              <Select id="leader" name="leader" defaultValue={current.leader ?? ''}>
                <option value="">All leaders</option>
                {leaders.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {fundraisers ? (
            <Field label="Fundraiser" htmlFor="fundraiser">
              <Select
                id="fundraiser"
                name="fundraiser"
                defaultValue={current.fundraiser ?? ''}
              >
                <option value="">Everyone</option>
                {fundraisers.map((fr) => (
                  <option key={fr} value={fr}>
                    {fr}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {showDateBasis ? (
            <Field label="Dates based on" htmlFor="basis">
              <Select id="basis" name="basis" defaultValue={basis}>
                {Object.entries(DATE_BASIS_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="From" htmlFor="from">
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={current.from ?? ''}
              className="w-[9.5rem]"
            />
          </Field>
          <Field label="To" htmlFor="to">
            <Input
              id="to"
              name="to"
              type="date"
              defaultValue={current.to ?? ''}
              className="w-[9.5rem]"
            />
          </Field>

          {/* Preserved so applying a filter does not reset the view switch. */}
          {current.view ? (
            <input type="hidden" name="view" value={current.view} />
          ) : null}

          <Button type="submit" variant="primary" size="sm">
            Apply
          </Button>
          <Link href={action}>
            <Button variant="ghost" size="sm">
              Reset
            </Button>
          </Link>
        </form>
      ) : null}
    </Card>
  )
}

/**
 * Keeps only the "who/where" filters when applying a preset.
 *
 * Presets own the date and status keys; carrying the old ones over would leave
 * a stale range fighting the preset's own.
 */
function dimensionsOnly(
  sp: Record<string, string | undefined>,
): Record<string, string> {
  const keep = ['charity', 'site', 'leader', 'fundraiser', 'view', 'q'] as const
  const out: Record<string, string> = {}
  for (const k of keep) if (sp[k]) out[k] = sp[k] as string
  return out
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-[11px] font-medium text-secondary"
      >
        {label}
      </label>
      {children}
    </div>
  )
}
