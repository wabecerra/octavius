'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#12141a',
      color: '#e2e5eb',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '420px', padding: '2rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</div>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Something went wrong</h2>
        <p style={{ fontSize: '0.8rem', color: '#8a91a0', lineHeight: 1.6, marginBottom: '1rem' }}>
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '1.5rem' }}>
          Run <code style={{ background: '#1e2028', padding: '0.15rem 0.4rem', borderRadius: '3px' }}>npm run doctor</code> in the terminal to diagnose issues.
        </div>
        <button
          onClick={reset}
          style={{
            padding: '0.5rem 1.25rem',
            fontSize: '0.8rem',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
