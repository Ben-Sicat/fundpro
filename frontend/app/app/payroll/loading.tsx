import { ListSkeleton, StatRowSkeleton, TableSkeleton } from '@/components/charts/skeleton'
import { PageHeaderSkeleton } from '@/components/charts/page-header-skeleton'

/**
 * Payroll: header with the cutoff picker, the commission-multiplier warning
 * strip, the draft-run card (four tiles over the per-fundraiser table), then the
 * two clawback/bonus panels side by side.
 */
export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading payroll">
      <PageHeaderSkeleton withAction />
      {/* The warning strip is always rendered, so it always occupies space. */}
      <span
        aria-hidden
        className="block h-20 animate-pulse rounded-lg border border-line bg-surface-2"
      />
      <StatRowSkeleton
        count={4}
        className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
      />
      <TableSkeleton rows={6} cols={6} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ListSkeleton rows={5} title="clawbacks" />
        <ListSkeleton rows={5} title="bonuses" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
