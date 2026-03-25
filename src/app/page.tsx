'use client'

import { useState, useEffect, useCallback } from 'react'
import { Shell } from '@/components/layout/Shell'
import { NAV_ITEMS, type ViewKey } from '@/components/layout/types'
import { CommandPalette, type CommandPaletteItem } from '@/components/CommandPalette'
import { ChatPanel } from '@/components/ChatPanel'
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
  const { profile } = useProfile()
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

  const addChatMessage = (message: ChatMessage) => {
    setChatMessages(prev => [...prev, message])
  }

  const handleSendMessage = useCallback(async (content: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    addChatMessage(userMsg)
    setChatLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      })
      const data = await res.json()

      addChatMessage({
        id: `msg-${Date.now()}-resp`,
        role: 'assistant',
        content: data.response || data.error || 'No response',
        agentId: data.source === 'gateway' ? 'octavius-orchestrator' : undefined,
        timestamp: new Date().toISOString(),
      })
    } catch {
      addChatMessage({
        id: `msg-${Date.now()}-err`,
        role: 'system',
        content: 'Failed to get a response. Please try again.',
        timestamp: new Date().toISOString(),
      })
    } finally {
      setChatLoading(false)
    }
  }, [])

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
      default:
        return null
    }
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

      {/* Chat Panel — persistent across all views */}
      <div className="fixed bottom-4 right-4 z-50">
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
