'use client'

import { type ReactNode } from 'react'
import { Topbar } from './Topbar'
import { Sidebar } from './Sidebar'
import { PAGE_TITLES, type ViewKey } from './types'

interface ShellProps {
  activeView: ViewKey
  setActiveView: (view: ViewKey) => void
  navCollapsed: boolean
  setNavCollapsed: (collapsed: boolean) => void
  gatewayStatus: string
  timeStr: string
  compoundPhase: string
  greeting: string
  profileName: string
  dateStr: string
  children: ReactNode
}

export function Shell({
  activeView,
  setActiveView,
  navCollapsed,
  setNavCollapsed,
  gatewayStatus,
  timeStr,
  compoundPhase,
  greeting,
  profileName,
  dateStr,
  children,
}: ShellProps) {
  return (
    <div className={`shell ${navCollapsed ? 'shell--nav-collapsed' : ''}`}>
      <Topbar
        navCollapsed={navCollapsed}
        setNavCollapsed={setNavCollapsed}
        gatewayStatus={gatewayStatus}
        timeStr={timeStr}
        compoundPhase={compoundPhase}
      />

      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        collapsed={navCollapsed}
      />

      <main className="content">
        <div className="content-header">
          <div>
            <h1 className="page-title">{PAGE_TITLES[activeView]}</h1>
            {activeView === 'dashboard' && (
              <p className="page-sub">
                {greeting}{profileName ? `, ${profileName}` : ''} — {dateStr}
              </p>
            )}
          </div>
        </div>

        {children}
      </main>
    </div>
  )
}
