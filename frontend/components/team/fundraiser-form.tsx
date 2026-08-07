'use client'

/**
 * Add / edit one fundraiser.
 *
 * Client-side only so validation errors can come back without losing what was
 * typed — a re-keyed form after a rejected save is the fastest way to make
 * someone stop using a tool. The server action re-validates regardless; this
 * is convenience, not enforcement.
 */
import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Button, Input, Label, Select, cx } from '@/components/ui'
import type { TeamFormState } from '@/app/app/team/actions'

export interface FundraiserFormValues {
  name: string
  code: string
  leaderNames: string[]
  active: boolean
  startDate: string
  endDate: string | null
}

const EMPTY: TeamFormState = { errors: {}, values: null }

export function FundraiserForm({
  action,
  leaders,
  initial,
  submitLabel,
  cancelHref = '/app/team',
}: {
  action: (state: TeamFormState, formData: FormData) => Promise<TeamFormState>
  leaders: string[]
  initial?: FundraiserFormValues
  submitLabel: string
  cancelHref?: string
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY)

  // Prefer what the server sent back after a failed save, so a correction
  // starts from what the person typed rather than from the original record.
  const v = state.values ?? initial
  const [retired, setRetired] = useState(initial ? !initial.active : false)
  const err = state.errors

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name" error={err.name}>
          <Input
            id="name"
            name="name"
            defaultValue={v?.name ?? ''}
            required
            autoComplete="off"
            placeholder="e.g. Almara Pasco"
          />
        </Field>

        <Field
          label="ID number"
          htmlFor="code"
          error={err.code}
          hint="The agency's own number for this person. Must be unique."
        >
          <Input
            id="code"
            name="code"
            defaultValue={v?.code ?? ''}
            required
            autoComplete="off"
            placeholder="e.g. FR011"
          />
        </Field>
      </div>

      {/* Checkboxes, not a single select: a fundraiser can report to more than
          one leader, and the schema models that as an effective-dated m2m. */}
      <fieldset>
        <legend className="mb-1.5 block text-xs font-medium text-secondary">
          Reports to
        </legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {leaders.map((leader) => (
            <label
              key={leader}
              className="flex cursor-pointer items-center gap-2 text-sm text-primary"
            >
              <input
                type="checkbox"
                name="leaderNames"
                value={leader}
                defaultChecked={v?.leaderNames.includes(leader) ?? false}
                className="size-4 accent-[var(--accent)]"
              />
              {leader}
            </label>
          ))}
        </div>
        {err.leaderNames ? <ErrorText>{err.leaderNames}</ErrorText> : null}
        <p className="mt-1.5 text-[11px] text-muted">
          Tick more than one if they split their time between teams.
        </p>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Status" htmlFor="status">
          <Select
            id="status"
            name="status"
            defaultValue={v && !v.active ? 'retired' : 'active'}
            onChange={(e) => setRetired(e.target.value === 'retired')}
            className="w-full py-2 text-sm"
          >
            <option value="active">Active</option>
            <option value="retired">Retired</option>
          </Select>
        </Field>

        <Field label="Start date" htmlFor="startDate" error={err.startDate}>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={v?.startDate ?? ''}
            required
          />
        </Field>

        <Field
          label="End date"
          htmlFor="endDate"
          error={err.endDate}
          hint={retired ? 'Required for a retired fundraiser.' : 'Leave blank while active.'}
        >
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={v?.endDate ?? ''}
            disabled={!retired}
            required={retired}
            className={cx(!retired && 'opacity-50')}
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <Link href={cancelHref}>
          <Button variant="ghost" size="sm">
            Cancel
          </Button>
        </Link>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!error && hint ? <p className="mt-1.5 text-[11px] text-muted">{hint}</p> : null}
    </div>
  )
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-1.5 text-[11px] font-medium text-critical-text">
      {children}
    </p>
  )
}
