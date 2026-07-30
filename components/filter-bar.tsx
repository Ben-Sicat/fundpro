import Link from 'next/link'
import { Button, Card, Input, Select } from '@/components/ui'
import { DATE_BASIS_LABELS, type DateBasis, type PledgeFilters } from '@/lib/data'

/**
 * The global filter bar.
 *
 * A plain GET form, so every filtered view is a shareable URL that survives a
 * refresh and can be sent to someone else — which matters more here than a
 * fancier client-side control, because people pass these views around.
 *
 * The date-basis selector is the important one: "sales in July" means something
 * different on a sign-up basis than on a debit basis, and the lag between the
 * two is inherent to the bank process.
 */
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
  const basis = (current.basis as DateBasis) ?? 'signupDate'

  return (
    <Card glass>
      <form className="flex flex-wrap items-end gap-2 sm:gap-3" action={action}>
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
              {fundraisers.map((f) => (
                <option key={f} value={f}>
                  {f}
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

        <Button type="submit" variant="primary" size="sm">
          Apply
        </Button>
        <Link href={action}>
          <Button variant="ghost" size="sm">
            Reset
          </Button>
        </Link>
      </form>
    </Card>
  )
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

/** Reads the shared filter query params into a PledgeFilters. */
export function filtersFromParams(
  sp: Record<string, string | undefined>,
): PledgeFilters {
  return {
    q: sp.q,
    charityCode: sp.charity,
    siteName: sp.site,
    leaderName: sp.leader,
    fundraiserName: sp.fundraiser,
    status: sp.status as PledgeFilters['status'],
    basis: (sp.basis as DateBasis) ?? 'signupDate',
    from: sp.from,
    to: sp.to,
  }
}
