/**
 * How many goes it took the bank to actually take the money.
 *
 * The realization rate says what fraction of sign-ups ever bill. This says
 * what that cost in attempts, per donor — the question operations asks when
 * deciding who to chase and which cards to ask the donor to replace. A pledge
 * that billed on the fourth try is a very different record from one that
 * billed first time, and until now both just read "Realized".
 *
 * Drawn as pips rather than a sentence so a row of them can be scanned down a
 * column: failures then, if it got there, the successful one.
 */
import { cx } from '@/components/ui'

/** Beyond this the pips stop being countable and a figure reads better. */
const MAX_PIPS = 8

export function RetryTicker({
  attempts,
  failedAttempts,
  attemptsToSuccess,
  className,
}: {
  attempts: number
  failedAttempts: number
  attemptsToSuccess: number | null
  className?: string
}) {
  if (attempts === 0) {
    return <span className={cx('text-xs text-muted', className)}>Not yet sent</span>
  }

  const billed = attemptsToSuccess !== null
  // Failures BEFORE the success are the retries worth showing. A failure
  // after it is a clawback question, not a retry.
  const retries = billed ? attemptsToSuccess - 1 : failedAttempts
  const summary = billed
    ? retries === 0
      ? 'Billed first time'
      : `Billed on attempt ${attemptsToSuccess}`
    : `${failedAttempts} failed, not billed yet`

  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <span className="inline-flex items-center gap-1" aria-hidden>
        {Array.from({ length: Math.min(retries, MAX_PIPS) }, (_, i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-warning"
            title="Failed attempt"
          />
        ))}
        {retries > MAX_PIPS ? (
          <span className="tabular text-[10px] text-muted">+{retries - MAX_PIPS}</span>
        ) : null}
        {billed ? (
          <span
            className={cx(
              'size-2 rounded-full bg-good',
              // A gap after the failures so the successful attempt reads as
              // the end of the run rather than one more of them.
              retries > 0 && 'ml-1',
            )}
            title="Billed"
          />
        ) : null}
      </span>
      <span className="text-xs text-secondary">{summary}</span>
    </span>
  )
}
