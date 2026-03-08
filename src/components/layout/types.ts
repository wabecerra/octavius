// Navigation structure shared between Shell, Sidebar, and page.tsx
export type ViewKey = 'dashboard' | 'lifeforce' | 'industry' | 'fellowship' | 'essence' | 'agents' | 'memory' | 'costs' | 'settings'

export interface NavItem {
  key: ViewKey
  label: string
  icon: string
  group: 'overview' | 'quadrants' | 'system'
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '⊞', group: 'overview' },
  { key: 'lifeforce', label: 'Lifeforce', icon: '💚', group: 'quadrants' },
  { key: 'industry', label: 'Industry', icon: '💼', group: 'quadrants' },
  { key: 'fellowship', label: 'Fellowship', icon: '🤝', group: 'quadrants' },
  { key: 'essence', label: 'Essence', icon: '🧘', group: 'quadrants' },
  { key: 'agents', label: 'Agents', icon: '🤖', group: 'system' },
  { key: 'memory', label: 'Memory', icon: '🧠', group: 'system' },
  { key: 'costs', label: 'LLM Costs', icon: '💸', group: 'system' },
  { key: 'settings', label: 'Settings', icon: '⚙', group: 'system' },
]

export const NAV_GROUPS = [
  { key: 'overview', label: 'Overview' },
  { key: 'quadrants', label: 'Life Quadrants' },
  { key: 'system', label: 'AI System' },
] as const

export const PAGE_TITLES: Record<ViewKey, string> = {
  dashboard: 'Dashboard',
  lifeforce: 'Lifeforce',
  industry: 'Industry',
  fellowship: 'Fellowship',
  essence: 'Essence',
  agents: 'Agents',
  memory: 'Memory',
  costs: 'LLM Costs',
  settings: 'Settings',
}
