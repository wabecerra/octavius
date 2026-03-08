'use client'

import { NAV_ITEMS, NAV_GROUPS, type ViewKey } from './types'

interface SidebarProps {
  activeView: ViewKey
  setActiveView: (view: ViewKey) => void
  collapsed: boolean
}

export function Sidebar({ activeView, setActiveView, collapsed }: SidebarProps) {
  return (
    <nav className={`nav ${collapsed ? 'nav--collapsed' : ''}`}>
      {NAV_GROUPS.map((group) => {
        const groupItems = NAV_ITEMS.filter((item) => item.group === group.key)

        return (
          <div key={group.key} className="nav-group">
            <div className="nav-label nav-label--static">
              <span className="nav-label__text">{group.label}</span>
            </div>
            {groupItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveView(item.key)}
                className={`nav-item ${activeView === item.key ? 'nav-item--active' : ''}`}
              >
                <div className="nav-item__icon">
                  <span>{item.icon}</span>
                </div>
                <span className="nav-item__text">{item.label}</span>
              </button>
            ))}
          </div>
        )
      })}
    </nav>
  )
}
