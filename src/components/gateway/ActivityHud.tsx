'use client'

import { useEffect, useRef, useState } from 'react'
import type { TelemetryEvent, TelemetryEventType } from '@/lib/gateway-view/types'

// ── Subsystem icons ──

const SUBSYSTEM_ICONS: Record<string, string> = {
  'room-agents':    '🤖',
  'room-memory':    '🧠',
  'room-tasks':     '📋',
  'room-health':    '💚',
  'room-obsidian':  '🔮',
  'room-lcm':       '💬',
  'room-costs':     '💰',
  'room-hub':       '⚡',
  'room-lifeforce': '🌱',
  'room-industry':  '🏭',
  'room-fellowship':'🤝',
  'room-essence':   '🧘',
}

const EVENT_TYPE_LABELS: Record<TelemetryEventType, string> = {
  'agent-dispatch':        'Dispatch',
  'agent-complete':        'Complete',
  'agent-fail':            'Fail',
  'memory-write':          'Write',
  'memory-search':         'Search',
  'memory-consolidation':  'Consolidate',
  'health-import':         'Import',
  'health-checkin':        'Check-in',
  'lcm-status-change':     'LCM Status',
  'cost-alert':            'Cost Alert',
  'cost-update':           'Cost Update',
  'obsidian-sync':         'Sync',
  'obsidian-push':         'Push',
  'obsidian-pull':         'Pull',
  'task-create':           'Create',
  'task-complete':         'Complete',
  'task-update':           'Update',
  'gateway-online':        'Online',
  'gateway-offline':       'Offline',
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  } catch {
    return iso.slice(11, 19)
  }
}

// ── Event Entry ──

interface EventEntryProps {
  event: TelemetryEvent
  isNew: boolean
}

function EventEntry({ event, isNew }: EventEntryProps) {
  const icon = SUBSYSTEM_ICONS[event.subsystem] ?? '📡'
  const label = EVENT_TYPE_LABELS[event.type] ?? event.type
  const ts = formatTimestamp(event.timestamp)

  return (
    <div
      className={`px-3 py-1.5 border-b flex items-start gap-2 transition-opacity duration-300 ${isNew ? 'animate-fade-in' : ''}`}
      style={{ borderColor: 'var(--border-secondary, rgba(255,255,255,0.06))' }}
    >
      <span className="text-[10px] font-mono shrink-0 mt-px" style={{ color: 'var(--text-tertiary, #555)' }}>
        {ts}
      </span>
      <span className="text-xs shrink-0">{icon}</span>
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-mono font-medium shrink-0" style={{ color: 'var(--text-secondary, #aaa)' }}>
          {label}
        </span>
        <span className="text-[10px] truncate" style={{ color: 'var(--text-tertiary, #666)' }}>
          {event.summary}
        </span>
      </div>
    </div>
  )
}

// ── Props ──

export interface ActivityHudProps {
  events: TelemetryEvent[]
  visible: boolean
  newCount: number
  onToggle: () => void
}

// ── Main Component ──

export function ActivityHud({ events, visible, newCount, onToggle }: ActivityHudProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set())
  const prevEventsRef = useRef<TelemetryEvent[]>([])

  // Track newly added events for fade-in animation
  useEffect(() => {
    const prevIds = new Set(prevEventsRef.current.map(e => e.eventId))
    const incoming = events.filter(e => !prevIds.has(e.eventId))
    if (incoming.length > 0) {
      const ids = new Set(incoming.map(e => e.eventId))
      setNewEventIds(ids)
      const timer = setTimeout(() => setNewEventIds(new Set()), 600)
      prevEventsRef.current = events
      return () => clearTimeout(timer)
    }
    prevEventsRef.current = events
  }, [events])

  // Auto-scroll to top when new events arrive (newest first)
  useEffect(() => {
    if (visible && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [events.length, visible])

  // Cap at 100 events (parent should also cap, but guard here)
  const displayEvents = events.slice(0, 100)

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        onClick={onToggle}
        className="absolute right-3 top-14 pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-mono transition-colors"
        style={{
          background: visible ? 'rgba(255,92,92,0.15)' : 'rgba(18,20,26,0.85)',
          color: visible ? 'var(--accent, #ff5c5c)' : 'var(--text-tertiary, #666)',
          backdropFilter: 'blur(8px)',
          border: visible ? '1px solid rgba(255,92,92,0.3)' : '1px solid transparent',
          zIndex: 26,
        }}
        aria-label={visible ? 'Hide activity feed' : 'Show activity feed'}
      >
        <span>📡</span>
        <span>Activity</span>
        {!visible && newCount > 0 && (
          <span
            className="flex items-center justify-center rounded-full text-[9px] font-bold min-w-[16px] h-4 px-1"
            style={{ background: 'var(--accent, #ff5c5c)', color: '#fff' }}
          >
            {newCount > 99 ? '99+' : newCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {visible && (
        <div
          className="absolute right-3 top-24 bottom-14 w-72 rounded-xl border overflow-hidden pointer-events-auto flex flex-col"
          style={{
            background: 'rgba(18, 20, 26, 0.92)',
            borderColor: 'var(--border-primary, rgba(255,255,255,0.1))',
            backdropFilter: 'blur(12px)',
            zIndex: 25,
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b shrink-0"
            style={{ borderColor: 'var(--border-primary, rgba(255,255,255,0.1))' }}
          >
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-mono" style={{ color: 'var(--text-secondary, #aaa)' }}>
                Live Feed
              </span>
              {displayEvents.length > 0 && (
                <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary, #555)' }}>
                  {displayEvents.length}/100
                </span>
              )}
            </div>
            <button
              onClick={onToggle}
              className="text-xs leading-none"
              style={{ color: 'var(--text-tertiary, #555)' }}
              aria-label="Close activity feed"
            >
              ✕
            </button>
          </div>

          {/* Scrollable event list */}
          <div ref={scrollRef} className="overflow-y-auto flex-1">
            {displayEvents.length === 0 ? (
              <div
                className="px-3 py-8 text-center text-[10px] font-mono"
                style={{ color: 'var(--text-tertiary, #555)' }}
              >
                Awaiting telemetry…
              </div>
            ) : (
              displayEvents.map(event => (
                <EventEntry
                  key={event.eventId}
                  event={event}
                  isNew={newEventIds.has(event.eventId)}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Fade-in keyframe (injected once) */}
      <style>{`
        @keyframes hud-fade-in {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .animate-fade-in {
          animation: hud-fade-in 0.3s ease-out forwards;
        }
      `}</style>
    </>
  )
}

export default ActivityHud
