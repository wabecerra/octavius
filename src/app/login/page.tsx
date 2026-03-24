'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [approvalData, setApprovalData] = useState<{approvalCode: string, userId: string} | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.requiresDeviceApproval) {
        setApprovalData({
          approvalCode: data.approvalCode,
          userId: data.userId,
        });
      } else {
        localStorage.setItem('octavius_session', data.sessionToken);
        localStorage.setItem('octavius_user', JSON.stringify({
          userId: data.userId,
          email: data.email,
        }));
        router.push('/'); // Redirect to main Octavius dashboard
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (approvalData) {
      navigator.clipboard.writeText(approvalData.approvalCode);
      alert('Code copied!');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        padding: '2rem',
        background: 'white',
        borderRadius: '1rem',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1a202c', marginBottom: '0.5rem' }}>
            🧠 Octavius
          </h1>
          <p style={{ color: '#718096' }}>Your AI Life Dashboard</p>
        </div>

        {approvalData ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📱</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1a202c', marginBottom: '0.5rem' }}>
              Device Approval Required
            </h2>
            <p style={{ color: '#718096', marginBottom: '1.5rem' }}>
              Run this command on an approved device:
            </p>
            
            <div style={{
              background: '#f7fafc',
              padding: '1rem',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}>
              <code style={{
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                background: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '0.25rem',
              }}>
                octavius approve-device {approvalData.approvalCode}
              </code>
              <button
                onClick={copyCode}
                style={{
                  padding: '0.5rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                }}
                title="Copy code"
              >
                📋
              </button>
            </div>
            
            <p style={{ fontSize: '0.75rem', color: '#a0aec0' }}>
              Code expires in 10 minutes
            </p>
            
            <button
              onClick={() => setApprovalData(null)}
              style={{
                marginTop: '1.5rem',
                background: 'transparent',
                border: 'none',
                color: '#4299e1',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              ← Back to login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '0.5rem',
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                }}
                placeholder="you@example.com"
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '0.5rem',
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                }}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div style={{
                padding: '0.75rem',
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                color: '#dc2626',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: loading ? '#93c5fd' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: '1.25rem',
                    height: '1.25rem',
                    border: '2px solid white',
                    borderBottomColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                  Logging in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        )}

        <div style={{
          marginTop: '2rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Don't have an account?{' '}
            <a
              href="/register"
              style={{
                color: '#2563eb',
                fontWeight: '500',
                textDecoration: 'none',
              }}
            >
              Create one
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
