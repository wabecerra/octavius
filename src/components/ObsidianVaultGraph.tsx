'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { ObsidianGraphExport, ObsidianGraphNode } from '@/lib/memory/models'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

const SYNCED_COLOR = '#22c55e'
const UNSYNCED_COLOR = '#6366f1'
const PHANTOM_COLOR = '#71717a'

function getNodeColor(node: ObsidianGraphNode): string {
  if (node.isMemorySynced) return SYNCED_COLOR
  if (node.linkCount === 0) return PHANTOM_COLOR
  return UNSYNCED_COLOR
}

interface GraphData {
  nodes: Array<{ id: string; label: string; path: string; isMemorySynced: boolean; linkCount: number; color: string; val: number }>
  links: Array<{ source: string; target: string }>
}

export function ObsidianVaultGraph() {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null)

  const [graph, setGraph] = useState<ObsidianGraphExport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<ObsidianGraphNode | null>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const [folder, setFolder] = useState('/')

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fetchGraph = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Check status first — don't fetch graph if Obsidian is disabled
      const statusRes = await fetch('/api/obsidian/status')
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        if (!statusData.enabled) {
          setError(null)
          setLoading(false)
          return
        }
        if (!statusData.connected) {
          setError('Obsidian is not connected. Enable and configure it in the panel on the right.')
          setLoading(false)
          return
        }
      }

      const params = new URLSearchParams()
      if (folder !== '/') params.set('folder', folder)
      const res = await fetch(`/api/obsidian/graph?${params}`)
      if (res.ok) {
        setGraph(await res.json())
      } else {
        const data = await res.json()
        setError(data.error ?? 'Failed to load vault graph')
      }
    } catch {
      setError('Network error loading vault graph')
    } finally {
      setLoading(false)
    }
  }, [folder])

  useEffect(() => { fetchGraph() }, [fetchGraph])

  const graphData: GraphData = useMemo(() => {
    if (!graph) return { nodes: [], links: [] }
    return {
      nodes: graph.nodes.map((n) => ({
        ...n,
        color: getNodeColor(n),
        val: 2 + Math.min(n.linkCount, 10) * 1.5,
      })),
      links: graph.edges.map((e) => ({ source: e.source, target: e.target })),
    }
  }, [graph])

  const paintNode = useCallback((node: Record<string, unknown>, ctx: CanvasRenderingContext2D) => {
    const x = node.x as number
    const y = node.y as number
    const color = node.color as string
    const linkCount = node.linkCount as number
    const radius = 3 + Math.min(linkCount, 10) * 1.2
    const isHovered = hoveredNode?.id === node.id
    const isSynced = node.isMemorySynced as boolean

    if (isHovered) {
      ctx.beginPath()
      ctx.arc(x, y, radius + 4, 0, 2 * Math.PI)
      ctx.fillStyle = `${color}40`
      ctx.fill()
    }

    ctx.beginPath()
    ctx.arc(x, y, radius, 0, 2 * Math.PI)
    ctx.fillStyle = isHovered ? color : `${color}cc`
    ctx.fill()

    if (isSynced) {
      ctx.strokeStyle = SYNCED_COLOR
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    const label = (node.label as string) || ''
    const truncated = label.length > 20 ? label.slice(0, 20) + '…' : label
    ctx.font = `${isHovered ? 'bold ' : ''}9px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = isHovered ? '#fafafa' : '#a1a1aa'
    ctx.fillText(truncated, x, y + radius + 10)
  }, [hoveredNode])

  const handleNodeHover = useCallback((node: Record<string, unknown> | null) => {
    if (!node) { setHoveredNode(null); return }
    setHoveredNode({
      id: node.id as string,
      label: node.label as string,
      path: node.path as string,
      isMemorySynced: node.isMemorySynced as boolean,
      memoryId: node.memoryId as string | undefined,
      linkCount: node.linkCount as number,
    })
  }, [])

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl transition-colors duration-150">
      <div className="p-4 border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">💎</span>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Obsidian Vault Graph</h2>
          {graph && (
            <span className="text-xs text-[var(--text-secondary)] ml-auto">
              {graph.nodes.length} notes · {graph.edges.length} links
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="Vault folder (/ for root)"
            className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
          />
          <button
            onClick={fetchGraph}
            disabled={loading}
            className="px-3 py-1 text-xs rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative" style={{ height: 400 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-secondary)] bg-opacity-80 z-10">
            <span className="text-sm text-[var(--text-secondary)] animate-pulse">Loading vault graph…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-secondary)] bg-opacity-80 z-10">
            <div className="text-center">
              <span className="text-sm text-[var(--color-error)]">{error}</span>
              <p className="text-xs text-[var(--text-tertiary)] mt-2">
                Make sure Obsidian is running with the Local REST API plugin enabled.
              </p>
            </div>
          </div>
        )}
        {!loading && !error && graphData.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-[var(--text-secondary)]">No notes found in vault</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">Connect Obsidian in the config panel below</p>
            </div>
          </div>
        )}
        {graphData.nodes.length > 0 && (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            width={containerWidth}
            height={400}
            backgroundColor="#12141a"
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={(node: Record<string, unknown>, color: string, ctx: CanvasRenderingContext2D) => {
              const x = node.x as number
              const y = node.y as number
              const linkCount = node.linkCount as number
              const radius = 3 + Math.min(linkCount, 10) * 1.2 + 2
              ctx.beginPath()
              ctx.arc(x, y, radius, 0, 2 * Math.PI)
              ctx.fillStyle = color
              ctx.fill()
            }}
            linkColor={() => 'rgba(255, 255, 255, 0.15)'}
            linkWidth={() => 0.5}
            onNodeHover={handleNodeHover}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            enableNodeDrag={true}
            cooldownTicks={100}
          />
        )}

        {hoveredNode && (
          <div className="absolute bottom-4 left-4 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-xs max-w-xs pointer-events-none shadow-lg z-20">
            <p className="text-[var(--text-primary)] font-medium">{hoveredNode.label}</p>
            <p className="text-[var(--text-tertiary)] mt-0.5">{hoveredNode.path}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[var(--text-tertiary)]">{hoveredNode.linkCount} links</span>
              {hoveredNode.isMemorySynced && (
                <span className="px-1.5 py-0 rounded text-[10px] font-medium" style={{ backgroundColor: `${SYNCED_COLOR}20`, color: SYNCED_COLOR }}>
                  synced
                </span>
              )}
            </div>
          </div>
        )}

        <div className="absolute top-2 right-2 bg-[var(--bg-tertiary)] bg-opacity-90 border border-[var(--border-secondary)] rounded-lg px-2 py-1.5 text-[10px] z-20">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SYNCED_COLOR }} />
            <span className="text-[var(--text-secondary)]">Synced to Memory</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: UNSYNCED_COLOR }} />
            <span className="text-[var(--text-secondary)]">Vault Only</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PHANTOM_COLOR }} />
            <span className="text-[var(--text-secondary)]">Unlinked</span>
          </div>
        </div>
      </div>
    </div>
  )
}
