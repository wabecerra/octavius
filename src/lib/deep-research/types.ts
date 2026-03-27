export interface ResearchConfig {
  maxDepth: number
  maxBreadth: number
  tokenBudget: number
  maxSearches: number
  model: string
  synthesisModel?: string
  searchProvider: 'kimi'
  searchApiKey?: string
  quadrant?: string
  taskId?: string
}

export interface Learning {
  fact: string
  source: string
  confidence: number
  topic: string
}

export interface ResearchState {
  id: string
  query: string
  status: 'planning' | 'researching' | 'synthesizing' | 'complete' | 'error'
  learnings: Learning[]
  visitedUrls: string[]
  gaps: string[]
  currentDepth: number
  totalSearches: number
  tokenUsage: number
  progress: ResearchProgress[]
  report?: string
  error?: string
  startedAt: number
  completedAt?: number
}

export interface ResearchProgress {
  step: number
  action: 'plan' | 'search' | 'extract' | 'evaluate' | 'synthesize' | 'error'
  detail: string
  timestamp: number
}

export interface SearchResult {
  url: string
  title: string
  content: string
  snippet: string
}

export const DEFAULT_CONFIG: Omit<ResearchConfig, 'model'> = {
  maxDepth: 3,
  maxBreadth: 4,
  tokenBudget: 500_000,
  maxSearches: 50,
  searchProvider: 'kimi',
}
