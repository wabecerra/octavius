'use client'

import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useConnections } from '@/hooks'
import { useToast } from '@/components/Toast'
import type { Connection } from '@/types'

// ─── Connection Modal ───

function ConnectionModal({
  open,
  onOpenChange,
  editingConnection,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingConnection?: Connection
}) {
  const { addConnection, updateConnection } = useConnections()

  const [name, setName] = useState('')
  const [relationshipType, setRelationshipType] = useState('')
  const [reminderDays, setReminderDays] = useState('14')

  useEffect(() => {
    if (editingConnection) {
      setName(editingConnection.name)
      setRelationshipType(editingConnection.relationshipType)
      setReminderDays(String(editingConnection.reminderFrequencyDays))
    } else {
      setName('')
      setRelationshipType('')
      setReminderDays('14')
    }
  }, [editingConnection, open])

  const handleSave = async () => {
    if (!name.trim() || !relationshipType.trim()) return
    try {
      if (editingConnection) {
        await updateConnection(editingConnection.id, {
          name: name.trim(),
          relationshipType: relationshipType.trim(),
          reminderFrequencyDays: Number(reminderDays) || 14,
        })
      } else {
        await addConnection({
          name: name.trim(),
          relationshipType: relationshipType.trim(),
          reminderFrequencyDays: Number(reminderDays) || 14,
        })
      }
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to save connection:', err)
    }
  }

  const RELATIONSHIP_TYPES = ['Family', 'Friend', 'Colleague', 'Mentor', 'Partner', 'Other']

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)]">
            {editingConnection ? 'Edit Connection' : 'Add Connection'}
          </Dialog.Title>
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
            />
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Relationship type</label>
              <div className="flex flex-wrap gap-1.5">
                {RELATIONSHIP_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setRelationshipType(type)}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors duration-150 ${
                      relationshipType === type
                        ? 'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent)]'
                        : 'border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Reminder frequency</label>
              <select
                value={reminderDays}
                onChange={(e) => setReminderDays(e.target.value)}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
              >
                <option value="7">Every week</option>
                <option value="14">Every 2 weeks</option>
                <option value="30">Monthly</option>
                <option value="90">Quarterly</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Dialog.Close asChild>
              <button type="button" className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150">
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-sm font-medium"
            >
              {editingConnection ? 'Save Changes' : 'Add Connection'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Activity Log Form ───

function ActivityLogForm({ connections }: { connections: Connection[] }) {
  const { toast } = useToast()
  const [connectionId, setConnectionId] = useState('')
  const [description, setDescription] = useState('')

  const handleLog = () => {
    if (!connectionId || !description.trim()) return
    console.log('Activity logged:', { connectionId, description })
    setDescription('')
    toast({ title: 'Activity logged', variant: 'success' })
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Log Activity</h3>
      <p className="text-xs text-[var(--text-tertiary)]">Record a recent interaction</p>
      <select
        value={connectionId}
        onChange={(e) => setConnectionId(e.target.value)}
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
      >
        <option value="">Select a connection...</option>
        {connections.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What did you do together?"
        rows={2}
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] resize-none transition-colors duration-150"
      />
      <button
        type="button"
        onClick={handleLog}
        className="w-full py-2 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-sm font-medium"
      >
        Log Activity
      </button>
    </div>
  )
}

// ─── Main Fellowship View ───

export function FellowshipView() {
  const { connections, updateConnection } = useConnections()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | undefined>()

  const overdueConnections = connections.filter(c => {
    const daysSince = (Date.now() - new Date(c.lastContactDate).getTime()) / (1000 * 60 * 60 * 24)
    return daysSince > c.reminderFrequencyDays
  })
  const overdueIds = new Set(overdueConnections.map(c => c.id))

  const openCreate = () => { setEditingConnection(undefined); setModalOpen(true) }
  const openEdit = (conn: Connection) => { setEditingConnection(conn); setModalOpen(true) }

  const daysSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  const setReminderFrequency = async (id: string, days: number) => {
    try {
      await updateConnection(id, { reminderFrequencyDays: days })
    } catch (err) {
      console.error('Failed to update reminder frequency:', err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connection List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Connections</h3>
            <button
              type="button"
              onClick={openCreate}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-sm font-medium"
            >
              + Add Connection
            </button>
          </div>

          {connections.length === 0 ? (
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 text-center transition-colors duration-150 shadow-sm">
              <p className="text-[var(--text-tertiary)] text-sm">No connections yet. Add someone you care about.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {connections.map((conn) => {
                const isOverdue = overdueIds.has(conn.id)
                const days = daysSince(conn.lastContactDate)
                return (
                  <div
                    key={conn.id}
                    className={`bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2 transition-colors duration-150 cursor-pointer hover:bg-[var(--bg-hover)] shadow-sm ${
                      isOverdue ? 'border border-[var(--accent)]' : ''
                    }`}
                    onClick={() => openEdit(conn)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && openEdit(conn)}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-[var(--text-primary)]">{conn.name}</h4>
                      <span className="text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full">
                        {conn.relationshipType}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={isOverdue ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'}>
                        {days === 0 ? 'Today' : `${days}d ago`}
                      </span>
                      {isOverdue && (
                        <span className="text-[var(--accent)] text-[10px] font-medium">Overdue</span>
                      )}
                    </div>
                    <div className="pt-1">
                      <select
                        value={conn.reminderFrequencyDays}
                        onChange={(e) => {
                          e.stopPropagation()
                          setReminderFrequency(conn.id, Number(e.target.value))
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
                      >
                        <option value="7">Weekly</option>
                        <option value="14">Bi-weekly</option>
                        <option value="30">Monthly</option>
                        <option value="90">Quarterly</option>
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Activity Log Form */}
        <div>
          <ActivityLogForm connections={connections} />
        </div>
      </div>

      <ConnectionModal open={modalOpen} onOpenChange={setModalOpen} editingConnection={editingConnection} />
    </div>
  )
}
