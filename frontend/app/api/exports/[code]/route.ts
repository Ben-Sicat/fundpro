import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { permissionsFor } from '@/lib/auth/permissions'
import { API_URL, backendEnabled } from '@/lib/api/client'

/**
 * Download a generated report.
 *
 * A route handler rather than a Server Action because the response is a FILE:
 * actions return data, and streaming a spreadsheet back through one means
 * buffering it into a payload the browser cannot save directly.
 *
 * The service does the generating. This proxies it so the API key never
 * reaches the browser and so the download is authorised by the user's own
 * session rather than by possession of a URL.
 */

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Query parameters the service understands, passed straight through. */
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
  'upload_id',
] as const

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params

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

  const target = new URL(`${API_URL}/exports/${encodeURIComponent(code)}`)
  for (const key of FILTERS) {
    const value = request.nextUrl.searchParams.get(key)
    if (value) target.searchParams.set(key, value)
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.PREPROCESS_API_KEY ?? ''}`,
  }
  const asOf = process.env.PREPROCESS_AS_OF?.trim()
  if (asOf) headers['X-As-Of'] = asOf
  headers['X-Actor'] = session.user.name ?? session.user.email ?? 'unknown'
  // A charity viewer's export is scoped by the service, not by the UI.
  if (session.user.role === 'charity_viewer' && session.user.charityId) {
    headers['X-Charity-Scope'] = session.user.charityId
  }

  const upstream = await fetch(target, { method: 'POST', headers, cache: 'no-store' })

  if (!upstream.ok) {
    let detail = upstream.statusText
    try {
      detail = ((await upstream.json()) as { detail?: string }).detail ?? detail
    } catch {
      // Non-JSON error body; the status text will do.
    }
    return NextResponse.json({ error: detail }, { status: upstream.status })
  }

  // Pass the service's own filename through so the saved file is named the
  // way the export log records it.
  const disposition =
    upstream.headers.get('content-disposition') ??
    `attachment; filename="${code}.xlsx"`

  return new NextResponse(await upstream.arrayBuffer(), {
    headers: {
      'Content-Type': XLSX,
      'Content-Disposition': disposition,
      'X-Row-Count': upstream.headers.get('x-row-count') ?? '',
    },
  })
}
