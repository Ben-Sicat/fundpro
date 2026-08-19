'use client'

/**
 * Record a verification call — the quality gate — against a pledge.
 *
 * Somebody phones the donor and establishes they are a real person who knows
 * they signed up. MASTER_SPEC 4.2 lists this as confirmed, and payroll can be
 * configured to require it before a pledge is payable, so this is the one manual
 * edit on the page capable of moving money. It is gated on `edit_reference` for
 * that reason, and the service audits every change.
 *
 * "Not reached" is offered as a first-class outcome. A call that was made and
 * failed is a different fact from never having called: it is what tells the desk
 * this one has already been chased. Recording it clears any earlier pass,
 * because a stale tick outliving a failed follow-up is how commission gets paid
 * on a donor nobody can contact.
 */
import { useActionState, useState } from 'react'
import { Badge, Button, Input, Label, Select } from '@/components/ui'
import type { CancellationState } from '@/app/app/pledges/[serial]/actions'

const EMPTY: CancellationState = { ok: false, error: null }

export function VerificationForm({
  verified,
  verifiedBy,
  formattedDate,
  today,
  action,
  canEdit,
}: {
  verified: boolean
  verifiedBy: string | null
  /** Pre-formatted server-side — no function props across the boundary. */
  formattedDate: string
  /** The service's idea of today, so the default matches its validation. */
  today: string
  action: (prev: CancellationState, formData: FormData) => Promise<CancellationState>
  canEdit: boolean
}) {
  const [state, submit, pending] = useActionState(action, EMPTY)
  const [open, setOpen] = useState(false)

  if (verified && !open) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="good" dot>
            Verified
          </Badge>
          <span className="text-xs text-secondary">
            {formattedDate}
            {verifiedBy ? ` · ${verifiedBy}` : ''}
          </span>
          {canEdit ? (
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
              Change
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning" dot>
          Not verified
        </Badge>
        {canEdit ? (
          <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
            ☎ Record verification call
          </Button>
        ) : (
          <span className="text-xs text-muted">Your role cannot record a call.</span>
        )}
      </div>
    )
  }

  return (
    <form action={submit} className="space-y-3 rounded-lg border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="calledOn">Date of the call</Label>
          <Input
            id="calledOn"
            name="calledOn"
            type="date"
            defaultValue={today}
            max={today}
            required
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="reached">Outcome</Label>
          <Select id="reached" name="reached" defaultValue="yes">
            <option value="yes">Donor confirmed</option>
            <option value="no">Called, could not reach them</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="method">How</Label>
          <Select id="method" name="method" defaultValue="phone">
            <option value="phone">Phone</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
            <option value="in_person">In person</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save call'}
        </Button>
        {verified ? (
          // Clearing exists for a call logged against the wrong pledge —
          // the same escape hatch the cancellation form has.
          <Button
            type="submit"
            name="intent"
            value="clear"
            variant="ghost"
            size="sm"
            disabled={pending}
          >
            Clear verification
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      {state.error ? (
        <p aria-live="polite" className="text-[11px] leading-relaxed text-critical-text">
          {state.error}
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-muted">
          Verification can gate payroll, so every change here is audited against
          your name.
        </p>
      )}
    </form>
  )
}
