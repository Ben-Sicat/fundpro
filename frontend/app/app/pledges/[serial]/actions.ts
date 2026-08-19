'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth/auth'
import { permissionsFor } from '@/lib/auth/permissions'
import { backendEnabled } from '@/lib/api/client'
import { addPledgeNote, getPledge } from '@/lib/data'

/**
 * Append one caller remark to an application.
 *
 * ANY internal role may add a note — the owners were explicit that remarks are
 * free text anyone can contribute, not a privilege of the verification desk.
 *
 * `charity_viewer` is the one exception and is refused: that role belongs to
 * someone outside the agency, scoped to a single charity, who may never see
 * donor contact details — and a caller note routinely quotes exactly that.
 * Letting them write notes would also let them read the thread.
 */
export async function addNoteAction(serialNo: string, formData: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error('Not signed in.')

  if (session.user.role === 'charity_viewer') {
    throw new Error('Your role cannot add caller notes.')
  }

  const text = String(formData.get('text') ?? '').trim()
  if (!text) return
  if (text.length > 2000) throw new Error('Note is too long (2,000 characters max).')

  if (!(await getPledge(serialNo))) throw new Error('Unknown application.')

  await addPledgeNote({
    serialNo,
    author: session.user.name ?? 'Unknown',
    text,
  })
  revalidatePath(`/app/pledges/${serialNo}`)
  revalidatePath('/app', 'layout')
}

export interface CancellationState {
  error: string | null
  ok: boolean
}

/**
 * Record — or clear — a cancellation by hand.
 *
 * Bank Status Reports only carry the cancellations the BANK knows about.
 * Plenty arrive another way: the donor phones the office, the charity pulls a
 * campaign, a signature is withdrawn on the spot. Those need a date and a
 * reason against the pledge, and the reason has to survive the next import —
 * the service marks manual entries so recomputation cannot overwrite them.
 *
 * Needs `edit_reference`: this changes a reported figure (a cancelled pledge
 * leaves the realization numerator), so it is not a note anyone can write.
 */
export async function setCancellationAction(
  serialNo: string,
  _prev: CancellationState,
  formData: FormData,
): Promise<CancellationState> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Not signed in.' }

  const perms = permissionsFor({
    id: session.user.id,
    role: session.user.role,
    charityId: session.user.charityId,
    permissions: session.user.permissions,
  })
  if (!perms.includes('edit_reference')) {
    return { ok: false, error: 'Your role cannot change a cancellation.' }
  }
  if (!backendEnabled()) {
    return {
      ok: false,
      error: 'Recording a cancellation needs the processing service running.',
    }
  }

  const clearing = formData.get('intent') === 'clear'
  const cancellationDate = String(formData.get('cancellationDate') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim()

  if (!clearing) {
    if (!cancellationDate) return { ok: false, error: 'Pick a cancellation date.' }
    if (!reason) return { ok: false, error: 'Give a reason for the cancellation.' }
  }

  try {
    const { setCancellation } = await import('@/lib/data/remote')
    await setCancellation({
      serialNo,
      cancellationDate: clearing ? null : cancellationDate,
      reason,
    })
  } catch (error) {
    // The service's message names the problem ("cannot be cancelled before it
    // was signed up") without quoting donor data.
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, error: detail.replace(/^\S+ → \d+: /, '') }
  }

  revalidatePath(`/app/pledges/${serialNo}`)
  revalidatePath('/app', 'layout')
  return { ok: true, error: null }
}


/**
 * Record the outcome of a verification call.
 *
 * Verification is a quality gate, not a label: payroll can be configured to
 * require it before a pledge is payable, so this is the one manual edit on this
 * page that can move money. It therefore needs `edit_reference` — the same
 * permission as a cancellation — rather than being something any viewer can set.
 *
 * "Not reached" is a real outcome and is recorded as one. It clears any earlier
 * pass, because a stale tick outliving a failed follow-up call is exactly the
 * kind of thing that pays commission on a donor nobody could contact.
 */
export async function setVerificationAction(
  serialNo: string,
  _prev: CancellationState,
  formData: FormData,
): Promise<CancellationState> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Not signed in.' }

  const perms = permissionsFor({
    id: session.user.id,
    role: session.user.role,
    charityId: session.user.charityId,
    permissions: session.user.permissions,
  })
  if (!perms.includes('edit_reference')) {
    return { ok: false, error: 'Your role cannot record a verification call.' }
  }
  if (!backendEnabled()) {
    return {
      ok: false,
      error: 'Recording a call needs the processing service running.',
    }
  }

  const clearing = formData.get('intent') === 'clear'
  const calledOn = String(formData.get('calledOn') ?? '').trim()
  const reached = formData.get('reached') === 'yes'
  const method = String(formData.get('method') ?? 'phone').trim()

  if (!clearing && !calledOn) return { ok: false, error: 'Pick the date of the call.' }

  try {
    const { setVerification } = await import('@/lib/data/remote')
    await setVerification({
      serialNo,
      calledOn: clearing ? null : calledOn,
      reached: clearing ? false : reached,
      method,
    })
  } catch (error) {
    // The service names the problem ("cannot predate the sign-up") without
    // quoting donor data.
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, error: detail.replace(/^\S+ → \d+: /, '') }
  }

  revalidatePath(`/app/pledges/${serialNo}`)
  revalidatePath('/app', 'layout')
  return { ok: true, error: null }
}
