'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth/auth'
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
}
