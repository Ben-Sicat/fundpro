'use client'

/**
 * Last-resort boundary: catches failures in the root layout itself, where
 * `app/error.tsx` cannot run. It must render its own <html> and <body>, and it
 * cannot use the design tokens, because the failure may be the stylesheet.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0a0c11',
          color: '#f2f4f8',
          fontFamily: 'system-ui, sans-serif',
          padding: '2rem',
        }}
      >
        <div style={{ maxWidth: '32rem' }}>
          <h1 style={{ fontSize: '1.25rem', margin: 0 }}>FundPro could not start</h1>
          <p style={{ color: '#a8b0c0', lineHeight: 1.6 }}>
            The application failed before it could render. If this is a fresh
            deployment, check that PREPROCESS_API_URL and PREPROCESS_API_KEY are
            set, then redeploy.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '1rem',
              padding: '0.6rem 1rem',
              borderRadius: 7,
              border: 0,
              background: '#4c8dff',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ color: '#7c8595', fontSize: 12, marginTop: '1rem' }}>
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  )
}
