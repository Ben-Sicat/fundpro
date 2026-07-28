/**
 * UI primitives.
 *
 * Written against the design-system roles in globals.css, never raw hex, so
 * light/dark is handled in one place. Every interactive control sets its own
 * text and background colour explicitly — inheriting `color` from an ancestor
 * is what made the original inputs invisible.
 */
import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes } from 'react'

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  children,
  className,
  glass = false,
  padded = true,
}: {
  children: ReactNode
  className?: string
  /** Glass is for containers and chrome — never behind chart marks. */
  glass?: boolean
  padded?: boolean
}) {
  return (
    <section
      className={cx(
        'rounded-xl border border-line shadow-card',
        glass ? 'glass glass-edge' : 'bg-surface',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-primary">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
        {children}
      </h2>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      <div className="h-px flex-1 bg-line" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  type?: 'button' | 'submit'
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>) {
  const variants = {
    primary:
      'bg-accent text-on-accent hover:bg-accent-hover border-transparent shadow-sm',
    secondary:
      'bg-surface text-primary hover:bg-surface-2 border-line-strong shadow-sm',
    ghost: 'bg-transparent text-secondary hover:bg-surface-2 border-transparent',
    danger:
      'bg-critical-soft text-critical-text hover:bg-critical-soft border-transparent',
  }
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        // Explicit text + background: the fix for the invisible-text bug.
        'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-primary',
        'placeholder:text-muted',
        'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25',
        'transition-colors',
        className,
      )}
      {...rest}
    />
  )
}

export function Label({
  htmlFor,
  children,
}: {
  htmlFor: string
  children: ReactNode
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-xs font-medium text-secondary"
    >
      {children}
    </label>
  )
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      className={cx(
        'rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-primary',
        'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

type Tone = 'neutral' | 'good' | 'warning' | 'critical' | 'accent' | 'info'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-secondary',
  good: 'bg-good-soft text-good-text',
  warning: 'bg-warning-soft text-warning-text',
  critical: 'bg-critical-soft text-critical-text',
  accent: 'bg-accent-soft text-accent',
  info: 'bg-surface-3 text-secondary',
}

/**
 * Status is never colour alone — every badge carries its label, and the dot is
 * a redundant cue rather than the only one.
 */
export function Badge({
  children,
  tone = 'neutral',
  dot = false,
}: {
  children: ReactNode
  tone?: Tone
  dot?: boolean
}) {
  const dotColor: Record<Tone, string> = {
    neutral: 'bg-muted',
    good: 'bg-good',
    warning: 'bg-warning',
    critical: 'bg-critical',
    accent: 'bg-accent',
    info: 'bg-muted',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium',
        TONES[tone],
      )}
    >
      {dot ? (
        <span className={cx('size-1.5 rounded-full', dotColor[tone])} />
      ) : null}
      {children}
    </span>
  )
}

/** Signed delta with an arrow glyph, so direction survives colour blindness. */
export function Delta({
  value,
  suffix = 'pp',
  digits = 1,
}: {
  value: number
  suffix?: string
  digits?: number
}) {
  const up = value >= 0
  const shown = (value * 100).toFixed(digits)
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 text-xs font-medium tabular',
        up ? 'text-good-text' : 'text-critical-text',
      )}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      {up ? '+' : ''}
      {shown}
      {suffix}
      <span className="sr-only">{up ? 'increase' : 'decrease'}</span>
    </span>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="text-sm font-medium text-primary">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function Table({ children }: { children: ReactNode }) {
  // Wide tables scroll inside their own container; the page never scrolls
  // horizontally.
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  )
}

export function Th({
  children,
  align = 'left',
  className,
}: {
  children?: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  return (
    <th
      scope="col"
      className={cx(
        // Horizontal padding keeps adjacent columns from running together
        // ("₱750Semi-Annual"); the edge cells stay flush with the card.
        'sticky top-0 z-10 whitespace-nowrap border-b border-line bg-surface px-3 pb-2 pt-1 text-xs font-medium text-muted first:pl-0 last:pr-0',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  align = 'left',
  className,
}: {
  children?: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  return (
    <td
      className={cx(
        'border-b border-line/60 px-3 py-2.5 text-secondary first:pl-0 last:pr-0',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  )
}

export function Tr({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <tr className={cx('transition-colors hover:bg-surface-2', className)}>
      {children}
    </tr>
  )
}

export { cx }
