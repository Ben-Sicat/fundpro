'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth/auth'
import { permissionsFor } from '@/lib/auth/permissions'
import { backendEnabled } from '@/lib/api/client'
import { uploadWorkbook } from '@/lib/data/remote'
import type { UploadState } from '@/lib/api/upload-state'

export type { UploadState } from '@/lib/api/upload-state'

/**
 * Consolidate an uploaded workbook.
 *
 * Importing is an operations task, so it needs `edit_reference` — the same
 * permission as editing the roster. Checked here rather than only in the UI.
 */
export async function uploadAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const session = await auth()
  if (!session?.user) return { ok: false, message: 'Not signed in.' }

  const perms = permissionsFor({
    id: session.user.id,
    role: session.user.role,
    charityId: session.user.charityId,
    permissions: session.user.permissions,
  })
  if (!perms.includes('edit_reference')) {
    return { ok: false, message: 'Your role cannot import files.' }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose a file first.' }
  }
  if (!backendEnabled()) {
    // Honest rather than a fake success: with no service configured there is
    // nothing to consolidate into.
    return {
      ok: false,
      message: 'Import needs the processing service running.',
      detail: 'Set PREPROCESS_API_URL and PREPROCESS_API_KEY, then reload.',
    }
  }

  try {
    const result = await uploadWorkbook(file)
    const { upload, impact } = result
    const kind = upload.sourceType === 'apps_tracker' ? 'Apps Tracker' : 'Status Report'

    const parts = [
      `${kind} · ${upload.rowCount} rows read`,
      `${upload.matchedCount} matched`,
    ]
    if (impact.newPledges) {
      // A bank file can only create PROVISIONAL applications — no email, no
      // site, no fundraiser. Naming that here stops anyone reading them as
      // complete records.
      parts.push(
        upload.sourceType === 'apps_tracker'
          ? `${impact.newPledges} new applications`
          : `${impact.newPledges} provisional applications created`,
      )
    }
    if (impact.newlyApproved) parts.push(`${impact.newlyApproved} newly approved`)
    if (impact.newlyRetrying) parts.push(`${impact.newlyRetrying} now retrying`)
    if (upload.exceptionCount) parts.push(`${upload.exceptionCount} set aside for review`)

    // An import touches every figure on the site, so invalidate the whole
    // /app subtree rather than naming three pages and leaving the rest stale.
    revalidatePath('/app', 'layout')

    // A file the service READ fine but matched nothing is not a success, and
    // a green banner over "0 matched" reads as one. The usual cause is the
    // applications for that period not being loaded yet.
    if (upload.matchedCount === 0 && upload.exceptionCount > 0) {
      return {
        ok: false,
        message: `${upload.filename}: nothing could be matched.`,
        detail:
          `${upload.rowCount} rows read, all set aside for review. ` +
          'Usually this means the Apps Tracker for that period has not been ' +
          'imported yet, so there are no applications for these rows to attach to.',
      }
    }

    return { ok: true, message: `${upload.filename} consolidated.`, detail: parts.join(' · ') }
  } catch (error) {
    // The service's own message is safe to surface — it names the problem
    // ("not a readable .xlsx workbook") without quoting file contents.
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      message: 'That file could not be imported.',
      detail: detail.replace(/^\/uploads → \d+: /, ''),
    }
  }
}


/**
 * Mark an import exception as dealt with.
 *
 * Resolving does not re-import anything — it records that a human has looked
 * at the row and decided. Re-uploading the corrected file is what actually
 * consolidates it.
 */
export async function resolveExceptionAction(id: string): Promise<void> {
  const session = await auth()
  if (!session?.user) throw new Error('Not signed in.')

  const perms = permissionsFor({
    id: session.user.id,
    role: session.user.role,
    charityId: session.user.charityId,
    permissions: session.user.permissions,
  })
  if (!perms.includes('edit_reference')) {
    throw new Error('Your role cannot resolve import exceptions.')
  }
  if (!backendEnabled()) return

  const { resolveException } = await import('@/lib/data/remote')
  await resolveException(id)
  revalidatePath('/app', 'layout')
}

/**
 * Teach the service a bank code it did not recognise, from the review queue.
 *
 * This is the "fix it here" path: the reason a row was set aside is a code
 * nobody has classified, and classifying it is the whole remedy. Re-uploading
 * the file afterwards consolidates the rows that were held back.
 */
export async function addStatusCodeAction(
  statusId: number,
  formData: FormData,
): Promise<void> {
  const session = await auth()
  if (!session?.user) throw new Error('Not signed in.')

  const perms = permissionsFor({
    id: session.user.id,
    role: session.user.role,
    charityId: session.user.charityId,
    permissions: session.user.permissions,
  })
  if (!perms.includes('edit_reference')) {
    throw new Error('Your role cannot change the status dictionary.')
  }
  if (!backendEnabled()) return

  const classification = String(formData.get('classification') ?? 'other')
  const description = String(formData.get('description') ?? '').trim()

  const { upsertStatusCode } = await import('@/lib/data/remote')
  await upsertStatusCode({
    statusId,
    description: description || `Bank code ${statusId}`,
    classification,
  })
  revalidatePath('/app', 'layout')
}
