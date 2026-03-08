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
      <MemoryStats />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MemoryExplorer
            onViewGraph={(memoryId) => setGraphStartId(memoryId)}
            refreshKey={memoryRefreshKey}
          />
        </div>
        <div className="space-y-6">
          <MemoryItemCreator
            onCreated={() => setMemoryRefreshKey((k) => k + 1)}
          />
          <MemoryConfigSection />
        </div>
      </div>
      <MemoryGraphView startId={graphStartId} />
    </div>
  )
}
