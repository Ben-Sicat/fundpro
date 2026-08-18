'use client'

/**
 * Area + line chart with a crosshair and tooltip.
 *
 * THE PROBLEM THIS SOLVES: axis labels used to be SVG <text> inside a viewBox
 * that CSS scales to the container, and SVG font-size scales with it. Type set
 * to 10 units rendered at ~5px in a 380px card and ~15px in a 1140px one — the
 * container width was choosing the type size. `vector-effect` fixes stroke
 * widths but has no equivalent for text.
 *
 * THE APPROACH: all text and gridlines are HTML, positioned by percentage, so
 * their size is real CSS pixels and constant by construction. The SVG holds
 * only the filled path and the line, with `preserveAspectRatio="none"` so the
 * plot stretches to its box and `vector-effect="non-scaling-stroke"` so the
 * 2px line stays 2px.
 *
 * No measurement, so nothing depends on JavaScript, a ResizeObserver, or
 * hydration having finished — it is correct on the server's first paint.
 *
 * One y-axis only, by rule: a second measure on its own scale would be a
 * dual-axis chart.
 */
import { useMemo, useRef, useState } from 'react'
import type { TimePoint } from '@/lib/types'
import { dateShort, count as fmtCount, moneyCompact } from '@/lib/format'

/** Gutters, in real pixels. */
const GUTTER_LEFT = 46
const GUTTER_BOTTOM = 22
/**
 * Show the first point, the last, and every 4th between. Chosen so labels never
 * collide even in a ~300px card, which is narrower than any real placement.
 */
const LABEL_STRIDE = 4

export function AreaChart({
  data,
  metric = 'value',
  height = 220,
}: {
  data: TimePoint[]
  metric?: 'value' | 'signups'
  height?: number
}) {
  const plotRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const values = data.map((d) => (metric === 'value' ? d.value : d.signups))
  const max = Math.max(...values, 1)
  /**
   * Pick a round STEP first, then take the ceiling to a multiple of it.
   *
   * Rounding the ceiling and then quartering it is what produced axes like
   * ₱30K / ₱23K / ₱15K / ₱8K — a tidy top and three arbitrary numbers under
   * it. Stepping by 1, 2, 2.5, 5 or 10 × a power of ten means every gridline
   * is a number a person would say out loud.
   */
  const { niceMax, step } = useMemo(() => {
    const rawStep = max / 4
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
    const norm = rawStep / mag
    const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
    const s = nice * mag
    let top = Math.ceil(max / s) * s
    // Headroom: a peak flush against the top border reads as clipped data.
    if (max / top > 0.95) top += s
    return { niceMax: top, step: s }
  }, [max])

  const label = (v: number) => (metric === 'value' ? moneyCompact(v) : fmtCount(v))

  // Plot geometry in a 0..100 space; CSS stretches it to the box.
  const px = (i: number) => (data.length <= 1 ? 0 : (i / (data.length - 1)) * 100)
  const py = (v: number) => 100 - (v / niceMax) * 100

  const linePath = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(2)},${py(v).toFixed(2)}`)
    .join(' ')
  const areaPath = `${linePath} L100,100 L0,100 Z`

  // Generated from the step, top down, so the count follows the data range
  // instead of always being five.
  const ticks = Array.from({ length: Math.round(niceMax / step) + 1 }, (_, k) => {
    const v = niceMax - k * step
    return { v, topPct: (1 - v / niceMax) * 100 }
  })

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = plotRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const f = (e.clientX - rect.left) / rect.width
    const i = Math.round(f * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }

  const active = hover !== null ? data[hover] : null

  return (
    <div
      className="relative w-full"
      style={{ height }}
      onMouseLeave={() => setHover(null)}
    >
      {/* ---- Y axis labels, in the left gutter. Real px type. ---- */}
      <div
        className="absolute left-0 top-0"
        style={{ width: GUTTER_LEFT, bottom: GUTTER_BOTTOM }}
      >
        {ticks.map((t) => (
          <span
            key={t.v}
            className="tabular absolute right-2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted"
            style={{ top: `${t.topPct}%` }}
          >
            {label(t.v)}
          </span>
        ))}
      </div>

      {/* ---- Plot area ---- */}
      <div
        ref={plotRef}
        className="absolute right-0 top-0"
        style={{ left: GUTTER_LEFT, bottom: GUTTER_BOTTOM }}
        onMouseMove={onMove}
      >
        {/* Gridlines as HTML: crisp 1px at any width, no scaling. */}
        {ticks.map((t) => (
          <div
            key={t.v}
            className="absolute inset-x-0 border-t border-grid"
            style={{ top: `${t.topPct}%` }}
          />
        ))}

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          // overflow-visible: the last point sits at x=100, so half the 2px
          // stroke fell outside the viewport and the line looked sliced off at
          // the panel edge. Same at the top when a peak reaches the axis max.
          className="absolute inset-0 h-full w-full overflow-visible"
          role="img"
          aria-label={`Weekly ${metric === 'value' ? 'pledged value' : 'sign-ups'}`}
        >
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#areaFill)" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Baseline */}
        <div className="absolute inset-x-0 bottom-0 border-t border-axis" />

        {/* Crosshair and marker as HTML, so the dot stays a circle — an SVG
            circle would be stretched into an ellipse by
            preserveAspectRatio="none". */}
        {hover !== null ? (
          <>
            <div
              className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-axis"
              style={{ left: `${px(hover)}%` }}
            />
            <div
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
              style={{
                left: `${px(hover)}%`,
                top: `${py(values[hover])}%`,
                backgroundColor: 'var(--series-1)',
              }}
            />
          </>
        ) : null}
      </div>

      {/* ---- X axis labels ---- */}
      <div
        className="absolute right-0 bottom-0"
        style={{ left: GUTTER_LEFT, height: GUTTER_BOTTOM }}
      >
        {data.map((d, i) => {
          const isFirst = i === 0
          const isLast = i === data.length - 1
          if (!isFirst && !isLast && i % LABEL_STRIDE !== 0) return null
          return (
            <span
              key={d.date}
              className="absolute top-1 whitespace-nowrap text-[11px] text-muted"
              style={{
                left: `${px(i)}%`,
                transform: isFirst
                  ? 'none'
                  : isLast
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
              }}
            >
              {dateShort(d.date)}
            </span>
          )
        })}
      </div>

      {active ? (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-float"
          style={{
            left: `calc(${GUTTER_LEFT}px + ${px(hover!)}% * (100% - ${GUTTER_LEFT}px) / 100%)`,
          }}
        >
          <p className="text-[11px] font-semibold text-primary">
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
