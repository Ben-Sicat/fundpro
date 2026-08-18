/**
 * Shared between the upload Server Action and the client form.
 *
 * Its own module on purpose: importing this type from `actions.ts` would pull
 * that file — and the `server-only` API client behind it — into the client
 * bundle, which fails the build.
 */
export interface UploadState {
  ok: boolean
  message: string
  detail?: string
}
