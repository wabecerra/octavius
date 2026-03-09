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
import { useTasks, useCheckins, useJournal, useConnections, useProfile, useFocusGoals } from '@/hooks'
import { computeBalanceScore } from '@/lib/balance-score'
import { shouldShowWeeklyReviewPrompt } from '@/lib/weekly-review'
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
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)

  // API hooks
  const { profile } = useProfile()
  const { checkins } = useCheckins()
  const { tasks } = useTasks()
  const { goals } = useFocusGoals()
  const { connections } = useConnections()
  const { entries: journalEntries } = useJournal()

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

  // Balance score calculation
  const weekStart = new Date(safeNow)
  weekStart.setDate(safeNow.getDate() - safeNow.getDay())
  const weekStartStr = weekStart.toISOString().slice(0, 10)

  const balanceCounts = {
    health: checkins.filter((c) => c.timestamp >= weekStartStr).length,
    career: tasks.filter((t) => t.createdAt >= weekStartStr).length,
    relationships: 0,
    soul: journalEntries.filter((j) => j.timestamp >= weekStartStr).length,
  }
  const balanceScore = computeBalanceScore(balanceCounts)

  const radarData = [
    { quadrant: 'Lifeforce', score: balanceScore.health },
    { quadrant: 'Industry', score: balanceScore.career },
    { quadrant: 'Fellowship', score: balanceScore.relationships },
    { quadrant: 'Essence', score: balanceScore.soul },
  ]

  // Weekly review prompt
  const showWeeklyReview = shouldShowWeeklyReviewPrompt(safeNow, { weeklyReviewDay: 0 })

  // Derived metrics
  const overdueConnections = connections.filter(c => {
    const daysSince = (Date.now() - new Date(c.lastContactDate).getTime()) / (1000 * 60 * 60 * 24)
    return daysSince > c.reminderFrequencyDays
  })
  const incompleteTasks = tasks.filter((t) => !t.completed).length
  const todayGoals = goals.length
  const weekJournals = journalEntries.filter((j) => j.timestamp >= weekStartStr).length

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
      case 'agents':
        return <AgentsView />
      case 'memory':
        return <MemoryView />
      case 'costs':
        return <CostsView />
      case 'settings':
        return <SettingsView />
      default:
        return null
    }
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
