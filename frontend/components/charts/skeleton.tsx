/**
 * Placeholders for a section whose data has not arrived yet.
 *
 * The Overview fans out thirteen API calls. Awaiting them all before painting
 * anything means the whole page waits on the slowest one and then appears at
 * once — which reads as "nothing is loading", and during an import as "the
 * charts are not updating". Streaming each section behind its own boundary
 * turns that into panels that fill in, and a skeleton is what stops the fill-in
 * looking like a layout bug.
 *
 * Deliberately NOT a client component and deliberately no animation library:
 * these render on the server inside a Suspense fallback, before any JavaScript
 * for the section has run.
 *
 * Every box reserves the SAME height as the real content it stands in for. A
 * fallback shorter than its content shifts the page when it resolves, which is
 * worse than a blank space — you lose your scroll position mid-read.
 */

function Shimmer({
  className = '',
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <span
      aria-hidden
      style={style}
      className={`block animate-pulse rounded-[var(--r-sm)] bg-surface-3 ${className}`}
    />
  )
}

/** A row of KPI tiles. `count` must match the real row or the grid reflows. */
export function StatRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-5"
      role="status"
      aria-label="Loading figures"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-[var(--r-md)] border border-line bg-surface-2 p-4">
          <Shimmer className="h-2.5 w-20" />
          <Shimmer className="mt-3 h-7 w-24" />
          <Shimmer className="mt-3 h-2 w-28" />
        </div>
      ))}
    </div>
  )
}

/**
 * A chart card. `height` is the plot area in pixels and should match the chart
 * it replaces, for the reflow reason above.
 */
export function ChartSkeleton({
  height = 220,
  title = 'Loading',
}: {
  height?: number
  title?: string
}) {
  return (
    <div
      className="rounded-[var(--r-md)] border border-line bg-surface-2 p-4"
      role="status"
      aria-label={`${title}…`}
    >
      <Shimmer className="h-3 w-40" />
      <Shimmer className="mt-2 h-2 w-56" />
      <div className="mt-5 flex items-end gap-1.5" style={{ height }}>
        {/* A rough silhouette rather than one grey block: it reads as "a chart
            is coming" instead of "something failed to render". */}
        {[38, 62, 45, 78, 55, 88, 66, 92, 71, 58, 84, 49].map((h, i) => (
          <Shimmer key={i} className="flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}

/** A ranked list (top fundraisers, sites, frequency mix). */
export function ListSkeleton({
  rows = 6,
  title = 'Loading',
}: {
  rows?: number
  title?: string
}) {
  return (
    <div
      className="rounded-[var(--r-md)] border border-line bg-surface-2 p-4"
      role="status"
      aria-label={`${title}…`}
    >
      <Shimmer className="h-3 w-36" />
      <Shimmer className="mt-2 h-2 w-52" />
      <ul className="mt-4 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-3">
            <Shimmer className="size-4 shrink-0 rounded-full" />
            <Shimmer className="h-2.5 flex-1" />
            <Shimmer className="h-2.5 w-12 shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A table (recent uploads, applications). */
export function TableSkeleton({ rows = 4, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="rounded-[var(--r-md)] border border-line bg-surface-2 p-4"
      role="status"
      aria-label="Loading table"
    >
      <div className="flex gap-3 border-b border-line pb-2">
        {Array.from({ length: cols }, (_, i) => (
          <Shimmer key={i} className="h-2 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3 border-b border-line py-3 last:border-0">
          {Array.from({ length: cols }, (_, c) => (
            <Shimmer key={c} className="h-2.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}
