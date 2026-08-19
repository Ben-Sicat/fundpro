'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth/auth'
import { permissionsFor } from '@/lib/auth/permissions'
import { backendEnabled } from '@/lib/api/client'

/** What the form can return to the client, so a failure is visible. */
export type SettingsState = { ok: boolean; message: string } | null

/**
 * Add or reclassify a bank status code.
 *
 * The same remedy the review queue offers inline, reachable from Settings for
 * the case where you already know a code is coming and would rather not wait
 * for a file to fail on it.
 *
 * Classification is what business logic branches on — never the raw id — so
 * adding a code here is genuinely all that is needed to make held-back rows
 * consolidate on the next upload.
 */
export async function addStatusCodeFromSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await auth()
  if (!session?.user) return { ok: false, message: 'Not signed in.' }

  const perms = permissionsFor({
    id: session.user.id,
    role: session.user.role,
    charityId: session.user.charityId,
    permissions: session.user.permissions,
  })
  if (!perms.includes('edit_reference')) {
    return { ok: false, message: 'Your role cannot change the status dictionary.' }
  }
  if (!backendEnabled()) {
    return { ok: false, message: 'This needs the processing service running.' }
  }

  // Validated here, not just by the input's type=number: a form can be
  // submitted with anything, and a NaN would reach the API as "null".
  const raw = String(formData.get('statusId') ?? '').trim()
  const statusId = Number(raw)
  if (!raw || !Number.isInteger(statusId) || statusId <= 0) {
    return { ok: false, message: 'Status ID must be a whole number, e.g. 61.' }
  }

  const description = String(formData.get('description') ?? '').trim()
  const classification = String(formData.get('classification') ?? 'other')

  try {
    const { upsertStatusCode } = await import('@/lib/data/remote')
    await upsertStatusCode({
      statusId,
      // Falling back to a placeholder rather than rejecting: the
      // classification is the part that changes behaviour, and a code with a
      // vague name still consolidates rows correctly.
      description: description || `Bank code ${statusId}`,
      classification,
    })
    // A classification change alters how every dashboard counts, not just this
    // page.
    revalidatePath('/app', 'layout')
    return {
      ok: true,
      message: `Code ${statusId} saved as ${classification.replace(/_/g, ' ')}. Re-upload any file that was held back on it.`,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, message: detail.replace(/^\/settings\/status-codes → \d+: /, '') }
  }
}
