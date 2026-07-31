'use client'

/**
 * Horizontal bar list — the leaderboard form.
 *
 * Bars are thin, anchored to a common baseline, with 4px rounded data-ends.
 * Every row is directly labelled, so no legend is needed and the light-mode
 * contrast relief rule is satisfied by visible labels.
 */
import { useState } from 'react'
import { cx } from '@/components/ui'
import { count, money, moneyCompact, percent } from '@/lib/format'

export interface BarDatum {
  label: string
  sublabel?: string
  value: number
  /** Secondary measure shown as text only — never a second axis. */
  note?: string
  tone?: 'series-1' | 'series-2' | 'series-3' | 'series-4'
}

/**
 * Named formats rather than a formatter function: this is a Client Component,
 * and a function prop cannot cross the server/client boundary — React can only
 * serialize data. Passing one throws at render time.
 */
export type ValueFormat = 'count' | 'money' | 'moneyCompact' | 'percent'

const FORMATTERS: Record<ValueFormat, (v: number) => string> = {
  count,
  money: (v) => money(v),
  moneyCompact: (v) => moneyCompact(v),
  percent: (v) => percent(v),
}

export function BarList({
  data,
  format = 'count',
  max: maxOverride,
}: {
  data: BarDatum[]
  format?: ValueFormat
  max?: number
}) {
  const [hover, setHover] = useState<string | null>(null)
  const valueFormat = FORMATTERS[format]
  const max = maxOverride ?? Math.max(...data.map((d) => d.value), 1)

  return (
    <ol className="@container space-y-2.5">
      {data.map((d, i) => {
        const pct = (d.value / max) * 100
        const tone = d.tone ?? 'series-1'
        return (
          <li
            key={d.label}
            onMouseEnter={() => setHover(d.label)}
            onMouseLeave={() => setHover(null)}
            className="group"
          >
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="tabular w-4 shrink-0 text-muted">{i + 1}</span>
                <span className="truncate font-medium text-primary">
                  {d.label}
                </span>
                {d.sublabel ? (
                  <span className="hidden truncate text-muted @[26rem]:inline">
                    {d.sublabel}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                {d.note ? (
                  <span className="tabular text-muted">{d.note}</span>
                ) : null}
                <span className="tabular font-semibold text-primary">
                  {valueFormat(d.value)}
                </span>
              </span>
            </div>
            {/* Track sits on the surface; the fill is the mark. */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={cx(
                  'h-full rounded-full transition-[width,opacity] duration-500',
                  hover && hover !== d.label ? 'opacity-45' : 'opacity-100',
                )}
                style={{
                  width: `${pct}%`,
                  backgroundColor: `var(--${tone})`,
                }}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}
