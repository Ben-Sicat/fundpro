import { SectionTitleSkeleton, StatRowSkeleton, TableSkeleton } from '@/components/charts/skeleton'
import { PageHeaderSkeleton } from '@/components/charts/page-header-skeleton'

/**
 * Uploads: the drop zone, four tiles, the last-consolidation panel, then the
 * file history table. The drop zone is tall, so a short placeholder here shifts
 * everything beneath it.
 */
export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading uploads">
      <PageHeaderSkeleton />
      <span
        aria-hidden
        className="block h-56 animate-pulse rounded-[var(--r)] border border-line bg-surface-2"
      />
      <StatRowSkeleton count={4} className="grid grid-cols-2 gap-3 lg:grid-cols-4" />
      <div>
        <SectionTitleSkeleton width="w-40" />
        <TableSkeleton rows={3} cols={4} />
      </div>
      <TableSkeleton rows={8} cols={6} />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
