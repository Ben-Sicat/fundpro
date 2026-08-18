/**
 * Placeholders that occupy exactly the space their real counterparts will.
 *
 * A skeleton whose box differs from the content it stands in for causes the
 * reflow it exists to prevent — the page jumps when data lands and you lose
 * your place mid-read. So these mirror the real components rather than
 * approximating them, and the numbers below are transcribed from the source:
 *
 *   StatTile     panel, min-h-[7.5rem], p-5           (charts/stat-tile.tsx)
 *   Card         panel, overflow-hidden, p-5          (ui/index.tsx)
 *   CardHeader   border-b, px-5 py-4, -mx-5 -mt-5 mb-5
 *                title text-[15px], subtitle text-[13px]
 *   SectionTitle mb-4, label text-[11px], hairline rule
 *   AreaChart    height 220 (default)                 (charts/area-chart.tsx)
 *   ColumnChart  height 180 (default)                 (charts/column-chart.tsx)
 *   BarList      ol space-y-2.5; per row a text-xs
 *                line then an h-1.5 rounded bar       (charts/bar-list.tsx)
 *   Td           border-b, px-3 py-2.5, text-[13px]
 *
 * If any of those change, these must change with them.
 *
 * All Server Components with no animation library: they render inside Suspense
 * fallbacks, before any JavaScript for the section has run.
 */

function Bar({
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

/** Mirrors `panel` + `p-5`, so borders and radius line up with a real Card. */
function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={`panel overflow-hidden p-5 ${className}`}>{children}</div>
}

/**
 * Mirrors CardHeader, including the bleed that pulls the divider to the panel
 * edge. Without the bleed the rule sits 20px in and the swap is visible.
 */
function HeaderBlock({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="-mx-5 -mt-5 mb-5 flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0 flex-1">
        {/* text-[15px] leading-tight ≈ 18px; text-[13px] leading-snug ≈ 17px. */}
        <Bar className="h-[18px] w-48 max-w-full" />
        <Bar className="mt-1 h-[17px] w-72 max-w-full" />
      </div>
      {withAction ? <Bar className="h-5 w-24 shrink-0" /> : null}
    </div>
  )
}

/** Mirrors SectionTitle: label plus the hairline that runs to the edge. */
export function SectionTitleSkeleton({ width = 'w-28' }: { width?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <Bar className={`h-[11px] ${width}`} />
      <Bar className="h-3 w-40" />
      <div className="hidden h-px flex-1 bg-line sm:block" />
    </div>
  )
}

/**
 * The KPI row. `count` and the grid MUST match the page: the Overview runs five
 * tiles at `grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-5`, and a
 * different column count reflows every tile.
 */
export function StatRowSkeleton({
  count = 5,
  className = 'grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-5',
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={className} role="status" aria-label="Loading figures">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="panel relative flex min-h-[7.5rem] flex-col justify-between p-5"
        >
          {/* hud text-[10px] */}
          <Bar className="h-[10px] w-24" />
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* figure text-[30px]–[36px], leading-none */}
              <Bar className="h-[30px] w-28 max-w-full" />
              {/* hint text-[12px], mt-2.5 */}
              <Bar className="mt-2.5 h-3 w-32 max-w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * A chart inside a Card. `height` is the plot box and must match the chart it
 * replaces — 220 for AreaChart, 180 for ColumnChart.
 */
export function ChartSkeleton({
  height = 220,
  title = 'chart',
  withAction = false,
}: {
  height?: number
  title?: string
  withAction?: boolean
}) {
  return (
    <Panel>
      <div role="status" aria-label={`Loading ${title}`}>
        <HeaderBlock withAction={withAction} />
        {/* A silhouette rather than one grey block: it reads as "a chart is
            coming" instead of "something failed to render". */}
        <div className="flex items-end gap-1.5" style={{ height }}>
          {[38, 62, 45, 78, 55, 88, 66, 92, 71, 58, 84, 49].map((h, i) => (
            <Bar key={i} className="flex-1" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </Panel>
  )
}

/**
 * A BarList inside a Card. Each row is the label line plus the 6px bar, spaced
 * 2.5 (10px) apart, so `rows` maps 1:1 onto the real list length.
 */
export function ListSkeleton({
  rows = 8,
  title = 'list',
}: {
  rows?: number
  title?: string
}) {
  return (
    <Panel>
      <div role="status" aria-label={`Loading ${title}`}>
        <HeaderBlock />
        <ol className="space-y-2.5">
          {Array.from({ length: rows }, (_, i) => (
            <li key={i}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <Bar className="h-3 w-4 shrink-0" />
                  <Bar className="h-3 w-full max-w-[14rem]" />
                </span>
                <Bar className="h-3 w-10 shrink-0" />
              </div>
              {/* The real track is h-1.5 and fully rounded. */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3" />
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  )
}

/**
 * A Donut card. The ring is fluid and square, so the placeholder is a circle
 * sized by aspect-ratio rather than a fixed pixel box.
 */
export function DonutSkeleton({ title = 'breakdown' }: { title?: string }) {
  return (
    <Panel>
      <div role="status" aria-label={`Loading ${title}`}>
        <HeaderBlock />
        <div className="flex flex-col items-center gap-4">
          <span
            aria-hidden
            className="aspect-square w-full max-w-[11rem] animate-pulse rounded-full bg-surface-3"
          />
          <Bar className="h-4 w-24" />
        </div>
      </div>
    </Panel>
  )
}

/**
 * A Table inside a Card. Header row is `pb-2.5 pt-1` over a strong border; body
 * rows are `py-2.5` with a hairline, matching Th/Td exactly.
 */
export function TableSkeleton({
  rows = 4,
  cols = 6,
  withHeader = true,
}: {
  rows?: number
  cols?: number
  withHeader?: boolean
}) {
  return (
    <Panel>
      <div role="status" aria-label="Loading table">
        {withHeader ? <HeaderBlock /> : null}
        <div className="-mx-5 px-5">
          <div className="flex gap-3 border-b border-line-strong pb-2.5 pt-1">
            {Array.from({ length: cols }, (_, i) => (
              <Bar key={i} className="h-[10px] flex-1" />
            ))}
          </div>
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className="flex gap-3 border-b border-line py-2.5">
              {Array.from({ length: cols }, (_, c) => (
                <Bar key={c} className="h-[17px] flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}
