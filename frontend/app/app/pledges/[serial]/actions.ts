'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth/auth'
import { permissionsFor } from '@/lib/auth/permissions'
import { addPledgeNote, getPledge } from '@/lib/data'

/**
 * Append one caller remark to an application.
 *
 * Notes ride with donor contact details: they exist so the verification desk
 * can record what a donor said on the phone, so they are gated by the same
 * `see_pii` permission as the rest of the donor card. A charity_viewer can
 * never hold that permission.
 */
export async function addNoteAction(serialNo: string, formData: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error('Not signed in.')

  const perms = permissionsFor({
    id: session.user.id,
    role: session.user.role,
    charityId: session.user.charityId,
    permissions: session.user.permissions,
  })
  if (!perms.includes('see_pii')) {
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
}
