'use client'

import { useState, useRef, useEffect } from 'react'
import type { ChatMessage, GatewayStatus } from '@/lib/gateway/types'
import { isSlashCommand } from '@/lib/chat/commands'

export interface ChatViewProps {
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

function renderBoldText(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  )
}

export function ChatView({ messages, onSendMessage, isLoading, gatewayStatus }: ChatViewProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputIsCommand = isSlashCommand(input)

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
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-view">
      {/* Status bar */}
      <div className="chat-view__status">
        <div className="chat-view__status-left">
          <span className="text-sm">🧠</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">Octavius</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${
            gatewayStatus === 'connected' ? 'bg-[var(--color-success)]' :
            gatewayStatus === 'degraded' ? 'bg-[var(--color-warning)]' :
            'bg-[var(--color-error)]'
          }`} />
          <span className="text-xs text-[var(--text-tertiary)]">{gatewayStatus}</span>
        </div>
      </div>

      {/* Offline banner */}
      {gatewayStatus === 'disconnected' && (
        <div className="chat-view__banner">
          Gateway offline — responses use fallback adapter
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="chat-view__messages">
        {messages.length === 0 && (
          <div className="chat-view__empty">
            <span className="text-3xl mb-2 block">🧠</span>
            <p className="text-sm text-[var(--text-tertiary)]">
              Send a message to start a conversation
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} onSendMessage={onSendMessage} />
        ))}
        {isLoading && (
          <div className="chat-view__typing">
            <span className="chat-view__typing-dot" />
            <span className="chat-view__typing-dot" style={{ animationDelay: '0.15s' }} />
            <span className="chat-view__typing-dot" style={{ animationDelay: '0.3s' }} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="chat-view__input-area">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Octavius..."
          disabled={isLoading}
          className="chat-view__input"
          style={inputIsCommand ? { fontFamily: 'var(--font-mono)', color: 'var(--color-info, #60a5fa)' } : {}}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="chat-view__send"
          aria-label="Send message"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function ChatBubble({ message, onSendMessage }: { message: ChatMessage; onSendMessage: (content: string) => void }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) {
    return (
      <div className="chat-view__system-msg">
        <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
          {renderBoldText(message.content)}
        </span>
      </div>
    )
  }

  return (
    <div className={`chat-view__bubble-row ${isUser ? 'chat-view__bubble-row--user' : ''}`}>
      <div className={`chat-view__bubble ${isUser ? 'chat-view__bubble--user' : 'chat-view__bubble--bot'}`}>
        <div className="chat-view__bubble-meta">
          <span className="text-xs font-medium text-[var(--text-tertiary)]">
            {message.agentId || roleLabels[message.role]}
          </span>
          <span className="text-xs text-[var(--text-disabled)]">{formatTimestamp(message.timestamp)}</span>
        </div>
        <div className="chat-view__bubble-content">
          {message.content}
        </div>
      </div>
      {message.approvalNeeded && (
        <div className="chat-view__approval">
          <div className="text-xs font-semibold mb-1">Approval needed</div>
          <div className="text-xs mb-2 opacity-90">{message.approvalNeeded.question}</div>
          <div className="flex gap-2">
            <button
              onClick={() => onSendMessage(`/approve ${message.approvalNeeded!.subtaskId}`)}
              className="chat-view__approval-btn chat-view__approval-btn--approve"
            >
              Approve
            </button>
            <button
              onClick={() => onSendMessage(`/reject ${message.approvalNeeded!.subtaskId}`)}
              className="chat-view__approval-btn chat-view__approval-btn--reject"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
