'use client'

/**
 * Add a bank status code from Settings.
 *
 * Sibling to `FixStatusCode`, which does the same job from the review queue.
 * The difference is that this one has no id to work from: the queue knows which
 * code complained, whereas here you are entering one ahead of time. That is why
 * it asks for the id and why it reports back — with no failing row in front of
 * you, a silent save is indistinguishable from a dead button.
 */
import { useActionState } from 'react'
import { Button, Input, Label, Select } from '@/components/ui'
import type { SettingsState } from '@/app/app/settings/actions'

const CLASSIFICATIONS = [
  ['approved', 'Approved — the money was taken'],
  ['failed_retryable', 'Failed, bank will retry'],
  ['failed_final', 'Failed for good'],
  ['cancelled', 'Cancelled'],
  ['other', 'Something else'],
] as const

export function AddStatusCode({
  action,
}: {
  action: (prev: SettingsState, formData: FormData) => Promise<SettingsState>
}) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <details className="group">
      <summary className="rounded-[var(--r-sm)] inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 border border-line-strong bg-surface-2 px-3 text-xs font-semibold text-primary transition-colors hover:bg-surface-3">
        <span aria-hidden className="transition-transform group-open:rotate-45">
          +
        </span>
        Add code
      </summary>

      <form action={formAction} className="mt-3 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="statusId">Status ID</Label>
            <Input
              id="statusId"
              name="statusId"
              type="number"
              min={1}
              step={1}
              required
              placeholder="61"
              className="w-24"
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor="description">What it means</Label>
            <Input
              id="description"
              name="description"
              placeholder="e.g. Billing Failed (NDNH - To repair)"
            />
          </div>
          <div>
            <Label htmlFor="classification">Treat it as</Label>
            <Select id="classification" name="classification" defaultValue="failed_final">
              {CLASSIFICATIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Save code'}
          </Button>
        </div>

        {state ? (
          <p
            aria-live="polite"
            className={`rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
              state.ok
                ? 'bg-accent-soft text-accent'
                : 'bg-critical-soft text-critical-text'
            }`}
          >
            {state.message}
          </p>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted">
            Classification is what the dashboards count on — the raw ID is never
            branched on. Saving a code is all that is needed for rows held back
            on it to consolidate the next time the file is uploaded.
          </p>
        )}
      </form>
    </details>
  )
}
