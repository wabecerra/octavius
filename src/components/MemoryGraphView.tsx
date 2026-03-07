'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { GraphExport, GraphNode, QuadrantId } from '@/lib/memory/models'

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

// Force simulation constants
const REPULSION = 4000
const SPRING_LENGTH = 120
const SPRING_STRENGTH = 0.005
const DAMPING = 0.85
const CENTER_PULL = 0.01

interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
}

interface SimEdge {
  source: string
  target: string
  label: string
  weight: number
}

export function MemoryGraphView({ startId }: MemoryGraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const nodesRef = useRef<SimNode[]>([])
  const edgesRef = useRef<SimEdge[]>([])
  const dragRef = useRef<{ node: SimNode | null; offsetX: number; offsetY: number }>({
    node: null,
    offsetX: 0,
    offsetY: 0,
  })
  const hoverRef = useRef<SimNode | null>(null)

  const [graph, setGraph] = useState<GraphExport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [filterQuadrant, setFilterQuadrant] = useState<QuadrantId | ''>('')
  const [minImportance, setMinImportance] = useState(0)
  const [currentStartId, setCurrentStartId] = useState<string | null>(null)

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

  // Initialize simulation nodes when graph data changes
  useEffect(() => {
    if (!graph || !canvasRef.current) return

    const canvas = canvasRef.current
    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h / 2

    // Create sim nodes with random positions
    const simNodes: SimNode[] = graph.nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / graph.nodes.length
      const r = 80 + Math.random() * 60
      return {
        ...n,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        radius: 6 + n.importance * 14,
        color: n.quadrant ? QUADRANT_COLORS[n.quadrant] ?? NODE_DEFAULT_COLOR : NODE_DEFAULT_COLOR,
      }
    })

    nodesRef.current = simNodes
    edgesRef.current = graph.edges

    // Run simulation
    let ticks = 0
    const maxTicks = 300

    const simulate = () => {
      if (ticks >= maxTicks) {
        draw(canvas, nodesRef.current, edgesRef.current, hoverRef.current, currentStartId)
        return
      }

      const nodes = nodesRef.current

      // Apply forces
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]

        // Center pull
        n.vx += (cx - n.x) * CENTER_PULL
        n.vy += (cy - n.y) * CENTER_PULL

        // Repulsion from other nodes
        for (let j = i + 1; j < nodes.length; j++) {
          const m = nodes[j]
          const dx = n.x - m.x
          const dy = n.y - m.y
          let dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 1) dist = 1
          const force = REPULSION / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          n.vx += fx
          n.vy += fy
          m.vx -= fx
          m.vy -= fy
        }
      }

      // Spring forces from edges
      for (const edge of edgesRef.current) {
        const s = nodes.find((n) => n.id === edge.source)
        const t = nodes.find((n) => n.id === edge.target)
        if (!s || !t) continue
        const dx = t.x - s.x
        const dy = t.y - s.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const displacement = dist - SPRING_LENGTH
        const force = SPRING_STRENGTH * displacement
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        s.vx += fx
        s.vy += fy
        t.vx -= fx
        t.vy -= fy
      }

      // Apply velocity
      for (const n of nodes) {
        if (dragRef.current.node === n) continue
        n.vx *= DAMPING
        n.vy *= DAMPING
        n.x += n.vx
        n.y += n.vy
        // Bounds
        n.x = Math.max(n.radius, Math.min(w - n.radius, n.x))
        n.y = Math.max(n.radius, Math.min(h - n.radius, n.y))
      }

      draw(canvas, nodesRef.current, edgesRef.current, hoverRef.current, currentStartId)
      ticks++
      animRef.current = requestAnimationFrame(simulate)
    }

    cancelAnimationFrame(animRef.current)
    simulate()

    return () => cancelAnimationFrame(animRef.current)
  }, [graph, currentStartId])

  // Resize canvas
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = 400 * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = '400px'
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // Mouse interaction
  const findNodeAt = (x: number, y: number): SimNode | null => {
    for (const n of nodesRef.current) {
      const dx = x - n.x
      const dy = y - n.y
      if (dx * dx + dy * dy < n.radius * n.radius) return n
    }
    return null
  }

  const getCanvasPos = (e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e)
    const node = findNodeAt(pos.x, pos.y)
    if (node) {
      dragRef.current = { node, offsetX: pos.x - node.x, offsetY: pos.y - node.y }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e)
    if (dragRef.current.node) {
      dragRef.current.node.x = pos.x - dragRef.current.offsetX
      dragRef.current.node.y = pos.y - dragRef.current.offsetY
      dragRef.current.node.vx = 0
      dragRef.current.node.vy = 0
      const canvas = canvasRef.current
      if (canvas) draw(canvas, nodesRef.current, edgesRef.current, hoverRef.current, currentStartId)
    } else {
      const node = findNodeAt(pos.x, pos.y)
      hoverRef.current = node
      setHoveredNode(node)
      const canvas = canvasRef.current
      if (canvas) {
        canvas.style.cursor = node ? 'pointer' : 'default'
        draw(canvas, nodesRef.current, edgesRef.current, node, currentStartId)
      }
    }
  }

  const handleMouseUp = () => {
    dragRef.current = { node: null, offsetX: 0, offsetY: 0 }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e)
    const node = findNodeAt(pos.x, pos.y)
    if (node) fetchGraph(node.id)
  }

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

      {/* Canvas */}
      <div ref={containerRef} className="relative">
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
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          className="w-full"
          style={{ height: 400 }}
        />

        {/* Hover tooltip */}
        {hoveredNode && (
          <div className="absolute bottom-4 left-4 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-xs max-w-xs pointer-events-none shadow-lg">
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
              Double-click to re-center
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-2 right-2 bg-[var(--bg-tertiary)] bg-opacity-90 border border-[var(--border-secondary)] rounded-lg px-2 py-1.5 text-[10px]">
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

/* ── Canvas drawing ── */

function draw(
  canvas: HTMLCanvasElement,
  nodes: SimNode[],
  edges: SimEdge[],
  hoveredNode: SimNode | null,
  startId: string | null,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const w = canvas.width / dpr
  const h = canvas.height / dpr

  ctx.clearRect(0, 0, w, h)

  // Draw edges
  for (const edge of edges) {
    const s = nodes.find((n) => n.id === edge.source)
    const t = nodes.find((n) => n.id === edge.target)
    if (!s || !t) continue

    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(t.x, t.y)
    ctx.strokeStyle = `rgba(113, 113, 122, ${0.15 + edge.weight * 0.35})`
    ctx.lineWidth = 0.5 + edge.weight * 1.5
    ctx.stroke()

    // Edge label
    if (edge.label) {
      const mx = (s.x + t.x) / 2
      const my = (s.y + t.y) / 2
      ctx.font = '9px sans-serif'
      ctx.fillStyle = 'rgba(113, 113, 122, 0.6)'
      ctx.textAlign = 'center'
      ctx.fillText(edge.label, mx, my - 3)
    }
  }

  // Draw nodes
  for (const node of nodes) {
    const isHovered = hoveredNode?.id === node.id
    const isStart = node.id === startId

    // Glow for hovered/start
    if (isHovered || isStart) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2)
      ctx.fillStyle = `${node.color}30`
      ctx.fill()
    }

    // Node circle
    ctx.beginPath()
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
    ctx.fillStyle = isHovered ? node.color : `${node.color}cc`
    ctx.fill()

    // Border
    if (isStart) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Label
    const label =
      node.label.length > 25 ? node.label.slice(0, 25) + '…' : node.label
    ctx.font = `${isHovered ? 'bold ' : ''}10px sans-serif`
    ctx.fillStyle = isHovered ? '#fafafa' : '#e4e4e7'
    ctx.textAlign = 'center'
    ctx.fillText(label, node.x, node.y + node.radius + 12)
  }
}
