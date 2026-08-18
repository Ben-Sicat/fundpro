/**
 * Stat tile — the "is it even a chart?" answer for a single headline number.
 *
 * A console readout: a wide-tracked label above, the figure in the mono face
 * below, supporting detail beneath that. The figure is the loud part; nothing
 * else in the tile competes with it.
 *
 * `accent` is for the ONE headline metric per view. If every tile is
 * emphasised, nothing is.
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
  /**
   * Money the business has earned or owes. Kept as a distinct flag from
   * `accent` because a view can have a lead metric AND a money figure, but
   * it no longer paints the tile gold — the mono face and the currency symbol
   * already say "this is money".
   */
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
  gold?: boolean
}) {
  return (
    <div
      className={cx(
        '@container panel relative flex min-h-[7.5rem] flex-col justify-between p-5',
        accent && 'stat-lead',
      )}
      data-money={gold ? '' : undefined}
    >
      <p className="hud text-[10px] text-muted">{label}</p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5">
            <span
              className={cx(
                // `.figure`, not `.tabular`: mono centres the period in a
                // full-width cell, so at this size "50.0%" reads "50 . 0%".
                'figure leading-none text-primary',
                // Steps down on phones so a wide figure never overflows its
                // tile in a 2-up grid.
                accent
                  ? 'text-[30px] @[14rem]:text-[36px]'
                  : 'text-[26px] @[14rem]:text-[30px]',
              )}
            >
              {value}
            </span>
            {unit ? (
              <span className="text-xs font-medium text-muted">{unit}</span>
            ) : null}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {delta !== undefined ? (
              <Delta value={delta} suffix={deltaSuffix ?? 'pp'} />
            ) : null}
            {hint ? (
              <span className="text-[12px] leading-snug text-secondary">
                {hint}
              </span>
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
