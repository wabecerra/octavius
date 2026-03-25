'use client'

import { useState } from 'react'
import { MemoryStats } from '@/components/MemoryStats'
import { MemoryExplorer } from '@/components/MemoryExplorer'
import { MemoryItemCreator } from '@/components/MemoryItemCreator'
import { MemoryConfigSection } from '@/components/MemoryConfigSection'
import { MemoryGraphView } from '@/components/MemoryGraphView'
import { ObsidianVaultGraph } from '@/components/ObsidianVaultGraph'
import { ObsidianSyncPanel } from '@/components/ObsidianSyncPanel'
import { LcmStatusPanel } from '@/components/LcmStatusPanel'

type GraphTab = 'memory' | 'obsidian'

export function MemoryView() {
  const [graphStartId, setGraphStartId] = useState<string | null>(null)
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0)
  const [graphTab, setGraphTab] = useState<GraphTab>('memory')

  return (
    <div className="space-y-6">
      {/* Top: Overview stats */}
      <MemoryStats />

      {/* Middle: Explorer + Add/Config side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Left: Search & Browse */}
        <div className="min-w-0">
          <MemoryExplorer
            onViewGraph={(memoryId) => {
              setGraphStartId(memoryId)
              setGraphTab('memory')
            }}
            refreshKey={memoryRefreshKey}
          />
        </div>

        {/* Right: Add Memory + Config + Obsidian */}
        <div className="space-y-6 min-w-0">
          <MemoryItemCreator
            onCreated={() => setMemoryRefreshKey((k) => k + 1)}
          />
          <MemoryConfigSection />
          <LcmStatusPanel />
          <ObsidianSyncPanel />
        </div>
      </div>

      {/* Bottom: Knowledge Graph with tab switcher */}
      <div>
        <div className="flex items-center gap-1 mb-3">
          <button
            onClick={() => setGraphTab('memory')}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              graphTab === 'memory'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-primary)]'
            }`}
          >
            🧠 Memory Graph
          </button>
          <button
            onClick={() => setGraphTab('obsidian')}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              graphTab === 'obsidian'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-primary)]'
            }`}
          >
            💎 Obsidian Vault
          </button>
        </div>
        {graphTab === 'memory' ? (
          <MemoryGraphView startId={graphStartId} />
        ) : (
          <ObsidianVaultGraph />
        )}
      </div>
    </div>
  )
}
