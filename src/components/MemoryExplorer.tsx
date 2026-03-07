'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  MemoryItem,
  MemoryType,
  MemoryLayer,
  QuadrantId,
  SearchResult,
} from '@/lib/memory/models'

interface MemoryExplorerProps {
  onViewGraph?: (memoryId: string) => void
  refreshKey?: number
}

const PAGE_SIZE = 20

const TYPE_COLORS: Record<string, string> = {
  episodic: '#3b82f6',
  semantic: '#22c55e',
  procedural: '#f59e0b',
  entity_profile: '#a855f7',
}

const TYPE_LABELS: Record<string, string> = {
  episodic: 'Episodic',
  semantic: 'Semantic',
  procedural: 'Procedural',
  entity_profile: 'Entity',
}

const LAYER_LABELS: Record<string, string> = {
  life_directory: 'Life Directory',
  daily_notes: 'Daily Notes',
  tacit_knowledge: 'Tacit Knowledge',
}

const QUADRANT_COLORS: Record<string, string> = {
  lifeforce: 'var(--quadrant-lifeforce)',
  industry: 'var(--quadrant-industry)',
  fellowship: 'var(--quadrant-fellowship)',
  essence: 'var(--quadrant-essence)',
}

const QUADRANT_LABELS: Record<string, string> = {
  lifeforce: 'Lifeforce',
  industry: 'Industry',
  fellowship: 'Fellowship',
  essence: 'Essence',
}

const inputClass =
  'w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150'

export function MemoryExplorer({ onViewGraph, refreshKey }: MemoryExplorerProps) {
  const [items, setItems] = useState<MemoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState<MemoryType | ''>('')
  const [filterLayer, setFilterLayer] = useState<MemoryLayer | ''>('')
  const [filterQuadrant, setFilterQuadrant] = useState<QuadrantId | ''>('')
  const [offset, setOffset] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      // Use search endpoint when there's a text query, GET items otherwise
      if (query.trim()) {
        const body: Record<string, unknown> = {
          text: query.trim(),
          limit: PAGE_SIZE,
          offset,
        }
        if (filterType) body.type = filterType
        if (filterLayer) body.layer = filterLayer
        if (filterQuadrant) body.quadrant = filterQuadrant

        const res = await fetch('/api/memory/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data: SearchResult = await res.json()
          setItems(data.items)
          setTotal(data.total)
        }
      } else {
        const params = new URLSearchParams()
        params.set('limit', String(PAGE_SIZE))
        params.set('offset', String(offset))
        if (filterType) params.set('type', filterType)
        if (filterLayer) params.set('layer', filterLayer)
        if (filterQuadrant) params.set('quadrant', filterQuadrant)

        const res = await fetch(`/api/memory/items?${params}`)
        if (res.ok) {
          const data: SearchResult = await res.json()
          setItems(data.items)
          setTotal(data.total)
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [query, filterType, filterLayer, filterQuadrant, offset])

  useEffect(() => {
    fetchItems()
  }, [fetchItems, refreshKey])

  const handleSearchChange = (value: string) => {
    setQuery(value)
    setOffset(0)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      // fetchItems will be triggered by the useEffect
    }, 300)
  }

  const handleFilterChange = () => {
    setOffset(0)
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/memory/items/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setExpandedId(null)
        setDeleteConfirm(null)
        fetchItems()
      }
    } catch {
      // silently fail
    }
  }

  const handleUpdate = async (id: string, updates: Partial<MemoryItem>) => {
    try {
      const res = await fetch(`/api/memory/items/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const updated: MemoryItem = await res.json()
        setItems((prev) => prev.map((i) => (i.memory_id === id ? updated : i)))
      }
    } catch {
      // silently fail
    }
  }

  const handleToggleArchive = async (item: MemoryItem) => {
    await handleUpdate(item.memory_id, { archived: !item.archived })
    fetchItems()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl transition-colors duration-150">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🔍</span>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Memory Explorer
          </h2>
          <span className="ml-auto text-xs text-[var(--text-secondary)]">
            {total} results
          </span>
        </div>

        {/* Search bar */}
        <input
          type="text"
          placeholder="Search memories..."
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          className={inputClass}
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mt-3">
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value as MemoryType | '')
              handleFilterChange()
            }}
            className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
          >
            <option value="">All Types</option>
            <option value="episodic">Episodic</option>
            <option value="semantic">Semantic</option>
            <option value="procedural">Procedural</option>
            <option value="entity_profile">Entity Profile</option>
          </select>

          <select
            value={filterLayer}
            onChange={(e) => {
              setFilterLayer(e.target.value as MemoryLayer | '')
              handleFilterChange()
            }}
            className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
          >
            <option value="">All Layers</option>
            <option value="life_directory">Life Directory</option>
            <option value="daily_notes">Daily Notes</option>
            <option value="tacit_knowledge">Tacit Knowledge</option>
          </select>

          <select
            value={filterQuadrant}
            onChange={(e) => {
              setFilterQuadrant(e.target.value as QuadrantId | '')
              handleFilterChange()
            }}
            className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
          >
            <option value="">All Quadrants</option>
            <option value="lifeforce">🟢 Lifeforce</option>
            <option value="industry">🔵 Industry</option>
            <option value="fellowship">🟡 Fellowship</option>
            <option value="essence">🟣 Essence</option>
          </select>

          {(filterType || filterLayer || filterQuadrant) && (
            <button
              onClick={() => {
                setFilterType('')
                setFilterLayer('')
                setFilterQuadrant('')
                handleFilterChange()
              }}
              className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="divide-y divide-[var(--border-secondary)]">
        {loading && items.length === 0 && (
          <div className="p-8 text-center">
            <div className="animate-pulse text-[var(--text-secondary)] text-sm">
              Loading...
            </div>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-[var(--text-secondary)] text-sm">
              {query ? 'No memories match your search' : 'No memories yet'}
            </p>
          </div>
        )}

        {items.map((item) => {
          const isExpanded = expandedId === item.memory_id
          const quadrantTag = item.tags.find((t) => t.startsWith('quadrant:'))
          const quadrant = quadrantTag?.replace('quadrant:', '') ?? null
          const otherTags = item.tags.filter((t) => !t.startsWith('quadrant:'))

          return (
            <div key={item.memory_id}>
              {/* Row */}
              <button
                onClick={() =>
                  setExpandedId(isExpanded ? null : item.memory_id)
                }
                className="w-full text-left p-4 hover:bg-[var(--bg-hover)] transition-colors duration-150"
              >
                <div className="flex items-start gap-3">
                  {/* Badges */}
                  <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        backgroundColor: `${TYPE_COLORS[item.type]}20`,
                        color: TYPE_COLORS[item.type],
                      }}
                    >
                      {TYPE_LABELS[item.type]}
                    </span>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                      {LAYER_LABELS[item.layer]}
                    </span>
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] line-clamp-2">
                      {item.text}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {/* Quadrant dot */}
                      {quadrant && (
                        <span className="flex items-center gap-1 text-[10px]">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor:
                                QUADRANT_COLORS[quadrant] ?? 'var(--text-tertiary)',
                            }}
                          />
                          <span
                            style={{
                              color:
                                QUADRANT_COLORS[quadrant] ?? 'var(--text-tertiary)',
                            }}
                          >
                            {QUADRANT_LABELS[quadrant] ?? quadrant}
                          </span>
                        </span>
                      )}
                      {/* Importance/confidence bars */}
                      <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                        imp:
                        <span className="inline-block w-10 h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <span
                            className="block h-full bg-[var(--color-info)] rounded-full"
                            style={{ width: `${item.importance * 100}%` }}
                          />
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                        conf:
                        <span className="inline-block w-10 h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <span
                            className="block h-full bg-[var(--color-success)] rounded-full"
                            style={{ width: `${item.confidence * 100}%` }}
                          />
                        </span>
                      </span>
                      {/* Tags */}
                      {otherTags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0 rounded text-[10px] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                        >
                          {tag}
                        </span>
                      ))}
                      {otherTags.length > 3 && (
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                          +{otherTags.length - 3}
                        </span>
                      )}
                      {/* Timestamp */}
                      <span className="ml-auto text-[10px] text-[var(--text-tertiary)] shrink-0">
                        {formatDate(item.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Expand icon */}
                  <span className="text-[var(--text-tertiary)] shrink-0 text-xs mt-1">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <ItemDetail
                  item={item}
                  onUpdate={handleUpdate}
                  onDelete={() => {
                    if (deleteConfirm === item.memory_id) {
                      handleDelete(item.memory_id)
                    } else {
                      setDeleteConfirm(item.memory_id)
                    }
                  }}
                  deleteConfirm={deleteConfirm === item.memory_id}
                  onCancelDelete={() => setDeleteConfirm(null)}
                  onToggleArchive={() => handleToggleArchive(item)}
                  onViewGraph={
                    onViewGraph
                      ? () => onViewGraph(item.memory_id)
                      : undefined
                  }
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4 border-t border-[var(--border-primary)]">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Previous
          </button>
          <span className="text-xs text-[var(--text-secondary)]">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() =>
              setOffset(Math.min((totalPages - 1) * PAGE_SIZE, offset + PAGE_SIZE))
            }
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Detail panel ── */

interface ItemDetailProps {
  item: MemoryItem
  onUpdate: (id: string, updates: Partial<MemoryItem>) => Promise<void>
  onDelete: () => void
  deleteConfirm: boolean
  onCancelDelete: () => void
  onToggleArchive: () => void
  onViewGraph?: () => void
}

function ItemDetail({
  item,
  onUpdate,
  onDelete,
  deleteConfirm,
  onCancelDelete,
  onToggleArchive,
  onViewGraph,
}: ItemDetailProps) {
  const [editTags, setEditTags] = useState(false)
  const [tagsValue, setTagsValue] = useState(item.tags.join(', '))
  const [importance, setImportance] = useState(item.importance)
  const [saving, setSaving] = useState(false)

  const handleSaveTags = async () => {
    setSaving(true)
    const newTags = tagsValue
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    await onUpdate(item.memory_id, { tags: newTags })
    setEditTags(false)
    setSaving(false)
  }

  const handleSaveImportance = async (val: number) => {
    setImportance(val)
    await onUpdate(item.memory_id, { importance: val })
  }

  return (
    <div className="px-4 pb-4 bg-[var(--bg-tertiary)] border-t border-[var(--border-secondary)]">
      <div className="pt-3 space-y-3">
        {/* Full text */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
            Full Text
          </p>
          <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap bg-[var(--bg-secondary)] rounded-lg p-3 max-h-48 overflow-y-auto">
            {item.text}
          </p>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetaField label="ID" value={item.memory_id.slice(0, 12) + '…'} />
          <MetaField label="Source" value={item.provenance.source_type} />
          <MetaField
            label="Embedding"
            value={item.embedding_ref ? '✓ indexed' : '✗ none'}
          />
          <MetaField
            label="Archived"
            value={item.archived ? 'Yes' : 'No'}
          />
          <MetaField
            label="Confidence"
            value={`${Math.round(item.confidence * 100)}%`}
          />
          <MetaField label="Created" value={formatDate(item.created_at)} />
          <MetaField label="Accessed" value={formatDate(item.last_accessed)} />
          {item.consolidated_into && (
            <MetaField
              label="Consolidated into"
              value={item.consolidated_into.slice(0, 12) + '…'}
            />
          )}
        </div>

        {/* Importance slider */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
            Importance: {Math.round(importance * 100)}%
          </p>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(importance * 100)}
            onChange={(e) => handleSaveImportance(Number(e.target.value) / 100)}
            className="w-full h-1.5 bg-[var(--bg-secondary)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
          />
        </div>

        {/* Tags */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
              Tags
            </p>
            <button
              onClick={() => setEditTags(!editTags)}
              className="text-[10px] text-[var(--accent)] hover:text-[var(--accent-hover)]"
            >
              {editTags ? 'Cancel' : 'Edit'}
            </button>
          </div>
          {editTags ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={tagsValue}
                onChange={(e) => setTagsValue(e.target.value)}
                className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)]"
                placeholder="tag1, tag2, quadrant:lifeforce"
              />
              <button
                onClick={handleSaveTags}
                disabled={saving}
                className="px-2 py-1 text-xs rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {item.tags.length === 0 && (
                <span className="text-xs text-[var(--text-tertiary)] italic">
                  No tags
                </span>
              )}
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded text-[10px] bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {onViewGraph && (
            <button
              onClick={onViewGraph}
              className="px-3 py-1.5 text-xs rounded-lg bg-[var(--accent-2-muted)] text-[var(--accent-2)] hover:opacity-80 transition-colors"
            >
              🔗 View in Graph
            </button>
          )}
          <button
            onClick={onToggleArchive}
            className="px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            {item.archived ? '📤 Unarchive' : '📥 Archive'}
          </button>
          <div className="ml-auto">
            {deleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-error)]">
                  Confirm delete?
                </span>
                <button
                  onClick={onDelete}
                  className="px-3 py-1.5 text-xs rounded-lg bg-[var(--color-error)] text-white hover:opacity-80 transition-colors"
                >
                  Yes, delete
                </button>
                <button
                  onClick={onCancelDelete}
                  className="px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={onDelete}
                className="px-3 py-1.5 text-xs rounded-lg text-[var(--color-error)] hover:bg-[var(--color-error)] hover:bg-opacity-10 transition-colors"
              >
                🗑 Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="text-xs text-[var(--text-primary)] font-mono">{value}</p>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
