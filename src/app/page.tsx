'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Shell } from '@/components/layout/Shell'
import { NAV_ITEMS, type ViewKey } from '@/components/layout/types'
import { CommandPalette, type CommandPaletteItem } from '@/components/CommandPalette'
import { ChatPanel } from '@/components/ChatPanel'
import { OnboardingWizard } from '@/components/OnboardingWizard'
import { DashboardView } from '@/components/views/DashboardView'
import { LifeforceView } from '@/components/views/LifeforceView'
import { IndustryView } from '@/components/views/IndustryView'
import { FellowshipView } from '@/components/views/FellowshipView'
import { EssenceView } from '@/components/views/EssenceView'
import { AgentsView } from '@/components/views/AgentsView'
import { MemoryView } from '@/components/views/MemoryView'
import { CostsView } from '@/components/views/CostsView'
import { SettingsView } from '@/components/views/SettingsView'
import { NerveCenterView } from '@/components/views/NerveCenterView'
import { GatewayView } from '@/components/gateway/GatewayView'
import { ChatView } from '@/components/views/ChatView'
import { useTasks, useCheckins, useJournal, useConnections, useProfile, useFocusGoals, useSprint, useAuth } from '@/hooks'
import { computeBalanceScore } from '@/lib/balance-score'
import { shouldShowSprintReview } from '@/lib/weekly-review'
import { useGatewayInit } from '@/lib/gateway/use-gateway'
import type { ChatMessage } from '@/lib/gateway/types'

// ─── Utility functions ───

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getCompoundPhase(dayOfWeek: number): string {
  if (dayOfWeek >= 1 && dayOfWeek <= 2) return 'Plan'
  if (dayOfWeek >= 3 && dayOfWeek <= 4) return 'Work'
  if (dayOfWeek === 5) return 'Review'
  return 'Compound'
}

// ─── Command palette items ───

const COMMAND_PALETTE_ITEMS: CommandPaletteItem[] = [
  ...NAV_ITEMS.map((n) => ({
    id: n.key,
    label: n.label,
    icon: n.icon,
    group: 'Navigate',
    keywords: n.group,
  })),
  { id: 'action:new-task', label: 'New Task', icon: '➕', group: 'Quick Actions', keywords: 'create add task kanban' },
  { id: 'action:new-journal', label: 'New Journal Entry', icon: '📝', group: 'Quick Actions', keywords: 'write journal entry' },
  { id: 'action:new-checkin', label: 'New Check-In', icon: '💚', group: 'Quick Actions', keywords: 'wellness mood energy stress' },
]

// ─── Main Dashboard Component ───

export default function Dashboard() {
  const { user, loading: authLoading, logout } = useAuth()
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login'
    }
  }, [authLoading, user])

  // Sprint navigation (must come before data hooks so they can use sprint bounds)
  const { sprint, isCurrent: isCurrentSprintActive, goBack, goForward, goToday } = useSprint()

  // API hooks — scoped to active sprint
  const { profile, refetch: refetchProfile } = useProfile()
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)

  // Loading timeout — show diagnostics if stuck (must be before early returns)
  const [loadingTooLong, setLoadingTooLong] = useState(false)
  useEffect(() => {
    if (!authLoading && user) return // Already loaded
    const timer = setTimeout(() => setLoadingTooLong(true), 20_000)
    return () => clearTimeout(timer)
  }, [authLoading, user])
  const { checkins } = useCheckins({ since: sprint.startDate, until: sprint.endDate })
  const { tasks } = useTasks({ since: sprint.startDate, until: sprint.endDate, includeOpen: true })
  const { goals } = useFocusGoals()
  const { connections } = useConnections()
  const { entries: journalEntries } = useJournal({ since: sprint.startDate, until: sprint.endDate })

  // Gateway integration
  const gateway = useGatewayInit()

  // Chat state — persist to sessionStorage so messages survive refresh
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = sessionStorage.getItem('octavius-chat-messages')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [chatLoading, setChatLoading] = useState(false)

  // Sync chat messages to sessionStorage on change
  useEffect(() => {
    try {
      sessionStorage.setItem('octavius-chat-messages', JSON.stringify(chatMessages))
    } catch {
      // quota exceeded — trim older messages
      try {
        sessionStorage.setItem(
          'octavius-chat-messages',
          JSON.stringify(chatMessages.slice(-50))
        )
      } catch { /* give up */ }
    }
  }, [chatMessages])

  // Track active SSE connection for cleanup on unmount
  const progressSourceRef = useRef<EventSource | null>(null)
  const msgCounterRef = useRef(0)
  const nextMsgId = (suffix: string) => `msg-${Date.now()}-${++msgCounterRef.current}-${suffix}`

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      progressSourceRef.current?.close()
    }
  }, [])

  /** Listen for agent progress via SSE and inject system messages into chat */
  const listenForProgress = useCallback((taskId: string) => {
    // Close any existing connection
    progressSourceRef.current?.close()

    const eventSource = new EventSource(`/api/chat/${taskId}/progress`)
    progressSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'activity') {
          // Show meaningful progress (started, progressed, spawn_requested, completed)
          if (['started', 'progressed', 'spawn_requested', 'completed'].includes(data.action)) {
            setChatMessages(prev => [...prev, {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-progress`,
              role: 'system',
              content: `${data.action === 'completed' ? '✅' : data.action === 'spawn_requested' ? '🔄' : '⚡'} **${data.agentId}** — ${data.action}: ${data.details?.slice(0, 200) || ''}`,
              timestamp: data.timestamp,
            }])
          }
        }

        if (data.type === 'complete') {
          setChatMessages(prev => [...prev, {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-done`,
            role: 'system',
            content: '✅ Task completed! Check the Kanban board for results.',
            timestamp: new Date().toISOString(),
          }])
          eventSource.close()
          progressSourceRef.current = null
        }

        if (data.type === 'timeout') {
          eventSource.close()
          progressSourceRef.current = null
        }
      } catch {
        // Ignore parse errors
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
      progressSourceRef.current = null
    }
  }, [])

  const handleSendMessage = useCallback(async (content: string) => {
    const userMsg: ChatMessage = {
      id: nextMsgId('user'),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    setChatMessages(prev => [...prev, userMsg])
    setChatLoading(true)

    // Build conversation history (last 10 messages for context)
    const history = chatMessages.slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })).filter(m => m.role === 'user' || m.role === 'assistant')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, history }),
      })
      const data = await res.json()

      // Add the main response
      setChatMessages(prev => [...prev, {
        id: nextMsgId('resp'),
        role: 'assistant' as const,
        content: data.response || data.error || 'No response',
        agentId: data.action?.agentId || (data.source === 'gateway' ? 'octavius-orchestrator' : undefined),
        timestamp: new Date().toISOString(),
      }])

      // If a task was created, start listening for agent progress
      if (data.action?.type === 'task_created' && data.action.taskId && data.action.dispatched) {
        listenForProgress(data.action.taskId)
      }
    } catch {
      setChatMessages(prev => [...prev, {
        id: nextMsgId('err'),
        role: 'system' as const,
        content: 'Failed to get a response. Please try again.',
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setChatLoading(false)
    }
  }, [chatMessages, listenForProgress])

  // Clock
  useEffect(() => {
    setNow(new Date())
    setMounted(true)
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const safeNow = now ?? new Date(0)
  const hour = safeNow.getHours()
  const greeting = mounted ? getGreeting(hour) : ''
  const dateStr = mounted ? formatDate(safeNow) : ''
  const timeStr = mounted ? formatTime(safeNow) : ''
  const compoundPhase = getCompoundPhase(safeNow.getDay())

  // Balance score — data is already sprint-scoped from the API.
  // Tasks include carry-overs (includeOpen=1), so separate them.
  const sprintNativeTasks = tasks.filter((t) => t.createdAt >= sprint.startDate)
  const carriedOverTasks = tasks.filter(
    (t) => !t.completed && t.createdAt < sprint.startDate
  )

  // Overdue connections (needed for balance score + standup)
  const overdueConnections = connections.filter(c => {
    const daysSince = (Date.now() - new Date(c.lastContactDate).getTime()) / (1000 * 60 * 60 * 24)
    return daysSince > c.reminderFrequencyDays
  })

  const balanceCounts = {
    health: checkins.length,
    career: sprintNativeTasks.length,
    relationships: connections.length > 0 ? connections.length - overdueConnections.length : 0,
    soul: journalEntries.length,
  }
  const balanceScore = computeBalanceScore(balanceCounts)

  const radarData = [
    { quadrant: 'Lifeforce', score: balanceScore.health },
    { quadrant: 'Industry', score: balanceScore.career },
    { quadrant: 'Fellowship', score: balanceScore.relationships },
    { quadrant: 'Essence', score: balanceScore.soul },
  ]

  // Sprint review prompt — show on the last day of the sprint (Sunday)
  const showWeeklyReview = shouldShowSprintReview(safeNow)

  // Derived metrics — data already sprint-scoped from API
  const incompleteTasks = tasks.filter((t) => !t.completed).length
  const todayGoals = goals.length
  const weekJournals = journalEntries.length

  // Standup data
  const todayStr = safeNow.toISOString().slice(0, 10)
  const yesterday = new Date(safeNow)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  const completedYesterday = tasks.filter(
    (t) => t.completed && t.updatedAt?.slice(0, 10) === yesterdayStr
  )
  const inProgressTasks = tasks.filter((t) => t.status === 'in-progress')
  const todayCheckin = checkins.find((c) => c.timestamp.slice(0, 10) === todayStr) ?? null

  // ─── View Rendering ───

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <DashboardView
            profileName={profile.name}
            checkins={checkins}
            incompleteTasks={incompleteTasks}
            todayGoals={todayGoals}
            connections={connections}
            overdueConnections={overdueConnections}
            weekJournals={weekJournals}
            radarData={radarData}
            showWeeklyReview={showWeeklyReview}
            sprint={sprint}
            isCurrentSprint={isCurrentSprintActive}
            onSprintBack={goBack}
            onSprintForward={goForward}
            onSprintToday={goToday}
            completedYesterday={completedYesterday}
            inProgressTasks={inProgressTasks}
            todayFocusGoals={goals}
            todayCheckin={todayCheckin}
            carriedOverCount={carriedOverTasks.length}
          />
        )
      case 'lifeforce':
        return <LifeforceView />
      case 'industry':
        return <IndustryView />
      case 'fellowship':
        return <FellowshipView />
      case 'essence':
        return <EssenceView />
      case 'town':
        return <NerveCenterView />
      case 'agents':
        return <AgentsView />
      case 'memory':
        return <MemoryView />
      case 'costs':
        return <CostsView />
      case 'settings':
        return <SettingsView />
      case 'gateway':
        return <GatewayView />
      case 'chat':
        return (
          <ChatView
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            isLoading={chatLoading}
            gatewayStatus={gateway.status}
          />
        )
      default:
        return null
    }
  }

  // Show onboarding wizard for first-time users
  const showOnboarding = !authLoading && user && !profile.onboardingComplete && !onboardingDismissed
  if (showOnboarding) {
    return (
      <OnboardingWizard
        onComplete={() => {
          setOnboardingDismissed(true)
          refetchProfile()
        }}
      />
    )
  }

  // Show nothing while checking auth (prevents flash)
  if (authLoading || !user) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary, #12141a)',
        color: 'var(--text-tertiary, #8a91a0)',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem', animation: 'pulse 2s infinite' }}>⚡</div>
          <div style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>Loading Octavius...</div>
          {loadingTooLong && (
            <div style={{ marginTop: '1.5rem', fontSize: '0.7rem', color: '#f59e0b', maxWidth: '320px', lineHeight: 1.6 }}>
              <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Taking longer than expected</div>
              <div>Check the browser console for errors.</div>
              <div style={{ marginTop: '0.25rem' }}>Common fixes: run <code style={{ background: '#1e2028', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>npm run doctor</code> in the project directory.</div>
              <div style={{ marginTop: '0.25rem' }}>If the database is locked, restart the dev server.</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <Shell
        activeView={activeView}
        setActiveView={setActiveView}
        navCollapsed={navCollapsed}
        setNavCollapsed={setNavCollapsed}
        gatewayStatus={gateway.status}
        timeStr={timeStr}
        compoundPhase={compoundPhase}
        greeting={greeting}
        profileName={profile.name}
        dateStr={dateStr}
        onLogout={logout}
        userEmail={user?.email}
      >
        {renderContent()}
      </Shell>

      {/* Command Palette (Cmd+K) */}
      <CommandPalette
        items={COMMAND_PALETTE_ITEMS}
        onSelect={(id) => {
          const navItem = NAV_ITEMS.find((n) => n.key === id)
          if (navItem) {
            setActiveView(navItem.key)
            return
          }
          if (id === 'action:new-task') setActiveView('industry')
          if (id === 'action:new-journal') setActiveView('essence')
          if (id === 'action:new-checkin') setActiveView('lifeforce')
        }}
      />

      {/* Chat Panel — floating overlay, hidden on mobile (use Chat tab instead) */}
      <div className="fixed bottom-4 right-4 z-50 hidden-mobile">
        <ChatPanel
          messages={chatMessages}
          onSendMessage={handleSendMessage}
          isLoading={chatLoading}
          gatewayStatus={gateway.status}
        />
      </div>
    </>
  )
}
