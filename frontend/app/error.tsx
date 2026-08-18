'use client'

/**
 * Page-level error boundary.
 *
 * The overwhelmingly likely cause in a fresh deployment is that the processing
 * service is not configured: since the mock data layer was removed, every page
 * reads from that service and there is nothing to fall back to. Next.js hides
 * the real message in production and shows only a digest, so this page says
 * what to check rather than leaving someone with "Digest: 927413938".
 *
 * The error's own message is deliberately NOT rendered: it can carry the
 * service URL, and this page is public.
 */
import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Server logs get the detail; the browser does not.
    console.error('[fundpro] page error', error.digest)
  }, [error])

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-6">
      <p className="hud text-[11px] text-muted">Something went wrong</p>
      <h1 className="mt-2 text-primary">This page could not load its data</h1>
      <p className="mt-3 text-sm leading-relaxed text-secondary">
        Every figure in FundPro comes from the processing service. If this is a
        fresh deployment, that service is probably not connected yet.
      </p>
      <div className="mt-5 rounded-[var(--r)] border border-line bg-surface-2 p-4">
        <p className="hud text-[10px] text-muted">Check these are set</p>
        <ul className="mt-2 space-y-1">
          <li className="tabular text-[13px] text-primary">PREPROCESS_API_URL</li>
          <li className="tabular text-[13px] text-primary">PREPROCESS_API_KEY</li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          On Vercel these live in Project Settings → Environment Variables. A
          deployment must be redeployed after they change.
        </p>
      </div>
      <div className="mt-5 flex gap-2">
        <button
          onClick={reset}
          className="min-h-[38px] rounded-[var(--r-sm)] bg-accent px-4 text-sm font-medium text-on-accent"
        >
          Try again
        </button>
      </div>
      {error.digest ? (
        <p className="tabular mt-4 text-[11px] text-muted">
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  )
}
