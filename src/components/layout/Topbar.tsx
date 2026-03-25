'use client'

import { ThemeToggle } from '@/components/ThemeToggle'

interface TopbarProps {
  navCollapsed: boolean
  setNavCollapsed: (collapsed: boolean) => void
  gatewayStatus: string
  timeStr: string
  compoundPhase: string
  onLogout?: () => void
  userEmail?: string
}

export function Topbar({ navCollapsed, setNavCollapsed, gatewayStatus, timeStr, compoundPhase, onLogout, userEmail }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          onClick={() => setNavCollapsed(!navCollapsed)}
          className="nav-collapse-toggle"
        >
          <div className="nav-collapse-toggle__icon">
            <svg viewBox="0 0 24 24">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </div>
        </button>
        <div className="brand">
          <h1 className="brand-title">
            Octavius
            <span className="brand-sub">life os</span>
          </h1>
        </div>
      </div>

      <div className="topbar-right">
        <div className="status-indicator">
          <div className={`status-dot ${gatewayStatus === 'connected' ? 'status-dot--connected' : 'status-dot--disconnected'}`} />
          <span>{gatewayStatus === 'connected' ? 'Gateway Connected' : 'Gateway Offline'}</span>
        </div>
        <div className="status-indicator">
          <span className="font-mono text-xs">{timeStr}</span>
        </div>
        <div className="status-indicator">
          <span className="text-xs text-[var(--accent)]">{compoundPhase} phase</span>
        </div>
        <ThemeToggle />
        {onLogout && (
          <button
            onClick={onLogout}
            className="topbar-logout"
            title={userEmail ? `Signed in as ${userEmail}` : 'Sign out'}
          >
            <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
              {userEmail ? userEmail.split('@')[0] : 'User'}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        )}
      </div>
    </header>
  )
}
