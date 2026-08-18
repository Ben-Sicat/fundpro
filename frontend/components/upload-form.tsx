'use client'

/**
 * The import dropzone.
 *
 * A plain file input styled as a drop target: no drag-and-drop library, and it
 * still works if JavaScript is slow to arrive, because it is a real form
 * posting to a Server Action.
 */
import { useActionState, useRef, useState } from 'react'
import { Button, cx } from '@/components/ui'
import type { UploadState } from '@/lib/api/upload-state'

const EMPTY: UploadState = { ok: false, message: '' }

export function UploadForm({
  action,
  enabled,
}: {
  action: (state: UploadState, formData: FormData) => Promise<UploadState>
  enabled: boolean
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY)
  const input = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const [chosen, setChosen] = useState<string>('')

  return (
    <form ref={form} action={formAction} className="contents">
      <input
        ref={input}
        type="file"
        name="file"
        accept=".xlsx,.xlsm"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          setChosen(file?.name ?? '')
          // Submit on choose: an extra "now upload it" click is a step nobody
          // wants when the intent was obvious.
          if (file) form.current?.requestSubmit()
        }}
      />

      <div className="flex flex-wrap justify-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={pending || !enabled}
          onClick={() => input.current?.click()}
        >
          {pending ? 'Consolidating…' : 'Choose file'}
        </Button>
        <Button variant="ghost" size="sm" type="button" disabled title="Coming soon">
          View column mapping
        </Button>
      </div>

      {chosen && pending ? (
        <p className="text-[11px] text-muted">Reading {chosen}…</p>
      ) : null}

      {state.message ? (
        <div
          role="status"
          className={cx(
            'w-full max-w-xl rounded-lg border px-3 py-2 text-left text-xs',
            state.ok
              ? 'border-line bg-good-soft text-good-text'
              : 'border-line bg-critical-soft text-critical-text',
          )}
        >
          <p className="font-semibold">{state.message}</p>
          {state.detail ? (
            <p className="mt-0.5 font-normal opacity-90">{state.detail}</p>
          ) : null}
        </div>
      ) : null}

      {!enabled ? (
        <p className="text-[11px] text-muted">
          Running on sample data — the processing service is not connected.
        </p>
      ) : null}
    </form>
  )
}
