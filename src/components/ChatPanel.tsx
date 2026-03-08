'use client'

import { useState, useRef, useEffect } from 'react'
import type { ChatMessage, GatewayStatus } from '@/lib/gateway/types'

export interface ChatPanelProps {
  messages: ChatMessage[]
  onSendMessage: (content: string) => void
  isLoading: boolean
  gatewayStatus: GatewayStatus
}

const roleLabels: Record<ChatMessage['role'], string> = {
  user: 'You',
  assistant: 'Octavius',
  system: 'System',
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function ChatPanel({ messages, onSendMessage, isLoading, gatewayStatus }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, isLoading])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    onSendMessage(trimmed)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const unreadCount = collapsed ? messages.filter(m => m.role === 'assistant').length : 0

  return (
    <div className={`bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl flex flex-col transition-all duration-200 ${
      collapsed ? 'h-auto' : 'h-[500px]'
    }`}
    style={{ width: collapsed ? 'auto' : '380px' }}
    >
      {/* Header — clickable to collapse/expand */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)] cursor-pointer select-none hover:bg-[var(--bg-hover)] transition-colors duration-150 rounded-t-xl"
        onClick={() => setCollapsed(!collapsed)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🧠</span>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Octavius</h3>
          {collapsed && unreadCount > 0 && (
            <span className="bg-[var(--accent)] text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusDot status={gatewayStatus} />
          <span className="text-xs text-[var(--text-disabled)] transition-transform duration-200" style={{
            display: 'inline-block',
            transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>
            ▼
          </span>
        </div>
      </div>

      {/* Collapsible body */}
      {!collapsed && (
        <>
          {/* Fallback banner */}
          {gatewayStatus === 'disconnected' && (
            <div className="px-4 py-2 bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--color-warning)_20%,transparent)] text-xs text-[var(--color-warning)]">
              Gateway offline — responses use fallback adapter with limited capabilities
            </div>
          )}

          {/* Message history */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-[var(--text-tertiary)] text-center py-8">
                Send a message to start a conversation with Octavius
              </p>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
                Thinking…
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-[var(--border-primary)]">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                disabled={isLoading}
                className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] disabled:opacity-50 transition-colors duration-150"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="px-4 py-2 bg-[var(--accent-muted)] text-[var(--accent)] text-sm rounded-lg hover:bg-[var(--bg-hover)] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-xs text-[var(--text-tertiary)]">
          {message.agentId ? message.agentId : roleLabels[message.role]}
        </span>
        <span className="text-xs text-[var(--text-disabled)]">{formatTimestamp(message.timestamp)}</span>
      </div>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-[var(--accent-muted)] text-[var(--text-primary)]'
            : isSystem
              ? 'bg-[color-mix(in_srgb,var(--color-info)_10%,transparent)] text-[var(--color-info)] italic'
              : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
        }`}
      >
        {message.content}
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: GatewayStatus }) {
  const colors: Record<GatewayStatus, string> = {
    connected: 'bg-[var(--color-success)]',
    disconnected: 'bg-[var(--color-error)]',
    degraded: 'bg-[var(--color-warning)]',
    unknown: 'bg-[var(--text-tertiary)]',
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
      <span className={`w-2 h-2 rounded-full ${colors[status]}`} />
      {status}
    </span>
  )
}
