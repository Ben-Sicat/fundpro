import { Badge } from '@/components/ui'
import type { Pledge } from '@/lib/types'

/**
 * Derives the display status from the consolidated record.
 *
 * Every state carries a word, not just a colour — status colour alone is never
 * the signal.
 */
export function StatusBadge({ pledge }: { pledge: Pledge }) {
  if (pledge.cancelled) {
    return (
      <Badge tone="critical" dot>
        Cancelled
      </Badge>
    )
  }
  if (pledge.debitDate) {
    return (
      <Badge tone="good" dot>
        Realized
      </Badge>
    )
  }
  switch (pledge.currentClassification) {
    case 'failed_retryable':
      return (
        <Badge tone="warning" dot>
          Retrying · {pledge.attempts}
        </Badge>
      )
    case 'failed_final':
      return (
        <Badge tone="critical" dot>
          Failed
        </Badge>
      )
    default:
      return (
        <Badge tone="neutral" dot>
          {pledge.submittedAt ? 'Awaiting bank' : 'Not submitted'}
        </Badge>
      )
  }
}
