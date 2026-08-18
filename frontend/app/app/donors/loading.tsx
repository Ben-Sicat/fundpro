import { SectionTitleSkeleton, StatRowSkeleton, TableSkeleton } from '@/components/charts/skeleton'
import { PageHeaderSkeleton } from '@/components/charts/page-header-skeleton'

/** Donors: four tiles, the dedupe-hints section, then the donor table. */
export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading donors">
      <PageHeaderSkeleton />
      <StatRowSkeleton count={4} className="grid grid-cols-2 gap-3 lg:grid-cols-4" />
      <div>
        <SectionTitleSkeleton width="w-36" />
        <TableSkeleton rows={4} cols={5} withHeader={false} />
      </div>
      <TableSkeleton rows={10} cols={6} />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
