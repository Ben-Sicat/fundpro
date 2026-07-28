/**
 * Stat tile — the "is it even a chart?" answer for a single headline number.
 *
 * Glass surface: this is a container, not a plotting surface, so translucency
 * is safe here. The value wears a text token, never a series colour.
 */
import type { ReactNode } from 'react'
import { Delta, cx } from '@/components/ui'
import { Sparkline } from './sparkline'

export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaSuffix,
  spark,
  sparkColor,
  hint,
  accent = false,
}: {
  label: string
  value: string
  unit?: string
  delta?: number
  deltaSuffix?: string
  spark?: number[]
  sparkColor?: string
  hint?: ReactNode
  /** The one tile that carries the headline metric. */
  accent?: boolean
}) {
  return (
    <div
      className={cx(
        'glass glass-edge relative overflow-hidden rounded-xl border p-4 shadow-card',
        accent ? 'border-accent/30' : 'border-line',
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-baseline gap-1">
            <span
              className={cx(
                'font-semibold tracking-tight text-primary',
                accent ? 'text-3xl' : 'text-2xl',
              )}
            >
              {value}
            </span>
            {unit ? (
              <span className="text-xs font-medium text-muted">{unit}</span>
            ) : null}
          </p>
          <div className="mt-1 flex items-center gap-2">
            {delta !== undefined ? (
              <Delta value={delta} suffix={deltaSuffix ?? 'pp'} />
            ) : null}
            {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
          </div>
        </div>
        {spark ? (
          <div className="shrink-0 pb-1">
            <Sparkline values={spark} color={sparkColor} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
