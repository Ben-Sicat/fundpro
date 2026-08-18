import { SectionTitleSkeleton, TableSkeleton } from '@/components/charts/skeleton'
import { PageHeaderSkeleton } from '@/components/charts/page-header-skeleton'

/** Settings: no KPI row — stacked two-up config panels and reference tables. */
export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading settings">
      <PageHeaderSkeleton />
      <div>
        <SectionTitleSkeleton width="w-48" />
        <TableSkeleton rows={6} cols={4} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TableSkeleton rows={5} cols={3} />
        <TableSkeleton rows={5} cols={3} />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
