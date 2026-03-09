'use client'

import { useState } from 'react'
import { MemoryStats } from '@/components/MemoryStats'
import { MemoryExplorer } from '@/components/MemoryExplorer'
import { MemoryItemCreator } from '@/components/MemoryItemCreator'
import { MemoryConfigSection } from '@/components/MemoryConfigSection'
import { MemoryGraphView } from '@/components/MemoryGraphView'

export function MemoryView() {
  const [graphStartId, setGraphStartId] = useState<string | null>(null)
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0)

  return (
    <div className="space-y-6">
      {/* Top: Overview stats */}
      <MemoryStats />

      {/* Middle: Explorer + Add/Config side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Left: Search & Browse */}
        <div className="min-w-0">
          <MemoryExplorer
            onViewGraph={(memoryId) => setGraphStartId(memoryId)}
            refreshKey={memoryRefreshKey}
          />
        </div>

        {/* Right: Add Memory + Config */}
        <div className="space-y-6 min-w-0">
          <MemoryItemCreator
            onCreated={() => setMemoryRefreshKey((k) => k + 1)}
          />
          <MemoryConfigSection />
        </div>
      </div>

      {/* Bottom: Knowledge Graph (full width for the canvas) */}
      <MemoryGraphView startId={graphStartId} />
    </div>
  )
}
