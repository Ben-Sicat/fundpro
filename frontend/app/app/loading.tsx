import {
  ChartSkeleton,
  ListSkeleton,
  StatRowSkeleton,
} from '@/components/charts/skeleton'

/**
 * Shown the instant a navigation starts, for every page under /app that does
 * not define its own.
 *
 * WHY THIS FILE EXISTS. Without a `loading.tsx`, Next waits for the server
 * render before committing the navigation — so clicking "Team" left the old
 * page on screen with no acknowledgement, for as long as the API took. That
 * reads as a dead link, and it got worse when nav links stopped prefetching.
 * With this file the router commits immediately, the shell and sidebar stay
 * put, and the content area shows structure while the data lands.
 *
 * Deliberately generic. Every page here is a title, a row of figures, and some
 * combination of chart, list and table, so one honest approximation beats seven
 * bespoke files drifting out of sync with the pages they stand in for. The
 * heights match the real layouts closely enough not to jump when they resolve.
 */
export default function Loading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading page">
      {/* Title block. Reserves the same space as a real page header so the
          content below does not move when it arrives. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span
            aria-hidden
            className="block h-7 w-56 animate-pulse rounded-[var(--r-sm)] bg-surface-3"
          />
          <span
            aria-hidden
            className="mt-2 block h-3 w-72 animate-pulse rounded-[var(--r-sm)] bg-surface-3"
          />
        </div>
        <span
          aria-hidden
          className="block h-9 w-40 animate-pulse rounded-[var(--r-sm)] bg-surface-3"
        />
      </div>

      <StatRowSkeleton count={5} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartSkeleton height={240} title="Loading chart" />
        </div>
        <ListSkeleton rows={5} title="Loading breakdown" />
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  )
}
