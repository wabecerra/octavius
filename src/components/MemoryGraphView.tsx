'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { GraphExport, GraphNode, QuadrantId } from '@/lib/memory/models'

// react-force-graph-2d uses canvas + requestAnimationFrame, needs dynamic import with SSR disabled
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

interface MemoryGraphViewProps {
  startId?: string | null
}

const QUADRANT_COLORS: Record<string, string> = {
  lifeforce: '#22c55e',
  industry: '#3b82f6',
  fellowship: '#f59e0b',
  essence: '#a855f7',
}

const NODE_DEFAULT_COLOR = '#71717a'

function getNodeColor(quadrant: string | null): string {
  return quadrant ? QUADRANT_COLORS[quadrant] ?? NODE_DEFAULT_COLOR : NODE_DEFAULT_COLOR
}

interface GraphData {
  nodes: Array<{ id: string; label: string; quadrant: string | null; importance: number; type: string; color: string; val: number }>
  links: Array<{ source: string; target: string; label: string; weight: number }>
}

export function MemoryGraphView({ startId }: MemoryGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null)

  const [graph, setGraph] = useState<GraphExport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [filterQuadrant, setFilterQuadrant] = useState<QuadrantId | ''>('')
  const [minImportance, setMinImportance] = useState(0)
  const [currentStartId, setCurrentStartId] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState(800)

  // Resize observer for container width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fetch graph data
  const fetchGraph = useCallback(
    async (sid: string) => {
      setLoading(true)
      setError(null)
      try {
        const body: Record<string, unknown> = {
          start_id: sid,
          max_depth: 2,
        }
        const filters: Record<string, unknown> = {}
        if (filterQuadrant) filters.quadrant = filterQuadrant
        if (minImportance > 0) filters.minImportance = minImportance
        if (Object.keys(filters).length > 0) body.filters = filters

        const res = await fetch('/api/memory/graph/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data: GraphExport = await res.json()
          setGraph(data)
          setCurrentStartId(sid)
        } else {
          const data = await res.json()
          setError(data.error ?? 'Failed to load graph')
        }
      } catch {
        setError('Network error loading graph')
      } finally {
        setLoading(false)
      }
    },
    [filterQuadrant, minImportance],
  )

  // Fetch when startId changes
  useEffect(() => {
    if (startId) fetchGraph(startId)
  }, [startId, fetchGraph])

  // Transform graph data for react-force-graph
  const graphData: GraphData = useMemo(() => {
    if (!graph) return { nodes: [], links: [] }
    return {
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        quadrant: n.quadrant,
        importance: n.importance,
        type: n.type,
        color: getNodeColor(n.quadrant),
        val: 2 + n.importance * 8,
      })),
      links: graph.edges.map((e) => ({
        source: e.source,
        target: e.target,
        label: e.label,
        weight: e.weight,
      })),
    }
  }, [graph])

  // Custom node rendering
  const paintNode = useCallback((node: Record<string, unknown>, ctx: CanvasRenderingContext2D) => {
    const x = node.x as number
    const y = node.y as number
    const color = node.color as string
    const importance = node.importance as number
    const radius = 4 + importance * 10
    const isStart = node.id === currentStartId
    const isHovered = hoveredNode?.id === node.id

    // Glow
    if (isHovered || isStart) {
      ctx.beginPath()
      ctx.arc(x, y, radius + 4, 0, 2 * Math.PI)
      ctx.fillStyle = `${color}40`
      ctx.fill()
    }

    // Node
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, 2 * Math.PI)
    ctx.fillStyle = isHovered ? color : `${color}cc`
    ctx.fill()

    // Start node border
    if (isStart) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Label
    const label = (node.label as string) || ''
    const truncated = label.length > 25 ? label.slice(0, 25) + '…' : label
    ctx.font = `${isHovered ? 'bold ' : ''}10px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = isHovered ? '#fafafa' : '#e4e4e7'
    ctx.fillText(truncated, x, y + radius + 12)
  }, [currentStartId, hoveredNode])

  const handleNodeClick = useCallback((node: Record<string, unknown>) => {
    const id = node.id as string
    fetchGraph(id)
  }, [fetchGraph])

  const handleNodeHover = useCallback((node: Record<string, unknown> | null) => {
    if (!node) {
      setHoveredNode(null)
      return
    }
    setHoveredNode({
      id: node.id as string,
      label: node.label as string,
      type: node.type as GraphNode['type'],
      quadrant: node.quadrant as GraphNode['quadrant'],
      importance: node.importance as number,
    })
  }, [])

  if (!startId && !currentStartId) {
    return (
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🕸️</span>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Knowledge Graph
          </h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)] text-center py-8">
          Select a memory item and click &quot;View in Graph&quot; to visualize its connections
        </p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl transition-colors duration-150">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🕸️</span>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Knowledge Graph
          </h2>
          {graph && (
            <span className="text-xs text-[var(--text-secondary)] ml-auto">
              {graph.nodes.length} nodes · {graph.edges.length} edges
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <select
            value={filterQuadrant}
            onChange={(e) => setFilterQuadrant(e.target.value as QuadrantId | '')}
            className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
          >
            <option value="">All Quadrants</option>
            <option value="lifeforce">🟢 Lifeforce</option>
            <option value="industry">🔵 Industry</option>
            <option value="fellowship">🟡 Fellowship</option>
            <option value="essence">🟣 Essence</option>
          </select>

          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--text-secondary)]">
              Min importance: {Math.round(minImportance * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(minImportance * 100)}
              onChange={(e) => setMinImportance(Number(e.target.value) / 100)}
              className="w-24 h-1 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
            />
          </div>

          {(filterQuadrant || minImportance > 0) && currentStartId && (
            <button
              onClick={() => {
                setFilterQuadrant('')
                setMinImportance(0)
                if (currentStartId) fetchGraph(currentStartId)
              }}
              className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)]"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Graph */}
      <div ref={containerRef} className="relative" style={{ height: 400 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-secondary)] bg-opacity-80 z-10">
            <span className="text-sm text-[var(--text-secondary)] animate-pulse">
              Loading graph...
            </span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-secondary)] bg-opacity-80 z-10">
            <span className="text-sm text-[var(--color-error)]">{error}</span>
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
              const importance = node.importance as number
              const radius = 4 + importance * 10
              ctx.beginPath()
              ctx.arc(x, y, radius + 2, 0, 2 * Math.PI)
              ctx.fillStyle = color
              ctx.fill()
            }}
            linkColor={() => 'rgba(255, 255, 255, 0.2)'}
            linkWidth={(link: Record<string, unknown>) => 0.5 + (link.weight as number) * 1.5}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            enableNodeDrag={true}
            cooldownTicks={100}
          />
        )}

        {/* Hover tooltip */}
        {hoveredNode && (
          <div className="absolute bottom-4 left-4 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-xs max-w-xs pointer-events-none shadow-lg z-20">
            <p className="text-[var(--text-primary)] font-medium line-clamp-2">
              {hoveredNode.label}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="px-1.5 py-0 rounded text-[10px] font-medium"
                style={{
                  backgroundColor: hoveredNode.quadrant
                    ? `${QUADRANT_COLORS[hoveredNode.quadrant]}20`
                    : 'var(--bg-secondary)',
                  color: hoveredNode.quadrant
                    ? QUADRANT_COLORS[hoveredNode.quadrant]
                    : 'var(--text-secondary)',
                }}
              >
                {hoveredNode.quadrant ?? 'untagged'}
              </span>
              <span className="text-[var(--text-tertiary)]">
                {hoveredNode.type}
              </span>
              <span className="text-[var(--text-tertiary)]">
                imp: {Math.round(hoveredNode.importance * 100)}%
              </span>
            </div>
            <p className="text-[var(--text-tertiary)] mt-1 text-[10px]">
              Click to re-center
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-2 right-2 bg-[var(--bg-tertiary)] bg-opacity-90 border border-[var(--border-secondary)] rounded-lg px-2 py-1.5 text-[10px] z-20">
          {Object.entries(QUADRANT_COLORS).map(([q, c]) => (
            <div key={q} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: c }}
              />
              <span className="text-[var(--text-secondary)] capitalize">{q}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
