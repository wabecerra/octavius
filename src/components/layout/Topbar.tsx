'use client'

import { ThemeToggle } from '@/components/ThemeToggle'

interface TopbarProps {
  navCollapsed: boolean
  setNavCollapsed: (collapsed: boolean) => void
  gatewayStatus: string
  timeStr: string
  compoundPhase: string
}

export function Topbar({ navCollapsed, setNavCollapsed, gatewayStatus, timeStr, compoundPhase }: TopbarProps) {
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
      </div>
    </header>
  )
}
