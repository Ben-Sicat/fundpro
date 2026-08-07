'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/auth'
import { permissionsFor } from '@/lib/auth/permissions'
import {
  createFundraiser,
  updateFundraiser,
  validateFundraiser,
  type FundraiserInput,
} from '@/lib/data'

/**
 * Managing the roster is reference-data editing, so it needs `edit_reference`
 * (admin and operations hold it by default). Checked here rather than only in
 * the UI — hiding a form is not access control.
 */
async function assertCanEditTeam() {
  const session = await auth()
  if (!session?.user) throw new Error('Not signed in.')
  const perms = permissionsFor({
    id: session.user.id,
    role: session.user.role,
    charityId: session.user.charityId,
    permissions: session.user.permissions,
  })
  if (!perms.includes('edit_reference')) {
    throw new Error('Your role cannot change the team roster.')
  }
}

export interface TeamFormState {
  errors: Record<string, string>
  values: FundraiserInput | null
}

function readForm(formData: FormData): FundraiserInput {
  const active = formData.get('status') !== 'retired'
  const endDate = String(formData.get('endDate') ?? '').trim()
  return {
    name: String(formData.get('name') ?? '').trim(),
    code: String(formData.get('code') ?? '').trim(),
    // Multiple leaders: a fundraiser can report to more than one.
    leaderNames: formData.getAll('leaderNames').map(String).filter(Boolean),
    active,
    startDate: String(formData.get('startDate') ?? '').trim(),
    // An active person never carries an end date, whatever the field held
    // before the status was switched back.
    endDate: active ? null : endDate || null,
  }
}

export async function createFundraiserAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  await assertCanEditTeam()
  const values = readForm(formData)

  const errors = validateFundraiser(values)
  if (Object.keys(errors).length) return { errors, values }

  await createFundraiser(values)
  revalidatePath('/app/team')
  // Land on the roster with the new joiner visible rather than leaving a
  // filled-in form on screen that looks unsaved.
  redirect('/app/team?added=' + encodeURIComponent(values.code))
}

export async function updateFundraiserAction(
  code: string,
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  await assertCanEditTeam()
  const values = readForm(formData)

  const errors = validateFundraiser(values, code)
  if (Object.keys(errors).length) return { errors, values }

  await updateFundraiser(code, values)
  revalidatePath('/app/team')
  revalidatePath(`/app/team/${code}`)
  redirect('/app/team?saved=' + encodeURIComponent(values.code))
}
