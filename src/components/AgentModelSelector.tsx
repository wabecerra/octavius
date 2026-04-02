'use client'

import { useState, useEffect, useRef } from 'react'
import { UI_POPULAR_MODELS } from '@/lib/models'

interface AgentModelConfig {
  agentId: string
  provider: string
  model: string
}

const PROVIDER_OPTIONS = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'bedrock', label: 'Amazon Bedrock' },
]

export function AgentModelSelector({
  agentId,
  configs,
  onSave,
}: {
  agentId: string
  configs: AgentModelConfig[]
  onSave: (agentId: string, provider: string, model: string) => void
}) {
  const current = configs.find((c) => c.agentId === agentId)
  const [expanded, setExpanded] = useState(false)
  const [provider, setProvider] = useState(current?.provider || 'openrouter')
  const [model, setModel] = useState(current?.model || '')
  const [customModel, setCustomModel] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (current) {
      setProvider(current.provider)
      setModel(current.model)
    }
  }, [current])

  const handleSave = (newProvider: string, newModel: string) => {
    if (!newModel.trim()) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      onSave(agentId, newProvider, newModel)
    }, 500)
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full text-left text-[10px] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors truncate font-mono"
        title={`${provider}: ${model}`}
      >
        🔧 {model ? model.split('/').pop() : 'Configure model'}
      </button>
    )
  }

  const popularModels = UI_POPULAR_MODELS[provider] || []
  const isPopular = popularModels.includes(model)

  return (
    <div className="space-y-2 mt-2 pt-2 border-t border-[var(--border-secondary,var(--border-primary))]">
      {/* Provider */}
      <select
        value={provider}
        onChange={(e) => {
          setProvider(e.target.value)
          const defaults = UI_POPULAR_MODELS[e.target.value]
          if (defaults?.[0]) {
            setModel(defaults[0])
            handleSave(e.target.value, defaults[0])
          }
        }}
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-1 text-[var(--text-primary)] text-[10px] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
      >
        {PROVIDER_OPTIONS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      {/* Model */}
      <select
        value={isPopular ? model : 'custom'}
        onChange={(e) => {
          if (e.target.value === 'custom') {
            setCustomModel(model)
          } else {
            setModel(e.target.value)
            handleSave(provider, e.target.value)
          }
        }}
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-1 text-[var(--text-primary)] text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
      >
        {popularModels.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
        <option value="custom">Custom…</option>
      </select>

      {!isPopular && (
        <div className="flex gap-1">
          <input
            type="text"
            value={customModel || model}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="provider/model"
            className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-1 text-[var(--text-primary)] text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
          />
          <button
            type="button"
            onClick={() => {
              if (customModel.trim()) {
                setModel(customModel)
                handleSave(provider, customModel)
              }
            }}
            className="px-2 py-1 text-[10px] bg-[var(--accent-muted)] text-[var(--accent)] rounded hover:bg-[var(--bg-hover)] transition-colors"
          >
            ✓
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="text-[10px] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)]"
      >
        ▲ Collapse
      </button>
    </div>
  )
}
