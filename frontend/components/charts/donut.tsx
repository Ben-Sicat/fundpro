'use client'

/**
 * Donut with a hero centre figure, hover, and a directly-labelled legend.
 *
 * RESPONSIVE VIA CONTAINER QUERIES, not viewport breakpoints. This card is
 * one-third width on a wide screen and full width on a medium one, so viewport
 * breakpoints were sizing it against the wrong thing: at 1280px the viewport
 * said "go side-by-side" while the card was only ~400px, which squeezed the
 * legend. `@container` makes it respond to the space it actually has.
 *
 * The ring is drawn in a fixed 100x100 viewBox and scaled by CSS, so it is
 * fluid rather than locked to a pixel size.
 *
 * Segments are separated by a small surface gap so adjacent fills never touch,
 * and identity is carried by the legend labels and values, never colour alone.
 */
import { useState } from 'react'
import { count as fmtCount, percent } from '@/lib/format'

export interface DonutDatum {
  label: string
  value: number
  color: string
}

/** Geometry in viewBox units. */
const VIEW = 100
const STROKE = 11
const RADIUS = VIEW / 2 - STROKE / 2 - 1
const CIRC = 2 * Math.PI * RADIUS
/** Segment gap, in viewBox units — reads as roughly 2px at typical sizes. */
const GAP = 1.2

export function Donut({
  data,
  centreLabel,
  centreValue,
  /** Upper bound on the ring's width. It scales down freely below this. */
  maxSize = 160,
}: {
  data: DonutDatum[]
  centreLabel: string
  centreValue: string
  maxSize?: number
}) {
  const [hover, setHover] = useState<string | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0) || 1

  let offset = 0
  const arcs = data.map((d) => {
    const fraction = d.value / total
    const length = fraction * CIRC
    const arc = { ...d, fraction, length, offset }
    offset += length
    return arc
  })

  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-4 @[20rem]:flex-row @[20rem]:gap-5">
        {/* Ring: fluid width, square via aspect-ratio. */}
        <div
          className="relative w-full shrink-0 [max-width:min(100%,var(--ring-max))]"
          style={{ '--ring-max': `${maxSize}px` } as React.CSSProperties}
        >
          <svg
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className="block h-auto w-full"
            role="img"
            aria-label={`${centreLabel}: ${centreValue}`}
          >
            <g transform={`rotate(-90 ${VIEW / 2} ${VIEW / 2})`}>
              {arcs.map((a) => (
                <circle
                  key={a.label}
                  cx={VIEW / 2}
                  cy={VIEW / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={hover === a.label ? STROKE + 2 : STROKE}
                  strokeDasharray={`${Math.max(a.length - GAP, 0.1)} ${CIRC}`}
                  strokeDashoffset={-a.offset}
                  strokeLinecap="butt"
                  opacity={hover && hover !== a.label ? 0.4 : 1}
                  onMouseEnter={() => setHover(a.label)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-default transition-all duration-200"
                />
              ))}
            </g>
          </svg>

          {/* Centre figure. Percentages are short, so it fits inside the ring
              at every size; the caption is allowed two lines at most. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4">
            <span className="figure text-xl leading-none text-primary @[20rem]:text-2xl">
              {centreValue}
            </span>
            <span className="mt-1 line-clamp-2 text-center text-[11px] leading-tight text-secondary">
              {centreLabel}
            </span>
          </div>
        </div>

        {/* Legend — always present for >= 2 series, with values labelled.
            Capped to a readable measure: in a full-width card the row would
            otherwise stretch ~650px and strand each value far from its label,
            so the two stop reading as a pair. */}
        <ul className="w-full min-w-0 max-w-[20rem] space-y-1.5">
          {arcs.map((a) => (
            <li
              key={a.label}
              onMouseEnter={() => setHover(a.label)}
              onMouseLeave={() => setHover(null)}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: a.color }}
                  aria-hidden
                />
                <span className="truncate text-secondary">{a.label}</span>
              </span>
              {/* Numbers never wrap: a count breaking onto its own line reads
                  as two separate values. */}
              <span className="flex shrink-0 items-baseline gap-2.5 whitespace-nowrap">
                <span className="tabular min-w-[3ch] text-right font-semibold text-primary">
                  {fmtCount(a.value)}
                </span>
                <span className="tabular min-w-[4.5ch] text-right text-xs text-muted">
                  {percent(a.fraction, 1)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
