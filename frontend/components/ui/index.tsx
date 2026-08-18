/**
 * UI primitives.
 *
 * Written against the design-system roles in globals.css, never raw hex, so
 * light/dark is handled in one place. Every interactive control sets its own
 * text and background colour explicitly — inheriting `color` from an ancestor
 * is what made the original inputs invisible.
 *
 * Conventions this file enforces:
 * - One radius (`--r`, `--r-sm`), one hairline, one soft elevation.
 * - `.tabular` on anything that is a figure, date, serial or code; `.hud` on
 *   console labels. Those two classes carry the monospace face, and applying
 *   them is how a component says "this is data, not prose".
 */
import type {
  ReactNode,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  children,
  className,
  padded = true,
  /** The one lead figure per view. Lit top edge, faint accent in the plane. */
  lead = false,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
  lead?: boolean
}) {
  return (
    <section
      className={cx(
        'panel overflow-hidden',
        lead && 'stat-lead',
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
  /** False when the parent Card uses padded={false}. */
  bleed = true,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  bleed?: boolean
}) {
  return (
    <div
      className={cx(
        'flex items-start justify-between gap-4 border-b border-line px-5 py-4',
        // Bleed to the panel edge only when the panel has padding to cancel.
        bleed && '-mx-5 -mt-5 mb-5',
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-tight text-primary">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-[13px] leading-snug text-secondary">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/**
 * Divides a page into named regions. A quiet console label with a hairline
 * running to the edge — it separates without competing with panel titles.
 */
export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 className="hud text-[11px] text-muted">{children}</h2>
      {hint ? (
        <span className="order-last w-full text-xs text-secondary sm:order-none sm:w-auto">
          {hint}
        </span>
      ) : null}
      <div className="hidden h-px flex-1 bg-line sm:block" />
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
  // Flat faces. The gradient-and-gloss treatment belonged to the earlier
  // game-console direction and read as a toy in a finance tool.
  const variants = {
    primary:
      'bg-accent text-on-accent border-transparent hover:bg-accent-hover shadow-sm',
    secondary:
      'bg-surface-2 text-primary border-line-strong hover:bg-surface-3',
    ghost: 'bg-transparent text-secondary border-transparent hover:bg-surface-2 hover:text-primary',
    danger: 'bg-critical-soft text-critical-text border-transparent hover:brightness-110',
  }
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap border font-medium transition-colors',
        'rounded-[var(--r-sm)] disabled:pointer-events-none disabled:opacity-50',
        // Comfortable touch targets: >=34px at sm, >=38px at md.
        size === 'sm' ? 'min-h-[34px] px-3 text-xs' : 'min-h-[38px] px-4 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Shared shell for every text-entry control, so they cannot drift apart. */
const FIELD =
  'w-full rounded-[var(--r-sm)] border border-line-strong bg-surface-2 px-3 py-2 text-sm text-primary ' +
  'placeholder:text-muted transition-colors ' +
  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25'

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(FIELD, 'min-h-[38px]', className)} {...rest} />
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(FIELD, 'resize-y', className)} {...rest} />
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
    <select className={cx(FIELD, 'min-h-[38px] py-0', className)} {...rest}>
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
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2 py-[3px] text-[11px] font-medium',
        TONES[tone],
      )}
    >
      {dot ? (
        <span className={cx('size-1.5 shrink-0 rounded-full', dotColor[tone])} />
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
        'tabular inline-flex items-center gap-1 text-xs font-medium',
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
    <div className="flex flex-col items-center justify-center rounded-[var(--r)] border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="text-sm font-medium text-primary">{title}</p>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function Table({ children }: { children: ReactNode }) {
  // Wide tables scroll inside their own container; the page itself never
  // scrolls horizontally.
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  )
}

/**
 * Breakpoint below which a column is hidden.
 *
 * Dropping low-priority columns on phones beats horizontal scrolling as the
 * only strategy: a ten-column table on a 390px screen is unusable even when it
 * scrolls. One markup tree, so the two layouts cannot drift apart.
 */
type HideBelow = 'sm' | 'md' | 'lg' | 'xl'

const HIDE_CLASS: Record<HideBelow, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
}

export function Th({
  children,
  align = 'left',
  className,
  hide,
}: {
  children?: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  hide?: HideBelow
}) {
  return (
    <th
      scope="col"
      className={cx(
        // A console label, so the header row reads as chrome and the body
        // reads as data. Sticky against the panel's own frost.
        'hud sticky top-0 z-10 whitespace-nowrap border-b border-line-strong bg-glass px-3 pb-2.5 pt-1',
        'text-[10px] text-muted first:pl-0 last:pr-0',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        hide && HIDE_CLASS[hide],
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
  hide,
}: {
  children?: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  hide?: HideBelow
}) {
  return (
    <td
      className={cx(
        'border-b border-line px-3 py-2.5 text-[13px] text-secondary first:pl-0 last:pr-0',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        hide && HIDE_CLASS[hide],
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
