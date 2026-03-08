'use client'

import { useState, useEffect } from 'react'
import { useProfile } from '@/hooks'
import { useGatewayInit, useGatewayReconnect, getGatewayClient } from '@/lib/gateway/use-gateway'
import { GatewayStatusPanel } from '@/components/GatewayStatusPanel'
import { ScheduledJobsPanel } from '@/components/ScheduledJobsPanel'
import { HeartbeatActionsPanel } from '@/components/HeartbeatActionsPanel'

export function SettingsView() {
  const { profile, updateProfile } = useProfile()

  const [accentColor, setAccentColor] = useState('#ff5c5c')
  const [weeklyReviewDay, setWeeklyReviewDay] = useState(0)

  const gateway = useGatewayInit()
  const reconnect = useGatewayReconnect()

  const [gatewayAddress, setGatewayAddressState] = useState('localhost')
  const [gatewayPort, setGatewayPortState] = useState(18789)
  const [scheduledJobs] = useState([])
  const [heartbeatActions] = useState([])
  const [registeredAgents] = useState([])
  const [activeSessions] = useState([])
  const [recentSessions] = useState([])
  const [dailyTokenUsage] = useState<Record<string, number>>({})

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const [gwAddress, setGwAddress] = useState(gatewayAddress)
  const [gwPort, setGwPort] = useState(String(gatewayPort))
  const [gwToken, setGwToken] = useState('')
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')

  const setGatewayAddress = (address: string, port: number) => {
    setGatewayAddressState(address)
    setGatewayPortState(port)
  }

  useEffect(() => {
    document.documentElement.style.setProperty('--color-accent', accentColor)
  }, [accentColor])

  return (
    <div className="space-y-6">
      {/* Profile Form */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Profile</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Name</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => updateProfile({ name: e.target.value })}
              placeholder="Your name"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Core Values</label>
            <textarea
              value={profile.coreValues}
              onChange={(e) => updateProfile({ coreValues: e.target.value })}
              placeholder="What matters most to you?"
              rows={2}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] resize-none transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Life Vision</label>
            <textarea
              value={profile.lifeVision}
              onChange={(e) => updateProfile({ lifeVision: e.target.value })}
              placeholder="Where do you see yourself heading?"
              rows={2}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] resize-none transition-colors duration-150"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-[var(--border-primary)] bg-transparent cursor-pointer"
                />
                <span className="text-xs text-[var(--text-tertiary)] font-mono">{accentColor}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Weekly Review Day</label>
              <select
                value={weeklyReviewDay}
                onChange={(e) => setWeeklyReviewDay(Number(e.target.value))}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
              >
                {DAYS.map((day, i) => (
                  <option key={day} value={i}>{day}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Gateway Configuration */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Gateway Connection</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Gateway Address</label>
            <input
              type="text"
              value={gwAddress}
              onChange={(e) => setGwAddress(e.target.value)}
              placeholder="localhost"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Port</label>
            <input
              type="number"
              value={gwPort}
              onChange={(e) => setGwPort(e.target.value)}
              placeholder="18789"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setGatewayAddress(gwAddress || 'localhost', Number(gwPort) || 18789)}
              className="px-4 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
            >
              Update
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">Gateway Token</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={gwToken}
              onChange={(e) => { setGwToken(e.target.value); setTokenStatus('idle') }}
              placeholder="Enter gateway token"
              className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
            <button
              type="button"
              disabled={!gwToken || tokenStatus === 'validating'}
              onClick={async () => {
                setTokenStatus('validating')
                try {
                  const res = await fetch('/api/gateway/validate-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: gwToken, address: gwAddress || 'localhost', port: Number(gwPort) || 18789 }),
                  })
                  const data = await res.json()
                  setTokenStatus(data.valid ? 'valid' : 'invalid')
                  if (data.valid) {
                    const client = getGatewayClient()
                    if (client) client.setToken(gwToken)
                  }
                } catch {
                  setTokenStatus('invalid')
                }
              }}
              className="px-4 py-2 text-sm bg-[var(--accent-muted)] text-[var(--accent)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors duration-150 disabled:opacity-40"
            >
              {tokenStatus === 'validating' ? 'Validating…' : 'Validate'}
            </button>
          </div>
          {tokenStatus === 'valid' && <p className="text-xs text-[var(--color-success)] mt-1">Token validated and saved</p>}
          {tokenStatus === 'invalid' && <p className="text-xs text-[var(--color-error)] mt-1">Token validation failed</p>}
        </div>
      </div>

      {/* Gateway Status Panel */}
      <GatewayStatusPanel
        connectionInfo={{
          status: gateway.status,
          address: gatewayAddress,
          port: gatewayPort,
          connectedAt: gateway.connectedAt,
          lastHealthyAt: gateway.lastHealthyAt,
          consecutiveFailures: 0,
        }}
        registeredAgents={registeredAgents}
        activeSessions={activeSessions}
        recentSessions={recentSessions}
        dailyTokenUsage={dailyTokenUsage}
        onReconnect={reconnect}
        onProvision={async () => {
          try {
            await fetch('/api/gateway/provision', { method: 'POST' })
          } catch {
            // Provision errors handled by the API
          }
        }}
      />

      {/* Scheduled Jobs Panel */}
      <ScheduledJobsPanel
        jobs={scheduledJobs}
        onCreateJob={async () => {}}
        onUpdateJob={() => {}}
        onDeleteJob={() => {}}
        onTriggerJob={async () => {}}
      />

      {/* Heartbeat Actions Panel */}
      <HeartbeatActionsPanel
        actions={heartbeatActions}
        onToggle={() => {}}
        onSave={() => {}}
      />
    </div>
  )
}
