'use client'

/**
 * Vertical columns with an optional overlaid rate line-per-column.
 *
 * The rate is drawn as a short tick per column against the SAME 0–100% scale
 * shown on the right as text labels — not a second y-axis. Dual axes are
 * prohibited; here magnitude is the column and the rate is a directly-labelled
 * annotation, which keeps one scale per axis.
 */
import { useState } from 'react'
import { count as fmtCount, percent } from '@/lib/format'

export interface ColumnDatum {
  label: string
  value: number
  /** 0..1 — shown as a direct label, not a second axis. */
  rate?: number
  highlight?: boolean
}

export function ColumnChart({
  data,
  height = 180,
}: {
  data: ColumnDatum[]
  height?: number
}) {
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <div>
      <div
        className="flex items-end gap-2"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
      >
        {data.map((d) => {
          const h = (d.value / max) * 100
          const dim = hover && hover !== d.label
          return (
            <div
              key={d.label}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              onMouseEnter={() => setHover(d.label)}
            >
              {/* Rate label sits above the column: the secondary measure as
                  text, so it needs no second scale. */}
              {d.rate !== undefined ? (
                <span className="tabular mb-1 text-center text-[10px] font-medium text-muted">
                  {percent(d.rate, 0)}
                </span>
              ) : null}
              <span className="tabular mb-1 text-center text-[11px] font-semibold text-primary">
                {fmtCount(d.value)}
              </span>
              <div
                // 4px rounded data-end, anchored to the baseline.
                className="w-full rounded-t transition-all duration-500"
                style={{
                  height: `${h}%`,
                  minHeight: d.value > 0 ? 3 : 0,
                  backgroundColor: d.highlight
                    ? 'var(--series-1)'
                    : 'var(--series-3)',
                  opacity: dim ? 0.45 : 1,
                }}
              />
            </div>
          )
        })}
      </div>
      {/* Baseline */}
      <div className="mt-0 h-px w-full bg-axis" />
      <div className="mt-1.5 flex gap-2">
        {data.map((d) => (
          <span
            key={d.label}
            className="min-w-0 flex-1 truncate text-center text-[11px] text-muted"
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}
