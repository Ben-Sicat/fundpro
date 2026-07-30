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
  /**
   * Chamfered corners for feature panels. Off by default: a clipped corner
   * costs readable area, so dense tables keep square-ish rounded corners.
   */
  feature = false,
  /** Reserved for the headline metric and earned states. */
  glow,
}: {
  children: ReactNode
  className?: string
  /** Glass is for containers and chrome — never behind chart marks. */
  glass?: boolean
  padded?: boolean
  feature?: boolean
  glow?: 'accent' | 'gold'
}) {
  return (
    <section
      className={cx(
        'panel',
        feature
          ? 'chamfer chamfer-ring plate-gold corner-ticks'
          : 'rounded-xl border border-line',
        glass ? 'glass glass-edge' : 'bg-surface',
        glow === 'accent' && 'glow-accent',
        glow === 'gold' && 'glow-gold',
        !glow && 'shadow-card',
        padded && 'p-4 sm:p-5',
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
    <div className="panel-head -mx-4 -mt-4 mb-4 flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:-mx-5 sm:-mt-5 sm:px-5">
      <div className="flex min-w-0 gap-2.5">
        <span
          aria-hidden
          className="mt-0.5 h-4 w-0.5 shrink-0 rounded-full"
          style={{ background: 'var(--gold-grad)' }}
        />
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-tight text-primary sm:text-base">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs leading-snug text-muted">{subtitle}</p>
          ) : null}
        </div>
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
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="hud flex items-center gap-2 text-xs text-primary sm:text-sm">
        <span aria-hidden style={{ color: 'var(--gold)' }}>
          ◆
        </span>
        {children}
      </h2>
      {/* Hint wraps below the heading on narrow screens rather than squeezing
          the rule to nothing. */}
      {hint ? (
        <span className="order-last w-full text-[11px] text-muted sm:order-none sm:w-auto">
          {hint}
        </span>
      ) : null}
      <div className="rule-notch hidden flex-1 sm:block" />
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
  variant?: 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  type?: 'button' | 'submit'
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>) {
  // Primary and gold wear gradient faces with a gloss highlight — the single
  // most recognisable game-UI component treatment.
  const variants = {
    primary:
      'btn-gloss text-on-accent border-transparent shadow-md [background-image:var(--accent-grad)] hover:brightness-110',
    gold:
      'btn-gloss text-on-gold border-transparent shadow-md [background-image:var(--gold-grad)] hover:brightness-110',
    secondary:
      'bg-surface-2 text-primary hover:bg-surface-3 border-line-strong shadow-sm',
    ghost: 'bg-transparent text-secondary hover:bg-surface-2 border-transparent',
    danger:
      'bg-critical-soft text-critical-text hover:bg-critical-soft border-transparent',
  }
  return (
    <button
      type={type}
      className={cx(
        'chamfer-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap border font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        // Comfortable touch targets: >=36px tall at sm, >=40px at md, so these
        // stay tappable on a phone.
        size === 'sm'
          ? 'min-h-9 px-3 py-1.5 text-xs'
          : 'min-h-11 px-5 py-2.5 text-sm tracking-wide',
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
        'chamfer-sm inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-1 text-[11px] font-semibold',
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
  // Wide tables scroll inside their own container; the page itself never
  // scrolls horizontally.
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
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
        // Horizontal padding keeps adjacent columns from running together
        // ("₱750Semi-Annual"); the edge cells stay flush with the card.
        'sticky top-0 z-10 whitespace-nowrap border-b border-line-strong bg-surface px-3 pb-2.5 pt-1 text-xs font-semibold text-secondary first:pl-0 last:pr-0',
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
        'border-b border-line/60 px-3 py-2.5 text-secondary first:pl-0 last:pr-0',
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
