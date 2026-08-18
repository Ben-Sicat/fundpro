'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Keeps the open page current.
 *
 * Every figure in this app comes from a Server Component that renders ONCE per
 * navigation. Without this, a tab left open shows whatever was true when it
 * loaded — during an import that means the Overview sits at yesterday's totals
 * while uploads land, and pages visited at different moments disagree with each
 * other. That reads as "some panels update and some don't".
 *
 * `router.refresh()` re-runs the server render for the current route and
 * reconciles the result into the existing tree, so it does not clear input
 * state or scroll position.
 *
 * Two rules that matter:
 *
 * - **A hidden tab does not poll.** Every refresh is a full server render plus
 *   a fan-out of API calls; doing that for background tabs multiplies load for
 *   nobody's benefit.
 * - **Focus triggers an immediate refresh.** Coming back to a tab is exactly
 *   when stale numbers are most likely and most misleading, and waiting out
 *   the remaining interval is what makes it feel broken.
 */
export function AutoRefresh({
  intervalMs = 20_000,
  showIndicator = true,
}: {
  intervalMs?: number
  showIndicator?: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  // Held in a ref so a refresh in flight cannot start a second one, without
  // making the effect depend on it and resubscribe every tick.
  const inFlight = useRef(false)

  useEffect(() => {
    let cancelled = false

    const refresh = () => {
      if (cancelled || inFlight.current) return
      if (document.visibilityState !== 'visible') return
      inFlight.current = true
      setPending(true)
      router.refresh()
      // refresh() resolves nothing observable, so the flag is released on a
      // short timer. It only guards against overlapping ticks; being slightly
      // conservative is the right failure direction.
      window.setTimeout(() => {
        inFlight.current = false
        if (!cancelled) setPending(false)
      }, 1_500)
    }

    const timer = window.setInterval(refresh, intervalMs)

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [router, intervalMs])

  if (!showIndicator) return null

  return (
    <span
      aria-live="polite"
      className="hud hidden items-center gap-1.5 text-[10px] text-muted sm:inline-flex"
      title={`Refreshes every ${Math.round(intervalMs / 1000)}s, and whenever you return to this tab`}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full transition-opacity"
        style={{
          background: pending ? 'var(--accent)' : 'var(--axis)',
          opacity: pending ? 1 : 0.55,
        }}
      />
      {pending ? 'updating' : 'live'}
    </span>
  )
}
