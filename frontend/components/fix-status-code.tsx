'use client'

/**
 * Fix an "unknown bank code" exception without leaving the page.
 *
 * The review queue used to be read-only: it told you a row was set aside and
 * left you to go and find a settings screen. For this one problem the remedy
 * is small and knowable — say what the code means — so it belongs next to the
 * row that is complaining about it.
 */
import { useState } from 'react'
import { Button, Input, Select } from '@/components/ui'

const CLASSIFICATIONS = [
  ['approved', 'Approved — the money was taken'],
  ['failed_retryable', 'Failed, bank will retry'],
  ['failed_final', 'Failed for good'],
  ['cancelled', 'Cancelled'],
  ['other', 'Something else'],
] as const

export function FixStatusCode({
  statusId,
  action,
}: {
  statusId: number
  action: (formData: FormData) => Promise<void>
}) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        Add status code
      </Button>
    )
  }

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-2 p-2"
    >
      <div>
        <label
          htmlFor={`desc-${statusId}`}
          className="mb-1 block text-[10px] font-medium text-secondary"
        >
          What code {statusId} means
        </label>
        <Input
          id={`desc-${statusId}`}
          name="description"
          placeholder="e.g. Chargeback"
          className="h-8 w-44 text-xs"
        />
      </div>
      <div>
        <label
          htmlFor={`cls-${statusId}`}
          className="mb-1 block text-[10px] font-medium text-secondary"
        >
          Treat it as
        </label>
        <Select id={`cls-${statusId}`} name="classification" defaultValue="failed_final">
          {CLASSIFICATIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <Button size="sm" variant="primary" type="submit">
        Save
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <p className="w-full text-[10px] leading-snug text-muted">
        Saving classifies the code. Re-upload the file to consolidate the rows
        that were held back — nothing is lost in the meantime.
      </p>
    </form>
  )
}
