'use client'

import { useState, useEffect, useCallback } from 'react'

interface AgentFiles {
  id: string
  label: string
  files: Record<string, string>
}

/**
 * Workspace Files Editor — view and edit agent Markdown files (SOUL.md, AGENTS.md, USER.md, TOOLS.md, HEARTBEAT.md)
 * directly from the dashboard. Lives in the Agents tab.
 */
export function WorkspaceFilesEditor() {
  const [agents, setAgents] = useState<AgentFiles[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [selectedFile, setSelectedFile] = useState<string>('')
  const [content, setContent] = useState<string>('')
  const [originalContent, setOriginalContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/gateway/workspace-files')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      const loaded = (data.agents ?? []) as AgentFiles[]
      setAgents(loaded)

      // Auto-select first agent with files
      if (!selectedAgent && loaded.length > 0) {
        const first = loaded.find((a) => Object.keys(a.files).length > 0) ?? loaded[0]
        setSelectedAgent(first.id)
        const firstFile = Object.keys(first.files)[0] ?? ''
        setSelectedFile(firstFile)
        setContent(first.files[firstFile] ?? '')
        setOriginalContent(first.files[firstFile] ?? '')
      }
    } catch {
      // workspace files not provisioned yet — that's fine
    } finally {
      setLoading(false)
    }
  }, [selectedAgent])

  useEffect(() => { void fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectAgent = (agentId: string) => {
    setSelectedAgent(agentId)
    setSaveStatus('idle')
    const agent = agents.find((a) => a.id === agentId)
    if (agent) {
      const firstFile = Object.keys(agent.files)[0] ?? ''
      setSelectedFile(firstFile)
      setContent(agent.files[firstFile] ?? '')
      setOriginalContent(agent.files[firstFile] ?? '')
    }
  }

  const selectFile = (fileName: string) => {
    setSelectedFile(fileName)
    setSaveStatus('idle')
    const agent = agents.find((a) => a.id === selectedAgent)
    if (agent) {
      setContent(agent.files[fileName] ?? '')
      setOriginalContent(agent.files[fileName] ?? '')
    }
  }

  const handleSave = async () => {
    if (!selectedAgent || !selectedFile) return
    setSaving(true)
    setSaveStatus('idle')
    try {
      const res = await fetch('/api/gateway/workspace-files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgent, fileName: selectedFile, content }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaveStatus('saved')
      setOriginalContent(content)
      // Update local state
      setAgents((prev) =>
        prev.map((a) =>
          a.id === selectedAgent ? { ...a, files: { ...a.files, [selectedFile]: content } } : a,
        ),
      )
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  const isDirty = content !== originalContent
  const currentAgent = agents.find((a) => a.id === selectedAgent)
  const fileNames = currentAgent ? Object.keys(currentAgent.files) : []
  const hasFiles = agents.some((a) => Object.keys(a.files).length > 0)

  if (loading) {
    return (
      <div className="glass p-6">
        <p className="text-sm text-foreground-tertiary">Loading workspace files…</p>
      </div>
    )
  }

  if (!hasFiles) {
    return (
      <div className="glass p-6 space-y-2">
        <h3 className="text-lg font-semibold text-foreground">Agent Workspace Files</h3>
        <p className="text-sm text-foreground-tertiary">
          No workspace files found. Go to Settings → Gateway Connection → click &quot;Provision Agents&quot; to generate them.
        </p>
      </div>
    )
  }

  // Group agents: orchestrator on top, then quadrant generalists, then specialists
  const orchestrator = agents.find((a) => a.id === 'octavius-orchestrator')
  const generalists = agents.filter((a) => a.id.startsWith('agent-'))
  const specialists = agents.filter((a) => a.id.startsWith('specialist-'))

  return (
    <div className="glass p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Agent Workspace Files</h3>
        <button
          type="button"
          onClick={() => void fetchAll()}
          className="text-xs text-foreground-tertiary hover:text-foreground-secondary transition-colors"
          title="Reload files from disk"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Agent selector */}
      <div className="space-y-2">
        {/* Orchestrator */}
        {orchestrator && (
          <>
            <p className="text-xs text-foreground-tertiary">Orchestrator</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => selectAgent(orchestrator.id)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  selectedAgent === orchestrator.id
                    ? 'bg-accent-muted text-accent border-accent/30'
                    : 'bg-secondary text-foreground-secondary border-border hover:bg-hover'
                }`}
              >
                {orchestrator.label}
                {Object.keys(orchestrator.files).length === 0 && (
                  <span className="ml-1 text-foreground-disabled">(empty)</span>
                )}
              </button>
            </div>
          </>
        )}

        {/* Generalists */}
        <p className="text-xs text-foreground-tertiary mt-2">Generalists</p>
        <div className="flex flex-wrap gap-1.5">
          {generalists.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => selectAgent(a.id)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                selectedAgent === a.id
                  ? 'bg-accent-muted text-accent border-accent/30'
                  : 'bg-secondary text-foreground-secondary border-border hover:bg-hover'
              }`}
            >
              {a.label}
              {Object.keys(a.files).length === 0 && (
                <span className="ml-1 text-foreground-disabled">(empty)</span>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-foreground-tertiary mt-2">Specialists</p>
        <div className="flex flex-wrap gap-1.5">
          {specialists.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => selectAgent(a.id)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                selectedAgent === a.id
                  ? 'bg-accent-muted text-accent border-accent/30'
                  : 'bg-secondary text-foreground-secondary border-border hover:bg-hover'
              }`}
            >
              {a.label}
              {Object.keys(a.files).length === 0 && (
                <span className="ml-1 text-foreground-disabled">(empty)</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* File tabs */}
      {fileNames.length > 0 && (
        <div className="flex gap-1 border-b border-border">
          {fileNames.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => selectFile(f)}
              className={`px-3 py-1.5 text-xs transition-colors border-b-2 ${
                selectedFile === f
                  ? 'text-accent border-accent'
                  : 'text-foreground-tertiary border-transparent hover:text-foreground-secondary'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      {selectedFile && (
        <div className="space-y-3">
          <textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); setSaveStatus('idle') }}
            rows={18}
            spellCheck={false}
            className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-foreground text-sm font-mono leading-relaxed placeholder:text-foreground-disabled focus:outline-none focus:ring-1 focus:ring-border-focus resize-y"
            aria-label={`Edit ${selectedFile} for ${currentAgent?.label ?? selectedAgent}`}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isDirty && (
                <span className="text-xs text-warning">Unsaved changes</span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-xs text-success">Saved</span>
              )}
              {saveStatus === 'error' && (
                <span className="text-xs text-error">Save failed</span>
              )}
            </div>
            <div className="flex gap-2">
              {isDirty && (
                <button
                  type="button"
                  onClick={() => { setContent(originalContent); setSaveStatus('idle') }}
                  className="px-3 py-1.5 text-xs text-foreground-secondary bg-secondary border border-border rounded-lg hover:bg-hover transition-colors"
                >
                  Discard
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!isDirty || saving}
                className="px-4 py-1.5 text-xs bg-accent-muted text-accent rounded-lg hover:bg-accent/30 transition-colors disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info note */}
      <p className="text-[10px] text-foreground-disabled leading-relaxed">
        These files live on disk at ~/.openclaw/workspace-octavius-*/. The Evolution Job updates them nightly with learned patterns. Previous versions are backed up in SQLite for audit.
      </p>
    </div>
  )
}
