import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { permissionsFor } from '@/lib/auth/permissions'
import { API_URL, backendEnabled } from '@/lib/api/client'

/**
 * Download a custom export — the caller's own choice of columns.
 *
 * A route handler for the same reason as the template downloads: the response
 * is a FILE, and the service does the generating so the API key never reaches
 * the browser.
 *
 * POST rather than GET because the column list is a body, not a query string.
 * Putting forty column keys in a URL would also risk them landing in an access
 * log, and one of them is literally called `donorEmail`.
 */

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const FILTERS = [
  'q',
  'charity',
  'status',
  'fundraiser',
  'site',
  'leader',
  'verified',
  'basis',
  'from',
  'to',
] as const

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const perms = permissionsFor({
    id: session.user.id,
    role: session.user.role,
    charityId: session.user.charityId,
    permissions: session.user.permissions,
  })
  if (!perms.includes('run_exports')) {
    return NextResponse.json(
      { error: 'Your role cannot generate exports.' },
      { status: 403 },
    )
  }

  if (!backendEnabled()) {
    return NextResponse.json(
      { error: 'Generating reports needs the processing service running.' },
      { status: 503 },
    )
  }

  const body = (await request.json()) as { columns?: unknown; name?: unknown }
  const columns = Array.isArray(body.columns) ? body.columns.map(String) : []
  if (columns.length === 0) {
    return NextResponse.json({ error: 'Choose at least one column.' }, { status: 422 })
  }

  const target = new URL(`${API_URL}/exports/custom/build`)
  for (const key of FILTERS) {
    const value = request.nextUrl.searchParams.get(key)
    if (value) target.searchParams.set(key, value)
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.PREPROCESS_API_KEY ?? ''}`,
    'Content-Type': 'application/json',
    'X-Actor': session.user.name ?? session.user.email ?? 'unknown',
  }
  const asOf = process.env.PREPROCESS_AS_OF?.trim()
  if (asOf) headers['X-As-Of'] = asOf

  // The service re-checks all of this. Sending the role's capability lets it
  // refuse a column the signed-in user may not export even if the UI offered
  // it by mistake — and a charity scope overrides both, at the service layer.
  if (session.user.role === 'charity_viewer' && session.user.charityId) {
    headers['X-Charity-Scope'] = session.user.charityId
  } else {
    if (perms.includes('see_pii')) headers['X-Allow-Pii'] = 'true'
    if (perms.includes('see_payment')) headers['X-Allow-Payment'] = 'true'
  }

  const upstream = await fetch(target, {
    method: 'POST',
    headers,
    cache: 'no-store',
    body: JSON.stringify({
      columns,
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Custom export',
    }),
  })

  if (!upstream.ok) {
    let detail = upstream.statusText
    try {
      detail = ((await upstream.json()) as { detail?: string }).detail ?? detail
    } catch {
      // Non-JSON error body; the status text will do.
    }
    return NextResponse.json({ error: detail }, { status: upstream.status })
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    headers: {
      'Content-Type': XLSX,
      'Content-Disposition':
        upstream.headers.get('content-disposition') ??
        'attachment; filename="custom.xlsx"',
      'X-Row-Count': upstream.headers.get('x-row-count') ?? '',
    },
  })
}
