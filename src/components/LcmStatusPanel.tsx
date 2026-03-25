'use client'

import { useState, useEffect, useCallback } from 'react'

interface LcmStatus {
  available: boolean
  dbPath: string
  conversations: number
  totalMessages: number
  summaryStats: {
    totalSummaries: number
    leafSummaries: number
    condensedSummaries: number
    maxDepth: number
    totalSummaryTokens: number
  }
  largeFiles: number
  dbSizeBytes: number
}

interface LcmConversation {
  id: number
  sessionId: string
  sessionKey: string | null
  messageCount: number
  createdAt: string
  lastMessageAt: string | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`
  return `${(tokens / 1_000_000).toFixed(1)}M`
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function LcmStatusPanel() {
  const [status, setStatus] = useState<LcmStatus | null>(null)
  const [conversations, setConversations] = useState<LcmConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [showConversations, setShowConversations] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/lcm/status')
      if (res.ok) setStatus(await res.json())
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/lcm/conversations')
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations ?? [])
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { void fetchStatus() }, [fetchStatus])

  useEffect(() => {
    if (showConversations) void fetchConversations()
  }, [showConversations, fetchConversations])

  if (loading) {
    return (
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5 transition-colors duration-150">
        <div className="animate-pulse h-20 bg-[var(--bg-tertiary)] rounded-lg" />
      </div>
    )
  }

  if (!status || !status.available) {
    return (
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5 transition-colors duration-150">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">🔗</span>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Lossless Context</h3>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <span className="w-2 h-2 rounded-full bg-[var(--text-tertiary)]" />
            Not installed
          </span>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Install lossless-claw for persistent conversation memory across all agent sessions.
          Your agents will never forget context, even in long conversations.
        </p>
        <div className="mt-3 p-2.5 bg-[var(--bg-tertiary)] rounded-lg">
          <code className="text-[11px] text-[var(--text-secondary)] font-mono">
            openclaw plugins install @martian-engineering/lossless-claw
          </code>
        </div>
      </div>
    )
  }

  const s = status.summaryStats

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-5 transition-colors duration-150">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🔗</span>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Lossless Context</h3>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-[var(--color-success)]">
          <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
          Active
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <p className="text-lg font-semibold text-[var(--text-primary)]">{status.conversations}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Conversations</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-[var(--text-primary)]">{status.totalMessages.toLocaleString()}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Messages</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-[var(--text-primary)]">{s.totalSummaries}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Summaries</p>
        </div>
      </div>

      {/* DAG depth visualization */}
      {s.totalSummaries > 0 && (
        <div className="mb-3 space-y-1.5">
          <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Summary DAG</p>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--text-secondary)]">Leaf</span>
            <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: s.totalSummaries > 0 ? `${(s.leafSummaries / s.totalSummaries) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-[var(--text-tertiary)] w-8 text-right">{s.leafSummaries}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--text-secondary)]">Condensed</span>
            <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full"
                style={{ width: s.totalSummaries > 0 ? `${(s.condensedSummaries / s.totalSummaries) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-[var(--text-tertiary)] w-8 text-right">{s.condensedSummaries}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
            <span>Max depth: {s.maxDepth}</span>
            <span>{formatTokens(s.totalSummaryTokens)} tokens compressed</span>
          </div>
        </div>
      )}

      {/* Footer stats */}
      <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] pt-2 border-t border-[var(--border-primary)]">
        <span>{formatBytes(status.dbSizeBytes)}</span>
        {status.largeFiles > 0 && <span>{status.largeFiles} stored files</span>}
        <button
          type="button"
          onClick={() => setShowConversations(!showConversations)}
          className="text-[var(--accent)] hover:underline"
        >
          {showConversations ? 'Hide' : 'Browse'} conversations
        </button>
      </div>

      {/* Expandable conversation list */}
      {showConversations && (
        <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] text-center py-2">No conversations yet</p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-2 rounded-lg border border-[var(--border-secondary,var(--border-primary))] text-xs"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-[var(--text-primary)] font-mono truncate block">
                    {c.sessionKey ?? c.sessionId}
                  </span>
                  <span className="text-[var(--text-tertiary)]">
                    {c.messageCount} msgs
                  </span>
                </div>
                <span className="text-[var(--text-tertiary)] ml-2 shrink-0">
                  {timeAgo(c.lastMessageAt)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
