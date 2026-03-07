import type { StateCreator } from 'zustand'
import type {
  GatewayStatus,
  SessionInfo,
  ChatMessage,
  HeartbeatActionConfig,
} from '@/lib/gateway/types'

/** Maximum number of chat messages retained in the store */
const CHAT_MESSAGE_CAP = 100

/** Maximum number of recent sessions retained */
const RECENT_SESSIONS_CAP = 10

export interface GatewaySlice {
  // Connection state
  gatewayStatus: GatewayStatus
  gatewayAddress: string
  gatewayPort: number
  connectedAt: string | null
  lastHealthyAt: string | null

  // Agent registrations
  registeredAgents: Array<{
    agentId: string
    status: 'registered' | 'pending' | 'failed'
    workspacePath: string
    error?: string
  }>

  // Active sessions
  activeSessions: SessionInfo[]
  recentSessions: SessionInfo[]

  // Chat (last 100)
  chatMessages: ChatMessage[]

  // Scheduled jobs (cached from SQLite)
  scheduledJobs: Array<{
    id: string
    name: string
    cronExpression: string
    agentId: string
    taskTemplate: string
    enabled: boolean
    lastRun?: { success: boolean; completedAt: string }
  }>

  // Heartbeat actions (cached from SQLite)
  heartbeatActions: HeartbeatActionConfig[]

  // Token usage
  dailyTokenUsage: Record<string, number>

  // Actions
  setGatewayStatus: (status: GatewayStatus) => void
  setGatewayAddress: (address: string, port: number) => void
  setConnectedAt: (timestamp: string | null) => void
  setLastHealthyAt: (timestamp: string | null) => void
  setRegisteredAgents: (agents: GatewaySlice['registeredAgents']) => void
  updateAgentRegistration: (agentId: string, status: string, error?: string) => void
  addSession: (session: SessionInfo) => void
  updateSession: (sessionId: string, updates: Partial<SessionInfo>) => void
  removeSession: (sessionId: string) => void
  addChatMessage: (message: ChatMessage) => void
  clearChatMessages: () => void
  setScheduledJobs: (jobs: GatewaySlice['scheduledJobs']) => void
  setHeartbeatActions: (actions: HeartbeatActionConfig[]) => void
  updateDailyTokenUsage: (agentId: string, tokens: number) => void
}

export const defaultGatewayState: Pick<
  GatewaySlice,
  | 'gatewayStatus'
  | 'gatewayAddress'
  | 'gatewayPort'
  | 'connectedAt'
  | 'lastHealthyAt'
  | 'registeredAgents'
  | 'activeSessions'
  | 'recentSessions'
  | 'chatMessages'
  | 'scheduledJobs'
  | 'heartbeatActions'
  | 'dailyTokenUsage'
> = {
  gatewayStatus: 'unknown',
  gatewayAddress: 'localhost',
  gatewayPort: 18789,
  connectedAt: null,
  lastHealthyAt: null,
  registeredAgents: [],
  activeSessions: [],
  recentSessions: [],
  chatMessages: [],
  scheduledJobs: [],
  heartbeatActions: [],
  dailyTokenUsage: {},
}

/**
 * Creates the gateway slice for the Zustand store.
 *
 * Usage: spread into the root `create()` call alongside other slices.
 * The slice creator follows Zustand's StateCreator pattern so it can
 * be composed with the existing store via `...createGatewaySlice(set, get, api)`.
 */
export const createGatewaySlice: StateCreator<GatewaySlice, [], [], GatewaySlice> = (set, _get) => ({
  ...defaultGatewayState,

  setGatewayStatus: (status: GatewayStatus) => set({ gatewayStatus: status }),

  setGatewayAddress: (address: string, port: number) =>
    set({ gatewayAddress: address, gatewayPort: port }),

  setConnectedAt: (timestamp: string | null) => set({ connectedAt: timestamp }),

  setLastHealthyAt: (timestamp: string | null) => set({ lastHealthyAt: timestamp }),

  setRegisteredAgents: (agents: GatewaySlice['registeredAgents']) =>
    set({ registeredAgents: agents }),

  updateAgentRegistration: (agentId: string, status: string, error?: string) =>
    set((state) => ({
      registeredAgents: state.registeredAgents.map((agent) =>
        agent.agentId === agentId
          ? { ...agent, status: status as 'registered' | 'pending' | 'failed', error }
          : agent,
      ),
    })),

  addSession: (session: SessionInfo) =>
    set((state) => ({
      activeSessions: [...state.activeSessions, session],
    })),

  updateSession: (sessionId: string, updates: Partial<SessionInfo>) =>
    set((state) => {
      const updatedActive = state.activeSessions.map((s) =>
        s.session_id === sessionId ? { ...s, ...updates } : s,
      )

      // If the session is now terminal, move it from active to recent
      const updated = updatedActive.find((s) => s.session_id === sessionId)
      const isTerminal =
        updated &&
        (updated.status === 'completed' ||
          updated.status === 'failed' ||
          updated.status === 'cancelled' ||
          updated.status === 'timeout')

      if (isTerminal && updated) {
        return {
          activeSessions: updatedActive.filter((s) => s.session_id !== sessionId),
          recentSessions: [updated, ...state.recentSessions].slice(0, RECENT_SESSIONS_CAP),
        }
      }

      return { activeSessions: updatedActive }
    }),

  removeSession: (sessionId: string) =>
    set((state) => ({
      activeSessions: state.activeSessions.filter((s) => s.session_id !== sessionId),
    })),

  addChatMessage: (message: ChatMessage) =>
    set((state) => {
      const messages = state.chatMessages
      // Evict oldest when at cap
      const base = messages.length >= CHAT_MESSAGE_CAP ? messages.slice(1) : messages
      return { chatMessages: [...base, message] }
    }),

  clearChatMessages: () => set({ chatMessages: [] }),

  setScheduledJobs: (jobs: GatewaySlice['scheduledJobs']) => set({ scheduledJobs: jobs }),

  setHeartbeatActions: (actions: HeartbeatActionConfig[]) => set({ heartbeatActions: actions }),

  updateDailyTokenUsage: (agentId: string, tokens: number) =>
    set((state) => ({
      dailyTokenUsage: {
        ...state.dailyTokenUsage,
        [agentId]: (state.dailyTokenUsage[agentId] ?? 0) + tokens,
      },
    })),
})
