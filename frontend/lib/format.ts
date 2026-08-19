/**
 * Formatting helpers.
 *
 * All of these are deterministic and locale-pinned ('en-PH' / UTC). Relying on
 * the runtime's default locale or timezone would make the server and client
 * render different strings and trigger hydration mismatches.
 */

const CURRENCY_SYMBOL: Record<string, string> = { PHP: '₱', MYR: 'RM' }

export function money(value: number, currency = 'PHP'): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? ''
  return `${symbol}${value.toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

/** Compact money for stat tiles: ₱1.02M, ₱812K, ₱870. */
export function moneyCompact(value: number, currency = 'PHP'): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? ''
  if (Math.abs(value) >= 1_000_000)
    return `${symbol}${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `${symbol}${Math.round(value / 1_000)}K`
  // Round: an average is a float, and ₱869.6428571428571 is not a figure.
  return `${symbol}${Math.round(value).toLocaleString('en-PH')}`
}

export function count(value: number): string {
  return value.toLocaleString('en-PH')
}

export function percent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`
}

/** Percentage points, signed — for deltas on a rate. */
export function points(fraction: number, digits = 1): string {
  const v = fraction * 100
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}pp`
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** '2026-07-08' → '8 Jul 2026'. */
export function date(value: string | null | undefined): string {
  if (!value) return '—'
  // Tolerate a full timestamp. Without this the day part parses as
  // Number('17T19:08:00Z') → NaN and the function falls through to printing
  // the raw ISO string at the user, which is how '2026-08-17T19:08:00.302780Z'
  // ended up on the uploads page.
  const [y, m, d] = value.split('T')[0].split('-').map(Number)
  if (!y || !m || !d) return value
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** '2026-07-08T09:42:00Z' → '8 Jul 2026 · 09:42'. Date-only input degrades to date(). */
export function dateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const [d, t] = value.split('T')
  const hm = t?.slice(0, 5)
  return hm ? `${date(d)} · ${hm}` : date(d)
}

/** '2026-07-08' → '8 Jul'. */
export function dateShort(value: string | null | undefined): string {
  if (!value) return '—'
  const [, m, d] = value.split('-').map(Number)
  if (!m || !d) return value
  return `${d} ${MONTHS[m - 1]}`
}

/** Whole days between an ISO date and the fixed reference 'today'. */
export function daysAgo(value: string | null | undefined, today = '2026-07-27'): number | null {
  if (!value) return null
  return Math.round(
    (new Date(today).getTime() - new Date(value).getTime()) / 86400000,
  )
}

export function age(dob: string, today = '2026-07-27'): number {
  return Math.floor(
    (new Date(today).getTime() - new Date(dob).getTime()) / (365.25 * 86400000),
  )
}

/** 'MMYY' → 'MM/YY', preserving the leading zero. */
export function expiry(mmyy: string): string {
  return mmyy.length === 4 ? `${mmyy.slice(0, 2)}/${mmyy.slice(2)}` : mmyy
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}


/**
 * Today's date in the operating timezone, as `YYYY-MM-DD`.
 *
 * Both countries the agency works in are UTC+8, and the service validates
 * "not in the future" against Manila for the same reason: at 07:00 local it is
 * still yesterday in UTC, so a UTC-derived default would have the server reject
 * a same-day morning entry. Never use `new Date().toISOString()` for a date
 * input's default here — that is the UTC date.
 */
export function operatingToday(): string {
  // en-CA formats as YYYY-MM-DD, which is what a date input wants.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
