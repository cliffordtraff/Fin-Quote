'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global-error-boundary]', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#f5f1e8',
          color: '#111827',
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <main
          style={{
            alignItems: 'center',
            display: 'flex',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '24px',
          }}
        >
          <section
            role="alert"
            aria-labelledby="global-error-title"
            style={{
              background: '#fff',
              border: '1px solid #fecaca',
              maxWidth: '560px',
              padding: '32px',
              width: '100%',
            }}
          >
            <h1 id="global-error-title" style={{ margin: 0, fontSize: '24px' }}>
              The application could not recover this page
            </h1>
            <p style={{ color: '#4b5563', lineHeight: 1.6, margin: '12px 0 0' }}>
              Your saved data is unchanged. Retry the application, or return
              later if the service is still recovering.
            </p>
            {error.digest ? (
              <p style={{ color: '#6b7280', fontSize: '12px' }}>
                Reference {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={reset}
              style={{
                background: '#111827',
                border: 0,
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 700,
                marginTop: '24px',
                padding: '10px 16px',
              }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  )
}
