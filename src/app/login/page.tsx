'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [approvalData, setApprovalData] = useState<{approvalCode: string, userId: string} | null>(null);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    const session = localStorage.getItem('octavius_session');
    if (session) {
      router.push('/');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || (isRegister ? 'Registration failed' : 'Login failed'));
      }

      if (isRegister) {
        setIsRegister(false);
        setError('');
        setPassword('');
        return;
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
        router.push('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // Poll for device approval — auto-login once approved
  useEffect(() => {
    if (!approvalData) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/auth/device/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvalCode: approvalData.approvalCode }),
        })
        const data = await res.json()
        if (data.success && data.sessionToken) {
          clearInterval(interval)
          localStorage.setItem('octavius_session', data.sessionToken)
          localStorage.setItem('octavius_user', JSON.stringify({
            userId: approvalData.userId,
            email: email,
          }))
          router.push('/')
        }
      } catch {
        // approval not yet granted — keep polling
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [approvalData, email, router])

  const copyCode = () => {
    if (approvalData) {
      navigator.clipboard.writeText(approvalData.approvalCode);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <span className="login-brand">⚡ Octavius</span>
          <span className="login-subtitle">Life Operating System</span>
        </div>

        {approvalData ? (
          <div className="login-approval">
            <div className="login-approval-icon">📱</div>
            <h2 className="login-approval-title">Device Approval Required</h2>
            <p className="login-approval-desc">
              Run this command on an approved device:
            </p>
            <div className="login-code-box">
              <code className="login-code">
                octavius approve-device {approvalData.approvalCode}
              </code>
              <button onClick={copyCode} className="login-copy-btn" title="Copy code">
                📋
              </button>
            </div>
            <p className="login-code-expiry">Code expires in 10 minutes</p>
            <button onClick={() => setApprovalData(null)} className="login-back-btn">
              ← Back to login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label className="login-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="login-input"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div className="login-field">
              <label className="login-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input"
                placeholder="••••••••"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" disabled={loading} className="login-submit">
              {loading ? (
                <span className="login-spinner-wrap">
                  <span className="login-spinner" />
                  {isRegister ? 'Creating account...' : 'Signing in...'}
                </span>
              ) : (
                isRegister ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>
        )}

        {!approvalData && (
          <div className="login-footer">
            <p className="login-toggle-text">
              {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button onClick={() => { setIsRegister(!isRegister); setError('') }} className="login-toggle-btn">
                {isRegister ? 'Sign In' : 'Create one'}
              </button>
            </p>
          </div>
        )}
      </div>

      <style jsx>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-primary, #12141a);
          font-family: system-ui, -apple-system, sans-serif;
        }
        .login-card {
          width: 100%;
          max-width: 400px;
          padding: 2rem;
          background: var(--bg-secondary, #181b22);
          border: 1px solid var(--border-primary, #252932);
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
        }
        .login-header {
          text-align: center;
          margin-bottom: 2rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .login-brand {
          font-size: 1.75rem;
          font-weight: bold;
          color: var(--text-primary, #eef0f4);
        }
        .login-subtitle {
          font-size: 0.75rem;
          font-family: monospace;
          color: var(--text-tertiary, #8a91a0);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .login-field {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .login-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text-secondary, #b0b6c3);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .login-input {
          width: 100%;
          padding: 0.625rem 0.75rem;
          background: var(--bg-tertiary, #1a1d25);
          border: 1px solid var(--border-primary, #252932);
          border-radius: 8px;
          font-size: 0.875rem;
          color: var(--text-primary, #eef0f4);
          outline: none;
          transition: border-color 150ms;
          box-sizing: border-box;
        }
        .login-input:focus {
          border-color: var(--accent, #ff5c5c);
        }
        .login-input::placeholder {
          color: var(--text-tertiary, #8a91a0);
        }
        .login-error {
          padding: 0.625rem 0.75rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 8px;
          color: var(--color-error, #ef4444);
          font-size: 0.8125rem;
        }
        .login-submit {
          width: 100%;
          padding: 0.625rem;
          background: var(--accent, #ff5c5c);
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 150ms;
        }
        .login-submit:hover:not(:disabled) {
          background: var(--accent-hover, #ff7070);
        }
        .login-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .login-spinner-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .login-spinner {
          display: inline-block;
          width: 1rem;
          height: 1rem;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .login-footer {
          margin-top: 1.5rem;
          padding-top: 1.25rem;
          border-top: 1px solid var(--border-primary, #252932);
          text-align: center;
        }
        .login-toggle-text {
          font-size: 0.8125rem;
          color: var(--text-tertiary, #8a91a0);
        }
        .login-toggle-btn {
          background: none;
          border: none;
          color: var(--accent, #ff5c5c);
          font-weight: 500;
          cursor: pointer;
          font-size: 0.8125rem;
        }
        .login-toggle-btn:hover {
          text-decoration: underline;
        }
        .login-approval {
          text-align: center;
        }
        .login-approval-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
        .login-approval-title {
          font-size: 1.125rem;
          font-weight: bold;
          color: var(--text-primary, #eef0f4);
          margin-bottom: 0.375rem;
        }
        .login-approval-desc {
          color: var(--text-tertiary, #8a91a0);
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }
        .login-code-box {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: var(--bg-tertiary, #1a1d25);
          padding: 0.75rem;
          border-radius: 8px;
          margin-bottom: 0.5rem;
        }
        .login-code {
          font-family: monospace;
          font-size: 0.8125rem;
          color: var(--accent, #ff5c5c);
          background: var(--bg-primary, #12141a);
          padding: 0.375rem 0.75rem;
          border-radius: 4px;
        }
        .login-copy-btn {
          padding: 0.375rem;
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 1.125rem;
        }
        .login-code-expiry {
          font-size: 0.6875rem;
          color: var(--text-tertiary, #8a91a0);
          margin-bottom: 1.5rem;
        }
        .login-back-btn {
          background: transparent;
          border: none;
          color: var(--accent, #ff5c5c);
          cursor: pointer;
          font-size: 0.8125rem;
        }
      `}</style>
    </div>
  );
}
