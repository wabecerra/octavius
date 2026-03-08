'use client'

import { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { MemoryStats } from '@/components/MemoryStats'
import { MemoryExplorer } from '@/components/MemoryExplorer'
import { MemoryItemCreator } from '@/components/MemoryItemCreator'
import { MemoryConfigSection } from '@/components/MemoryConfigSection'
import { MemoryGraphView } from '@/components/MemoryGraphView'

function ResizeHandle() {
  return (
    <PanelResizeHandle className="w-[1px] bg-[var(--border-primary)] hover:bg-[var(--accent)] active:bg-[var(--accent)] transition-colors duration-150 mx-1 cursor-col-resize" />
  )
}

export function MemoryView() {
  const [graphStartId, setGraphStartId] = useState<string | null>(null)
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0)

  return (
    <div className="space-y-6">
      <MemoryStats />
      <PanelGroup
        direction="horizontal"
        autoSaveId="octavius-memory-panels"
        className="min-h-[500px]"
      >
        <Panel defaultSize={25} minSize={20} maxSize={40}>
          <div className="h-full overflow-auto pr-1">
            <MemoryExplorer
              onViewGraph={(memoryId) => setGraphStartId(memoryId)}
              refreshKey={memoryRefreshKey}
            />
          </div>
        </Panel>
        <ResizeHandle />
        <Panel defaultSize={75}>
          <div className="h-full overflow-auto pl-1 space-y-6">
            <MemoryItemCreator
              onCreated={() => setMemoryRefreshKey((k) => k + 1)}
            />
            <MemoryConfigSection />
            <MemoryGraphView startId={graphStartId} />
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
