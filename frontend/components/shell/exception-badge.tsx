import { getExceptions } from '@/lib/data'

/**
 * The count of rows set aside for review, for the Uploads nav item.
 *
 * Rendered as its own Server Component so the app shell does not wait for it.
 * The layout used to `await getExceptions()` before returning any markup, which
 * put a full API round trip — fetching every exception, to count the unresolved
 * ones — in front of the sidebar, the topbar and the page beneath. The
 * auto-refresh re-ran that every twenty seconds.
 *
 * Wrapped in Suspense with a `null` fallback at the call site: an absent badge
 * is invisible, so nothing shifts when it appears, and a nav item is useful
 * without it.
 *
 * Returning null at zero is the point — a badge reading "0" is noise that looks
 * like an alert.
 */
export async function ExceptionBadge() {
  const open = (await getExceptions()).filter((e) => !e.resolved).length
  if (!open) return null
  return <>{open}</>
}
