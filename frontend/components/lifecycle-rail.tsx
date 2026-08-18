/**
 * The lifecycle rail — the signature element.
 *
 * A pledge's seven dates are the spine of this whole product: a signature in a
 * mall is worth nothing until the bank actually takes the money, and every
 * report in the app is some slice of the journey between those two points. So
 * the journey gets drawn as a journey, on one track, rather than as seven
 * boxes in a grid that happen to be ordered.
 *
 * What the drawing encodes:
 * - The lit portion of the track is how far this pledge actually got. Unlit
 *   track is future, not failure.
 * - DEBIT is drawn larger, with a ring. It is the money moment — the single
 *   event the business exists to produce — and it should be findable without
 *   reading a word.
 * - CANCELLATION is grey, never red and never green. It is an ending, not an
 *   error, and the categorical green is reserved for approved states.
 * - A step with no date shows an em dash rather than being hidden, because
 *   "hasn't been invoiced yet" is information an operator needs.
 */
import { cx } from '@/components/ui'

export interface LifecycleStep {
  label: string
  /** ISO date, or null when the step has not happened. */
  value: string | null
  note: string
}

type State = 'done' | 'money' | 'ended' | 'pending'

export function LifecycleRail({
  steps,
  format,
}: {
  steps: LifecycleStep[]
  /** Server-side date formatter, applied before render (no function props). */
  format: (iso: string) => string
}) {
  // "How far it got" is the last step with a date — not the count of dates,
  // since verification can land while invoicing has not.
  const lastReached = steps.reduce((last, s, i) => (s.value ? i : last), -1)

  const stateOf = (s: LifecycleStep, i: number): State => {
    if (!s.value) return 'pending'
    if (s.label === 'Cancellation') return 'ended'
    if (s.label === 'Debit') return 'money'
    return i <= lastReached ? 'done' : 'pending'
  }

  // How far along the track the lit portion runs, 0..1. Exposed as a CSS
  // variable rather than a width so the same value drives the horizontal rail
  // and the vertical one on phones.
  const frac =
    steps.length > 1 ? Math.max(lastReached, 0) / (steps.length - 1) : 0

  return (
    <ol
      className="lifecycle"
      role="list"
      style={
        {
          '--steps': steps.length,
          '--frac': frac,
        } as React.CSSProperties
      }
    >
      {/* The track. Two layers: the full run, then the travelled part. */}
      <span className="lifecycle__track" aria-hidden />
      <span className="lifecycle__track lifecycle__track--lit" aria-hidden />

      {steps.map((s, i) => {
        const state = stateOf(s, i)
        return (
          <li key={s.label} className="lifecycle__step" data-state={state}>
            <span className="lifecycle__node" aria-hidden />
            <p className="hud lifecycle__label">{s.label}</p>
            <p className="tabular lifecycle__date">
              {s.value ? format(s.value) : '—'}
            </p>
            <p className="lifecycle__note">{s.note}</p>
          </li>
        )
      })}
    </ol>
  )
}

/** Compact inline variant for table rows and cards. */
export function LifecycleDots({
  steps,
  className,
}: {
  steps: LifecycleStep[]
  className?: string
}) {
  return (
    <span
      className={cx('inline-flex items-center gap-1', className)}
      aria-hidden
    >
      {steps.map((s) => (
        <span
          key={s.label}
          className={cx(
            'size-1.5 rounded-full',
            s.value
              ? s.label === 'Cancellation'
                ? 'bg-axis'
                : 'bg-accent'
              : 'bg-surface-3',
          )}
        />
      ))}
    </span>
  )
}
