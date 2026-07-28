'use client'

/**
 * Area + line chart with a crosshair and tooltip.
 *
 * Geometry uses a fixed viewBox and scales to the container; strokes carry
 * `vector-effect="non-scaling-stroke"` so a 2px line stays 2px at any width
 * rather than being stretched by the scale factor.
 *
 * One y-axis only, by rule — a second measure on its own scale would be a
 * dual-axis chart. Value is the area; the count series lives in its own chart.
 */
import { useMemo, useRef, useState } from 'react'
import type { TimePoint } from '@/lib/types'
import { dateShort, count as fmtCount, moneyCompact } from '@/lib/format'

const W = 760
const H = 220
const PAD = { top: 16, right: 12, bottom: 26, left: 48 }

export function AreaChart({
  data,
  metric = 'value',
}: {
  data: TimePoint[]
  metric?: 'value' | 'signups'
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const values = data.map((d) => (metric === 'value' ? d.value : d.signups))
  const max = Math.max(...values, 1)
  // Round the axis top to a clean number so ticks read well.
  const niceMax = useMemo(() => {
    const mag = Math.pow(10, Math.floor(Math.log10(max)))
    return Math.ceil(max / mag) * mag
  }, [max])

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) =>
    PAD.left + (data.length <= 1 ? 0 : (i / (data.length - 1)) * plotW)
  const y = (v: number) => PAD.top + plotH - (v / niceMax) * plotH

  const linePath = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`)
    .join(' ')
  const areaPath =
    `${linePath} L${x(values.length - 1).toFixed(2)},${(PAD.top + plotH).toFixed(2)}` +
    ` L${x(0).toFixed(2)},${(PAD.top + plotH).toFixed(2)} Z`

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    v: niceMax * f,
    y: y(niceMax * f),
  }))

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    // Map client x into viewBox space, then to the nearest data index.
    const vx = ((e.clientX - rect.left) / rect.width) * W
    const f = (vx - PAD.left) / plotW
    const i = Math.round(f * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }

  const active = hover !== null ? data[hover] : null

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Weekly ${metric === 'value' ? 'pledged value' : 'sign-ups'}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="block touch-none"
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Recessive gridlines — hairlines, behind the data. */}
        {ticks.map((t) => (
          <g key={t.v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={t.y}
              y2={t.y}
              stroke="var(--grid)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PAD.left - 8}
              y={t.y + 3.5}
              textAnchor="end"
              className="tabular"
              fontSize="10"
              fill="var(--text-muted)"
            >
              {metric === 'value' ? moneyCompact(t.v) : fmtCount(t.v)}
            </text>
          </g>
        ))}

        <path d={areaPath} fill="url(#areaFill)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--series-1)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* x labels, thinned so they never collide. */}
        {data.map((d, i) =>
          i % 4 === 0 || i === data.length - 1 ? (
            <text
              key={d.date}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
              fontSize="10"
              fill="var(--text-muted)"
            >
              {dateShort(d.date)}
            </text>
          ) : null,
        )}

        {/* Crosshair + marker. Marker is 9px across, above the 8px floor, with
            a 2px surface ring so it stays legible over the area fill. */}
        {hover !== null ? (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--axis)"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x(hover)}
              cy={y(values[hover])}
              r="4.5"
              fill="var(--series-1)"
              stroke="var(--surface)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ) : null}

        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          stroke="var(--axis)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-float"
          style={{
            left: `${((x(hover!) / W) * 100).toFixed(2)}%`,
          }}
        >
          <p className="text-[11px] font-medium text-primary">
            {dateShort(active.date)}
          </p>
          <p className="tabular text-[11px] text-secondary">
            {moneyCompact(active.value)} · {fmtCount(active.signups)} sign-ups
          </p>
        </div>
      ) : null}
    </div>
  )
}
