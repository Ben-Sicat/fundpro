import 'server-only'

import { z } from 'zod'

/**
 * HTTP client for the Python preprocessing service.
 *
 * Two rules this file exists to enforce:
 *
 * 1. **Every response is validated with Zod.** The service is a separate
 *    deployable; its payload is untrusted input. An unvalidated `any` flowing
 *    into a component fails at render with a stack trace nobody can read,
 *    whereas a schema failure names the field.
 * 2. **Charity scoping travels with the request.** A `charity_viewer`'s scope
 *    is sent as a header the backend enforces, so the restriction is real
 *    rather than a UI convention.
 */

const RAW_URL = process.env.PREPROCESS_API_URL?.trim() ?? ''
export const API_URL = RAW_URL.replace(/\/+$/, '')
const API_KEY = process.env.PREPROCESS_API_KEY?.trim() ?? ''

/**
 * Whether to talk to the API at all.
 *
 * Deliberately NOT named `useBackend`: the `use` prefix makes eslint treat it
 * as a React hook and reject every call site.
 *
 * Unset means the app runs on its mock dataset exactly as before — that is
 * what keeps local development and the test suite working with no backend
 * running, and it is why wiring this up cannot break anything that exists.
 */
export function backendEnabled(): boolean {
  return Boolean(API_URL && API_KEY)
}

/**
 * A fixed "today" for demos against a static dataset.
 *
 * The sample files are from July 2026. Without this the dashboards compute
 * against the real clock and every chart is empty, which looks like a bug.
 */
const AS_OF = process.env.PREPROCESS_AS_OF?.trim() ?? ''

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(`${path} → ${status}: ${message}`)
    this.name = 'ApiError'
  }
}

async function headers(): Promise<Record<string, string>> {
  const out: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
    Accept: 'application/json',
  }
  if (AS_OF) out['X-As-Of'] = AS_OF

  // Scope and actor come from the session so the backend can enforce access
  // and attribute the audit entry to a real person.
  //
  // Imported lazily: a static import pulls next-auth into every module graph
  // that touches the data seam, including the unit tests, which do not run in
  // a Next request context.
  try {
    const { auth } = await import('@/lib/auth/auth')
    const session = await auth()
    if (session?.user) {
      out['X-Actor'] = session.user.name ?? session.user.email ?? 'unknown'
      if (session.user.role === 'charity_viewer' && session.user.charityId) {
        out['X-Charity-Scope'] = session.user.charityId
      }
    }
  } catch {
    // Called outside a request (a script, a test). Unscoped is correct there;
    // the API still requires the bearer token.
  }
  return out
}

function url(path: string, params?: Record<string, unknown>): string {
  const target = new URL(`${API_URL}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue
    target.searchParams.set(key, String(value))
  }
  return target.toString()
}

/** GET and validate. `revalidate` seconds of cache; 0 disables. */
export async function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  params?: Record<string, unknown>,
  revalidate = 0,
): Promise<T> {
  const response = await fetch(url(path, params), {
    headers: await headers(),
    next: revalidate > 0 ? { revalidate } : undefined,
    cache: revalidate > 0 ? undefined : 'no-store',
  })
  if (!response.ok) {
    throw new ApiError(response.status, path, await safeText(response))
  }
  return parse(schema, await response.json(), path)
}

export async function apiSend<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  params?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(url(path, params), {
    method,
    headers: { ...(await headers()), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new ApiError(response.status, path, await safeText(response))
  }
  return parse(schema, await response.json(), path)
}

/** Multipart upload. Returns the raw JSON body for the caller to validate. */
export async function apiUpload(path: string, file: File): Promise<unknown> {
  const form = new FormData()
  form.append('file', file, file.name)

  const response = await fetch(url(path), {
    method: 'POST',
    // Content-Type is deliberately omitted: fetch sets the multipart boundary.
    headers: await headers(),
    body: form,
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new ApiError(response.status, path, await safeText(response))
  }
  return response.json()
}

function parse<T>(schema: z.ZodType<T>, payload: unknown, path: string): T {
  const result = schema.safeParse(payload)
  if (result.success) return result.data

  // Name the offending field. "Expected number, received null at [0].amount"
  // is debuggable; "undefined is not an object" three components later is not.
  const first = result.error.issues[0]
  throw new ApiError(
    502,
    path,
    `unexpected response shape — ${first.message} at ${first.path.join('.') || '(root)'}`,
  )
}

async function safeText(response: Response): Promise<string> {
  try {
    const text = await response.text()
    // The backend returns {"detail": "..."} for its own errors.
    try {
      const parsed = JSON.parse(text) as { detail?: string }
      return parsed.detail ?? text.slice(0, 300)
    } catch {
      return text.slice(0, 300)
    }
  } catch {
    return response.statusText
  }
}
