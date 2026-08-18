import { StatRowSkeleton, TableSkeleton } from '@/components/charts/skeleton'
import { PageHeaderSkeleton } from '@/components/charts/page-header-skeleton'

/**
 * Team, mid-load. Four tiles at `lg:grid-cols-4` — NOT the Overview's five at
 * `xl:grid-cols-5` — then the fundraiser roster table.
 *
 * `withAction` covers the By fundraiser / By leader toggle in the header.
 */
export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading team">
      <PageHeaderSkeleton withAction />
      <StatRowSkeleton
        count={4}
        className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
      />
      <span
        aria-hidden
        className="block h-9 w-40 animate-pulse rounded-[var(--r-sm)] bg-surface-3"
      />
      <span
        aria-hidden
        className="block h-[7.5rem] animate-pulse rounded-[var(--r)] border border-line bg-surface-2"
      />
      <TableSkeleton rows={8} cols={6} />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
