'use client'

import { useState, useEffect, useCallback } from 'react'
import type { MemoryConfig } from '@/lib/memory/models'

interface ObsidianStatus {
  enabled: boolean
  connected: boolean
  authenticated?: boolean
  api_url?: string
  vault_folder?: string
  sync_direction?: string
  error?: string
}

interface SyncResult {
  pushed: number
  pulled: number
  errors: string[]
}

const inputClass =
  'w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150'
const labelClass = 'text-xs text-[var(--text-secondary)] mb-1 block'
const selectClass =
  'w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150'

export function ObsidianSyncPanel() {
  const [status, setStatus] = useState<ObsidianStatus | null>(null)
  const [config, setConfig] = useState<Partial<MemoryConfig>>({
    obsidian_enabled: false,
    obsidian_api_url: 'https://127.0.0.1:27124',
    obsidian_api_key: '',
    obsidian_vault_folder: 'octavius',
    obsidian_sync_direction: 'bidirectional',
    obsidian_insecure_ssl: true,
  })
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/obsidian/status')
      if (res.ok) setStatus(await res.json())
    } catch { /* ignore */ }
  }, [])

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/memory/config')
      if (res.ok) {
        const data = await res.json()
        setConfig((prev) => ({ ...prev, ...data }))
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchConfig()
    fetchStatus()
  }, [fetchConfig, fetchStatus])

  const saveConfig = async (updates: Partial<MemoryConfig>) => {
    setSaving(true)
    const newConfig = { ...config, ...updates }
    setConfig(newConfig)
    try {
      await fetch('/api/memory/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      // Re-check status after config change
      await fetchStatus()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const runSync = async (direction: string) => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/obsidian/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      })
      if (res.ok) setSyncResult(await res.json())
    } catch { /* ignore */ }
    finally { setSyncing(false) }
  }

  if (loading) {
    return (
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6">
        <p className="text-sm text-[var(--text-tertiary)]">Loading Obsidian config…</p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">💎</span>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Obsidian Integration</h3>
        </div>
        {status && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            status.connected
              ? 'bg-green-500/20 text-green-400'
              : status.enabled
                ? 'bg-red-500/20 text-red-400'
                : 'bg-zinc-500/20 text-zinc-400'
          }`}>
            {status.connected ? '● Connected' : status.enabled ? '● Disconnected' : '○ Disabled'}
          </span>
        )}
        {saving && <span className="text-xs text-[var(--accent)]">Saving…</span>}
      </div>

      {/* Enable toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={config.obsidian_enabled}
          onChange={(e) => saveConfig({ obsidian_enabled: e.target.checked })}
          className="w-4 h-4 rounded border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--accent)] focus:ring-[var(--border-focus)]"
        />
        <span className="text-sm text-[var(--text-secondary)]">Enable Obsidian sync</span>
      </label>

      {config.obsidian_enabled && (
        <>
          {/* Setup guide */}
          {!status?.connected && (
            <div className="bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg p-3 text-xs text-[var(--text-secondary)] space-y-1">
              <p className="font-medium text-[var(--text-primary)]">Quick Setup</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Install the <span className="font-mono text-[var(--accent)]">Local REST API</span> plugin in Obsidian</li>
                <li>Enable it in Settings → Community Plugins</li>
                <li>Copy the API key from Settings → Local REST API</li>
                <li>Paste it below and hit Test Connection</li>
              </ol>
            </div>
          )}

          {/* Connection settings */}
          <div className="space-y-3">
            <div>
              <label className={labelClass}>API URL</label>
              <input
                type="text"
                value={config.obsidian_api_url}
                onChange={(e) => saveConfig({ obsidian_api_url: e.target.value })}
                placeholder="https://127.0.0.1:27124"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>API Key</label>
              <input
                type="password"
                value={config.obsidian_api_key}
                onChange={(e) => saveConfig({ obsidian_api_key: e.target.value })}
                placeholder="Paste from Obsidian settings"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Vault Folder</label>
              <input
                type="text"
                value={config.obsidian_vault_folder}
                onChange={(e) => saveConfig({ obsidian_vault_folder: e.target.value })}
                placeholder="octavius"
                className={inputClass}
              />
              <p className="text-xs text-[var(--text-disabled)] mt-1">
                Synced memories will be stored in this folder inside your vault
              </p>
            </div>
            <div>
              <label className={labelClass}>Sync Direction</label>
              <select
                value={config.obsidian_sync_direction}
                onChange={(e) => saveConfig({ obsidian_sync_direction: e.target.value as MemoryConfig['obsidian_sync_direction'] })}
                className={selectClass}
              >
                <option value="bidirectional">↔ Bidirectional</option>
                <option value="push_only">→ Push only (Memory → Vault)</option>
                <option value="pull_only">← Pull only (Vault → Memory)</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.obsidian_insecure_ssl}
                onChange={(e) => saveConfig({ obsidian_insecure_ssl: e.target.checked })}
                className="w-4 h-4 rounded border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--accent)] focus:ring-[var(--border-focus)]"
              />
              <span className="text-sm text-[var(--text-secondary)]">Accept self-signed SSL cert</span>
            </label>
          </div>

          {/* Test + Sync buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={fetchStatus}
              className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              Test Connection
            </button>
            <button
              onClick={() => runSync(config.obsidian_sync_direction ?? 'bidirectional')}
              disabled={syncing || !status?.connected}
              className="px-3 py-1.5 text-xs rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
            >
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>

          {/* Sync result */}
          {syncResult && (
            <div className="bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-[var(--color-success)]">↑ {syncResult.pushed} pushed</span>
                <span className="text-[var(--accent)]">↓ {syncResult.pulled} pulled</span>
              </div>
              {syncResult.errors.length > 0 && (
                <div className="text-[var(--color-error)] mt-1">
                  {syncResult.errors.slice(0, 3).map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                  {syncResult.errors.length > 3 && (
                    <p>…and {syncResult.errors.length - 3} more errors</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Connection error */}
          {status?.error && (
            <p className="text-xs text-[var(--color-error)]">{status.error}</p>
          )}
        </>
      )}
    </div>
  )
}
