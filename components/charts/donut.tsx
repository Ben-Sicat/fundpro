'use client'

/**
 * Donut with a hero centre figure, hover, and a directly-labelled legend.
 *
 * Segments are separated by a 2px surface gap (drawn as a stroke in the surface
 * colour) so adjacent fills never touch — the spacer rule. Identity is carried
 * by the legend labels and values, never by colour alone.
 */
import { useState } from 'react'
import { count as fmtCount, percent } from '@/lib/format'

export interface DonutDatum {
  label: string
  value: number
  color: string
}

export function Donut({
  data,
  centreLabel,
  centreValue,
  size = 168,
}: {
  data: DonutDatum[]
  centreLabel: string
  centreValue: string
  size?: number
}) {
  const [hover, setHover] = useState<string | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0) || 1

  const r = size / 2
  const stroke = 18
  const radius = r - stroke / 2 - 2
  const circumference = 2 * Math.PI * radius

  let offset = 0
  const arcs = data.map((d) => {
    const fraction = d.value / total
    const length = fraction * circumference
    const arc = { ...d, fraction, length, offset }
    offset += length
    return arc
  })

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${centreLabel}: ${centreValue}`}
        >
          <g transform={`rotate(-90 ${r} ${r})`}>
            {arcs.map((a) => (
              <circle
                key={a.label}
                cx={r}
                cy={r}
                r={radius}
                fill="none"
                stroke={a.color}
                strokeWidth={hover === a.label ? stroke + 3 : stroke}
                // 2px surface gap between adjacent segments.
                strokeDasharray={`${Math.max(a.length - 2, 0)} ${circumference}`}
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
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tracking-tight text-primary">
            {centreValue}
          </span>
          <span className="mt-0.5 max-w-[7rem] text-center text-[11px] leading-tight text-muted">
            {centreLabel}
          </span>
        </div>
      </div>

      {/* Legend is always present for >= 2 series, with values labelled. */}
      <ul className="w-full min-w-0 space-y-2">
        {arcs.map((a) => (
          <li
            key={a.label}
            onMouseEnter={() => setHover(a.label)}
            onMouseLeave={() => setHover(null)}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: a.color }}
                aria-hidden
              />
              <span className="truncate text-secondary">{a.label}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="tabular font-medium text-primary">
                {fmtCount(a.value)}
              </span>
              <span className="tabular w-11 text-right text-muted">
                {percent(a.fraction, 1)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
