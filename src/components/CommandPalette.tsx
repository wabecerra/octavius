'use client'

import { useState, useEffect, useCallback } from 'react'
import { Command } from 'cmdk'

// ─── Types ───

export interface CommandPaletteItem {
  id: string
  label: string
  icon?: string
  group: string
  keywords?: string
}

interface CommandPaletteProps {
  items: CommandPaletteItem[]
  onSelect: (id: string) => void
}

// ─── Component ───

export function CommandPalette({ items, onSelect }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)

  // Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id)
      setOpen(false)
    },
    [onSelect],
  )

  // Group items
  const groups = items.reduce<Record<string, CommandPaletteItem[]>>((acc, item) => {
    ;(acc[item.group] ??= []).push(item)
    return acc
  }, {})

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 motion-safe:animate-[fade-in_150ms_ease-out]"
        onClick={() => setOpen(false)}
      />

      {/* Command dialog */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg">
        <Command
          className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-xl overflow-hidden
            motion-safe:animate-[scale-in_200ms_ease-out]"
          label="Command palette"
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-[var(--border-primary)]">
            <span className="text-[var(--text-tertiary)] text-sm shrink-0">⌘K</span>
            <Command.Input
              placeholder="Search commands..."
              className="flex-1 bg-transparent py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
              autoFocus
            />
          </div>

          {/* Results */}
          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Empty className="text-sm text-[var(--text-tertiary)] text-center py-6">
              No results found.
            </Command.Empty>

            {Object.entries(groups).map(([group, groupItems]) => (
              <Command.Group
                key={group}
                heading={group}
                className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[var(--text-tertiary)] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
              >
                {groupItems.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${item.label} ${item.keywords ?? ''}`}
                    onSelect={() => handleSelect(item.id)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--text-secondary)] cursor-pointer
                      data-[selected=true]:bg-[var(--bg-hover)] data-[selected=true]:text-[var(--text-primary)]
                      transition-colors duration-75"
                  >
                    {item.icon && (
                      <span className="text-base w-5 text-center shrink-0" aria-hidden="true">
                        {item.icon}
                      </span>
                    )}
                    <span>{item.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>

          {/* Footer hint */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border-primary)] text-xs text-[var(--text-disabled)]">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
        </Command>
      </div>
    </div>
  )
}
