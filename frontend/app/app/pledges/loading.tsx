import { StatRowSkeleton, TableSkeleton } from '@/components/charts/skeleton'
import { PageHeaderSkeleton } from '@/components/charts/page-header-skeleton'

/** Applications: four tiles, filter bar, then one long table. */
export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading applications">
      <PageHeaderSkeleton withAction />
      <StatRowSkeleton
        count={4}
        className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
      />
      <span
        aria-hidden
        className="block h-[7.5rem] animate-pulse rounded-[var(--r)] border border-line bg-surface-2"
      />
      {/* The applications table is the page; a short skeleton would collapse
          the scroll height and bounce the viewport when rows arrive. */}
      <TableSkeleton rows={12} cols={7} />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
