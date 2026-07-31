/**
 * Stat tile — the "is it even a chart?" answer for a single headline number.
 *
 * Chamfered plate with a lit top bevel. Glass is safe here because a tile is a
 * container, not a plotting surface. The value wears a text token, never a
 * series colour.
 *
 * `accent` is for the ONE headline metric per view. If every tile glows,
 * nothing is emphasised.
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
  gold = false,
}: {
  label: string
  value: string
  unit?: string
  delta?: number
  deltaSuffix?: string
  spark?: number[]
  sparkColor?: string
  hint?: ReactNode
  accent?: boolean
  /** Reward framing — earnings and other "won" numbers. */
  gold?: boolean
}) {
  return (
    <div
      className={cx(
        '@container panel chamfer chamfer-ring glass glass-edge relative overflow-hidden p-3 @[14rem]:p-4',
        accent && 'glow-accent',
        gold && 'glow-gold',
      )}
    >
      <p className="hud text-[11px] text-secondary @[14rem]:text-xs">{label}</p>

      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-baseline gap-1">
            <span
              className={cx(
                'font-semibold tracking-tight text-primary',
                // Steps down on phones so a wide figure never overflows its
                // tile in a 2-up grid.
                accent
                  ? 'text-2xl @[14rem]:text-3xl'
                  : 'text-xl @[14rem]:text-2xl',
              )}
            >
              {value}
            </span>
            {unit ? (
              <span className="text-[11px] font-medium text-secondary @[14rem]:text-xs">
                {unit}
              </span>
            ) : null}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2">
            {delta !== undefined ? (
              <Delta value={delta} suffix={deltaSuffix ?? 'pp'} />
            ) : null}
            {hint ? (
              <span className="text-[11px] leading-snug text-secondary @[14rem]:text-xs">{hint}</span>
            ) : null}
          </div>
        </div>

        {/* The sparkline needs real room, so it is the first thing to drop: a
            tile narrower than this shows the figure alone rather than a
            squashed 120px plot. */}
        {spark ? (
          <div className="hidden shrink-0 pb-1 @[17rem]:block">
            <Sparkline values={spark} color={sparkColor} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
