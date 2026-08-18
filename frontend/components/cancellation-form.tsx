'use client'

/**
 * Record a cancellation by hand, with a reason.
 *
 * Bank Status Reports only carry the cancellations the bank knows about. The
 * office hears about the rest — the donor phones, the charity pulls a
 * campaign, a signature is withdrawn at the site. Before this there was
 * nowhere to put those, so they either went unrecorded or someone edited a
 * spreadsheet the platform never saw.
 *
 * The reason is required, not optional. "Cancelled" on its own is not
 * something anyone can act on three months later, and capturing the reason is
 * the whole point of recording it here rather than waiting for the bank.
 */
import { useActionState, useState } from 'react'
import { Badge, Button, Input, Label, Textarea } from '@/components/ui'
import type { CancellationState } from '@/app/app/pledges/[serial]/actions'

const EMPTY: CancellationState = { ok: false, error: null }

export function CancellationForm({
  cancellationDate,
  cancellationReason,
  source,
  cancelledBy,
  formattedDate,
  action,
  canEdit,
}: {
  cancellationDate: string | null
  cancellationReason: string | null
  source: 'bank' | 'manual' | null
  cancelledBy: string | null
  /** Pre-formatted server-side — no function props across the boundary. */
  formattedDate: string
  action: (prev: CancellationState, formData: FormData) => Promise<CancellationState>
  canEdit: boolean
}) {
  const [state, submit, pending] = useActionState(action, EMPTY)
  const [open, setOpen] = useState(false)

  // A bank cancellation is a fact in the billing history, not an entry to
  // edit. Correcting one means importing a corrected status file.
  const fromBank = source === 'bank'

  if (cancellationDate && !open) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabular text-sm font-medium text-primary">
            {formattedDate}
          </span>
          <Badge tone={fromBank ? 'neutral' : 'warning'}>
            {fromBank ? 'From the bank' : 'Recorded by hand'}
          </Badge>
        </div>
        {cancellationReason ? (
          <p className="text-[13px] leading-snug text-secondary">
            {cancellationReason}
          </p>
        ) : null}
        {cancelledBy ? (
          <p className="text-[11px] text-muted">Recorded by {cancelledBy}</p>
        ) : null}

        {canEdit && !fromBank ? (
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => setOpen(true)}>
              Change
            </Button>
            <form action={submit}>
              <input type="hidden" name="intent" value="clear" />
              <Button size="sm" variant="ghost" type="submit" disabled={pending}>
                Remove
              </Button>
            </form>
          </div>
        ) : null}
        {fromBank ? (
          <p className="text-[11px] leading-snug text-muted">
            This came from the bank&rsquo;s own status file. To correct it,
            import a corrected Status Report.
          </p>
        ) : null}
        {state.error ? (
          <p className="text-xs text-critical-text">{state.error}</p>
        ) : null}
      </div>
    )
  }

  if (!canEdit) {
    return <p className="text-sm text-muted">Not cancelled.</p>
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted">Not cancelled.</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          Record a cancellation
        </Button>
      </div>
    )
  }

  return (
    <form action={submit} className="space-y-3">
      <div>
        <Label htmlFor="cancellationDate">Cancellation date</Label>
        <Input
          id="cancellationDate"
          name="cancellationDate"
          type="date"
          defaultValue={cancellationDate ?? ''}
          required
        />
      </div>
      <div>
        <Label htmlFor="reason">Why</Label>
        <Textarea
          id="reason"
          name="reason"
          rows={2}
          required
          maxLength={500}
          defaultValue={cancellationReason ?? ''}
          placeholder="e.g. Donor phoned the office to stop the monthly gift"
        />
      </div>

      {state.error ? (
        <p className="text-xs text-critical-text">{state.error}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save cancellation'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] leading-snug text-muted">
        A cancelled pledge stops counting towards the realization rate, and any
        commission already paid on it becomes a clawback candidate.
      </p>
    </form>
  )
}
