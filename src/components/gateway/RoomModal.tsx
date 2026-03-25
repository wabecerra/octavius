'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { AssetManifest, ColumnDef, FilterFieldDef, RoomAssetConfig, SortFieldDef } from '@/lib/gateway-view/types'

// ── Types ──────────────────────────────────────────────────────────────────

export interface RoomModalProps {
  roomId: string
  assetManifest: AssetManifest
  onClose: () => void
}

type SortDir = 'asc' | 'desc'

interface SortState {
  field: string
  dir: SortDir
}

interface DateRange {
  from: string
  to: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Safely read a nested field like "summaryStats.maxDepth" from a record */
function getField(row: Record<string, unknown>, field: string): unknown {
  const parts = field.split('.')
  let cur: unknown = row
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function displayValue(val: unknown, col: ColumnDef): string {
  if (val == null) return '—'
  const str = String(val)
  if (col.truncate && str.length > col.truncate) return str.slice(0, col.truncate) + '…'
  return str
}

function normalizeRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  if (data && typeof data === 'object') {
    // Single-object responses (e.g. /api/obsidian/status, /api/lcm/status)
    return [data as Record<string, unknown>]
  }
  return []
}

function matchesText(row: Record<string, unknown>, cols: ColumnDef[], query: string): boolean {
  const q = query.toLowerCase()
  return cols.some(col => {
    const v = getField(row, col.field)
    return v != null && String(v).toLowerCase().includes(q)
  })
}

function compareRows(a: Record<string, unknown>, b: Record<string, unknown>, sort: SortState): number {
  const av = getField(a, sort.field)
  const bv = getField(b, sort.field)
  const as = av == null ? '' : String(av)
  const bs = bv == null ? '' : String(bv)
  const cmp = as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' })
  return sort.dir === 'asc' ? cmp : -cmp
}

const ROOM_LABELS: Record<string, string> = {
  'room-memory':    '🧠 Memory',
  'room-agents':    '🤖 Agents',
  'room-tasks':     '📋 Tasks',
  'room-health':    '💚 Health',
  'room-obsidian':  '🔮 Obsidian',
  'room-lcm':       '💬 LCM',
  'room-costs':     '💰 Costs',
  'room-hub':       '⚡ Gateway Hub',
  'room-lifeforce': '🌱 Lifeforce',
  'room-industry':  '🏭 Industry',
  'room-fellowship':'🤝 Fellowship',
  'room-essence':   '🧘 Essence',
}

// ── Filter Controls ────────────────────────────────────────────────────────

interface FilterControlsProps {
  filters: FilterFieldDef[]
  enumValues: Record<string, string>
  dateRanges: Record<string, DateRange>
  onEnumChange: (field: string, val: string) => void
  onDateRangeChange: (field: string, key: 'from' | 'to', val: string) => void
}

function FilterControls({ filters, enumValues, dateRanges, onEnumChange, onDateRangeChange }: FilterControlsProps) {
  const enumFilters = filters.filter(f => f.type === 'enum')
  const dateFilters = filters.filter(f => f.type === 'date-range')
  if (enumFilters.length === 0 && dateFilters.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {enumFilters.map(f => (
        <div key={f.field} className="flex items-center gap-1">
          <label className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-tertiary)' }}>
            {f.label}
          </label>
          <select
            value={enumValues[f.field] ?? ''}
            onChange={e => onEnumChange(f.field, e.target.value)}
            className="text-[10px] font-mono rounded px-1.5 py-0.5 border"
            style={{
              background: 'var(--bg-tertiary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-secondary)',
              outline: 'none',
            }}
          >
            <option value="">All</option>
            {(f.options ?? []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      ))}
      {dateFilters.map(f => {
        const range = dateRanges[f.field] ?? { from: '', to: '' }
        return (
          <div key={f.field} className="flex items-center gap-1">
            <label className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-tertiary)' }}>
              {f.label}
            </label>
            <input
              type="date"
              value={range.from}
              onChange={e => onDateRangeChange(f.field, 'from', e.target.value)}
              className="text-[10px] font-mono rounded px-1.5 py-0.5 border"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-secondary)',
                outline: 'none',
              }}
              aria-label={`${f.label} from`}
            />
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>–</span>
            <input
              type="date"
              value={range.to}
              onChange={e => onDateRangeChange(f.field, 'to', e.target.value)}
              className="text-[10px] font-mono rounded px-1.5 py-0.5 border"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-secondary)',
                outline: 'none',
              }}
              aria-label={`${f.label} to`}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── Preview Panel ──────────────────────────────────────────────────────────

interface PreviewPanelProps {
  row: Record<string, unknown>
  columns: ColumnDef[]
  onClose: () => void
}

function PreviewPanel({ row, columns, onClose }: PreviewPanelProps) {
  return (
    <div
      className="w-72 shrink-0 border-l flex flex-col overflow-hidden"
      style={{ borderColor: 'var(--border-primary)' }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>
          Preview
        </span>
        <button
          onClick={onClose}
          className="text-xs leading-none"
          style={{ color: 'var(--text-tertiary)' }}
          aria-label="Close preview"
        >
          ✕
        </button>
      </div>
      <div className="overflow-y-auto flex-1 p-3 space-y-2">
        {columns.map(col => {
          const val = getField(row, col.field)
          const raw = val == null ? '—' : String(val)
          return (
            <div key={col.field}>
              <div className="text-[9px] font-mono uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {col.label}
              </div>
              <div
                className="text-[11px] break-words"
                style={{ color: 'var(--text-primary)' }}
              >
                {raw}
              </div>
            </div>
          )
        })}
        {/* Show any extra fields not in columns */}
        {Object.entries(row)
          .filter(([k]) => !columns.some(c => c.field === k || c.field.startsWith(k + '.')))
          .map(([k, v]) => (
            <div key={k}>
              <div className="text-[9px] font-mono uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {k}
              </div>
              <div className="text-[11px] break-words" style={{ color: 'var(--text-secondary)' }}>
                {v == null ? '—' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

// ── Data Table ─────────────────────────────────────────────────────────────

interface DataTableProps {
  rows: Record<string, unknown>[]
  columns: ColumnDef[]
  sorts: SortFieldDef[]
  sort: SortState | null
  selectedIdx: number | null
  onSort: (field: string) => void
  onSelect: (idx: number) => void
}

function DataTable({ rows, columns, sorts, sort, selectedIdx, onSort, onSelect }: DataTableProps) {
  const sortableFields = new Set(sorts.map(s => s.field))

  return (
    <div className="overflow-auto flex-1 min-h-0">
      <table className="w-full text-[11px] border-collapse">
        <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-secondary)' }}>
          <tr>
            {columns.map(col => {
              const isSortable = sortableFields.has(col.field)
              const isActive = sort?.field === col.field
              return (
                <th
                  key={col.field}
                  className="px-2 py-1.5 text-left font-mono font-medium border-b select-none"
                  style={{
                    width: `${col.width}%`,
                    borderColor: 'var(--border-primary)',
                    color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                    cursor: isSortable ? 'pointer' : 'default',
                    background: 'var(--bg-secondary)',
                  }}
                  onClick={() => isSortable && onSort(col.field)}
                  aria-sort={isActive ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {isSortable && (
                      <span className="text-[9px]" aria-hidden>
                        {isActive ? (sort!.dir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    )}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center font-mono"
                style={{ color: 'var(--text-tertiary)' }}
              >
                No results
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => {
              const isSelected = selectedIdx === idx
              return (
                <tr
                  key={idx}
                  onClick={() => onSelect(idx)}
                  className="cursor-pointer transition-colors"
                  style={{
                    background: isSelected ? 'rgba(255,92,92,0.08)' : 'transparent',
                    borderBottom: '1px solid var(--border-secondary, rgba(255,255,255,0.04))',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                  aria-selected={isSelected}
                >
                  {columns.map(col => (
                    <td
                      key={col.field}
                      className="px-2 py-1.5 font-mono"
                      style={{ color: 'var(--text-secondary)', maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={String(getField(row, col.field) ?? '')}
                    >
                      {displayValue(getField(row, col.field), col)}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Main RoomModal ─────────────────────────────────────────────────────────

export function RoomModal({ roomId, assetManifest, onClose }: RoomModalProps) {
  const roomConfig: RoomAssetConfig | undefined = assetManifest.rooms.find(r => r.roomId === roomId)

  // ── State ──
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; status?: number } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [enumFilters, setEnumFilters] = useState<Record<string, string>>({})
  const [dateRanges, setDateRanges] = useState<Record<string, DateRange>>({})
  const [sort, setSort] = useState<SortState | null>(() => {
    if (!roomConfig) return null
    const def = roomConfig.sorts[0]
    if (!def) return null
    return { field: def.field, dir: def.defaultDirection ?? 'asc' }
  })
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    if (!roomConfig) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(roomConfig.apiEndpoint)
      if (!res.ok) {
        setError({ message: res.statusText || 'Request failed', status: res.status })
        setLoading(false)
        return
      }
      const json = await res.json()
      setRows(normalizeRows(json))
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Network error' })
    } finally {
      setLoading(false)
    }
  }, [roomConfig])

  useEffect(() => { fetchData() }, [fetchData])

  // Focus search on open
  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  // ── Filtering + sorting ──
  const filteredRows = useMemo(() => {
    if (!roomConfig) return []
    let result = rows

    // Text search across all text columns
    if (searchQuery.trim()) {
      result = result.filter(row => matchesText(row, roomConfig.columns, searchQuery))
    }

    // Enum filters
    for (const [field, val] of Object.entries(enumFilters)) {
      if (!val) continue
      result = result.filter(row => {
        const v = getField(row, field)
        return v != null && String(v) === val
      })
    }

    // Date range filters
    for (const [field, range] of Object.entries(dateRanges)) {
      if (!range.from && !range.to) continue
      result = result.filter(row => {
        const v = getField(row, field)
        if (v == null) return false
        const d = new Date(String(v))
        if (isNaN(d.getTime())) return false
        if (range.from && d < new Date(range.from)) return false
        if (range.to && d > new Date(range.to + 'T23:59:59')) return false
        return true
      })
    }

    // Sort
    if (sort) {
      result = [...result].sort((a, b) => compareRows(a, b, sort))
    }

    return result
  }, [rows, searchQuery, enumFilters, dateRanges, sort, roomConfig])

  // ── Handlers ──
  const handleSort = useCallback((field: string) => {
    setSort(prev => {
      if (prev?.field === field) return { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      const def = roomConfig?.sorts.find(s => s.field === field)
      return { field, dir: def?.defaultDirection ?? 'asc' }
    })
    setSelectedIdx(null)
  }, [roomConfig])

  const handleEnumChange = useCallback((field: string, val: string) => {
    setEnumFilters(prev => ({ ...prev, [field]: val }))
    setSelectedIdx(null)
  }, [])

  const handleDateRangeChange = useCallback((field: string, key: 'from' | 'to', val: string) => {
    setDateRanges(prev => ({ ...prev, [field]: { ...(prev[field] ?? { from: '', to: '' }), [key]: val } }))
    setSelectedIdx(null)
  }, [])

  const handleSelect = useCallback((idx: number) => {
    setSelectedIdx(prev => prev === idx ? null : idx)
  }, [])

  const selectedRow = selectedIdx != null ? filteredRows[selectedIdx] : null
  const title = ROOM_LABELS[roomId] ?? roomId

  // ── No config fallback ──
  if (!roomConfig) {
    return (
      <Dialog.Root open onOpenChange={open => !open && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay
            className="fixed inset-0"
            style={{ background: 'rgba(0,0,0,0.6)', zIndex: 50 }}
          />
          <Dialog.Content
            className="fixed inset-0 flex items-center justify-center"
            style={{ zIndex: 51 }}
          >
            <div
              className="rounded-xl border p-6 text-center"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
            >
              <p className="text-sm font-mono" style={{ color: 'var(--color-error)' }}>
                No asset config found for room: {roomId}
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Close
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }

  return (
    <Dialog.Root open onOpenChange={open => !open && onClose()}>
      <Dialog.Portal>
        {/* Overlay — click outside closes */}
        <Dialog.Overlay
          className="fixed inset-0"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50 }}
        />

        {/* Modal content */}
        <Dialog.Content
          className="fixed inset-4 sm:inset-8 lg:inset-12 rounded-xl border flex flex-col overflow-hidden focus:outline-none"
          style={{
            background: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
            boxShadow: 'var(--shadow-xl, 0 25px 50px rgba(0,0,0,0.5))',
            zIndex: 51,
          }}
          onEscapeKeyDown={onClose}
          aria-label={`${title} room browser`}
        >
          {/* ── Header ── */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b shrink-0"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <Dialog.Title className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {title}
            </Dialog.Title>
            <Dialog.Description className="sr-only">View and manage room data</Dialog.Description>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                {loading ? 'Loading…' : `${filteredRows.length} / ${rows.length} rows`}
              </span>
              <Dialog.Close asChild>
                <button
                  onClick={onClose}
                  className="text-sm leading-none px-1.5 py-0.5 rounded transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* ── Toolbar ── */}
          <div
            className="flex flex-wrap items-center gap-2 px-4 py-2 border-b shrink-0"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }}
          >
            {/* Text search */}
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSelectedIdx(null) }}
              placeholder="Search…"
              className="rounded-lg border px-2.5 py-1 text-xs font-mono w-48"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
              aria-label="Search all columns"
            />

            {/* Filter controls */}
            <FilterControls
              filters={roomConfig.filters}
              enumValues={enumFilters}
              dateRanges={dateRanges}
              onEnumChange={handleEnumChange}
              onDateRangeChange={handleDateRangeChange}
            />
          </div>

          {/* ── Body ── */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Table area */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              {loading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl mb-2 animate-pulse">⏳</div>
                    <div className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
                      Fetching {roomConfig.apiEndpoint}…
                    </div>
                  </div>
                </div>
              ) : error ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="text-2xl">⚠️</div>
                    {error.status && (
                      <div
                        className="text-xs font-mono px-2 py-0.5 rounded inline-block"
                        style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-error)' }}
                      >
                        HTTP {error.status}
                      </div>
                    )}
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {error.message}
                    </p>
                    <button
                      onClick={fetchData}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : (
                <DataTable
                  rows={filteredRows}
                  columns={roomConfig.columns}
                  sorts={roomConfig.sorts}
                  sort={sort}
                  selectedIdx={selectedIdx}
                  onSort={handleSort}
                  onSelect={handleSelect}
                />
              )}
            </div>

            {/* Preview panel */}
            {selectedRow && (
              <PreviewPanel
                row={selectedRow}
                columns={roomConfig.columns}
                onClose={() => setSelectedIdx(null)}
              />
            )}
          </div>

          {/* ── Footer ── */}
          <div
            className="flex items-center justify-between px-4 py-2 border-t shrink-0"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }}
          >
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
              {roomConfig.apiEndpoint}
            </span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
              Esc to close · click row to preview
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default RoomModal
