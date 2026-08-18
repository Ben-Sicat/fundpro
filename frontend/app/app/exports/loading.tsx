import { SectionTitleSkeleton, TableSkeleton } from '@/components/charts/skeleton'
import { PageHeaderSkeleton } from '@/components/charts/page-header-skeleton'

/** Exports: no KPI row — a three-up template grid, then the run history. */
export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading exports">
      <PageHeaderSkeleton />
      <div>
        <SectionTitleSkeleton width="w-44" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="block h-40 animate-pulse rounded-[var(--r)] border border-line bg-surface-2"
            />
          ))}
        </div>
      </div>
      <TableSkeleton rows={6} cols={5} />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
