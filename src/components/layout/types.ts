// Navigation structure shared between Shell, Sidebar, and page.tsx
export type ViewKey = 'dashboard' | 'lifeforce' | 'industry' | 'fellowship' | 'essence' | 'town' | 'agents' | 'memory' | 'costs' | 'settings' | 'gateway'

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
  { key: 'town', label: 'Nerve Center', icon: '⚡', group: 'system' },
  { key: 'agents', label: 'Agents', icon: '🤖', group: 'system' },
  { key: 'memory', label: 'Memory', icon: '🧠', group: 'system' },
  { key: 'costs', label: 'LLM Costs', icon: '💸', group: 'system' },
  { key: 'settings', label: 'Settings', icon: '⚙', group: 'system' },
  { key: 'gateway', label: 'Gateway', icon: '🌐', group: 'system' },
]

export const NAV_GROUPS = [
  { key: 'overview', label: 'Overview' },
  { key: 'quadrants', label: 'Life Quadrants' },
  { key: 'system', label: 'AI System' },
] as const

export const PAGE_TITLES: Record<ViewKey, string> = {
  dashboard: 'Command Center',
  lifeforce: 'Lifeforce — Health & Wellness',
  industry: 'Industry — Career & Productivity',
  fellowship: 'Fellowship — Relationships & Community',
  essence: 'Essence — Soul & Reflection',
  town: 'Nerve Center — Agent Observability',
  agents: 'Agent Fleet Management',
  memory: 'Memory — Knowledge Graph',
  costs: 'LLM Cost Intelligence',
  settings: 'System Configuration',
  gateway: 'Gateway — OpenClaw Integration',
}
