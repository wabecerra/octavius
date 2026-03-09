'use client'

import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTasks, Task, Quadrant } from '@/hooks'
import { KanbanBoard } from '@/components/ui/KanbanBoard'

// ─── Shared Constants ───

const PRIORITY_COLORS: Record<Task['priority'], string> = {
  high: 'bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] text-[var(--color-error)] border-[color-mix(in_srgb,var(--color-error)_30%,transparent)]',
  medium: 'bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)]',
  low: 'bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_30%,transparent)]',
}

const QUADRANT_OPTIONS: { key: Quadrant; label: string; color: string }[] = [
  { key: 'lifeforce',  label: 'Lifeforce',  color: '#34d399' },
  { key: 'industry',   label: 'Industry',   color: '#60a5fa' },
  { key: 'fellowship', label: 'Fellowship', color: '#f87171' },
  { key: 'essence',    label: 'Essence',    color: '#c084fc' },
]

type KanbanColumn = 'backlog' | 'in-progress' | 'done'

// ─── Task Create/Edit Modal ───

function TaskModal({
  open,
  onOpenChange,
  editingTask,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingTask?: Task
}) {
  const { createTask, updateTask } = useTasks()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Task['priority']>('medium')
  const [quadrant, setQuadrant] = useState<Quadrant>('')
  const [project, setProject] = useState('')
  const [dueDate, setDueDate] = useState('')

  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title)
      setDescription(editingTask.description ?? '')
      setPriority(editingTask.priority)
      setQuadrant(editingTask.quadrant ?? '')
      setProject(editingTask.project ?? '')
      setDueDate(editingTask.dueDate ?? '')
    } else {
      setTitle('')
      setDescription('')
      setPriority('medium')
      setQuadrant('')
      setProject('')
      setDueDate('')
    }
  }, [editingTask, open])

  const handleSave = async () => {
    if (!title.trim()) return
    try {
      if (editingTask) {
        await updateTask(editingTask.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          quadrant,
          project: project.trim(),
          dueDate: dueDate || undefined,
        })
      } else {
        await createTask({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          status: 'backlog',
          quadrant,
          project: project.trim(),
          dueDate: dueDate || undefined,
        })
      }
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to save task:', err)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)]">
            {editingTask ? 'Edit Task' : 'New Task'}
          </Dialog.Title>
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] resize-none transition-colors duration-150"
            />

            {/* Priority */}
            <div className="flex gap-2">
              {(['high', 'medium', 'low'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150 ${
                    priority === p ? PRIORITY_COLORS[p] : 'border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            {/* Quadrant */}
            <div>
              <label className="block text-xs text-[var(--text-tertiary)] mb-1.5">Quadrant</label>
              <div className="flex gap-2">
                {QUADRANT_OPTIONS.map((q) => (
                  <button
                    key={q.key}
                    type="button"
                    onClick={() => setQuadrant(quadrant === q.key ? '' : q.key)}
                    className="flex-1 py-1.5 rounded-lg text-[10px] font-medium border transition-colors duration-150"
                    style={
                      quadrant === q.key
                        ? { color: q.color, backgroundColor: `${q.color}1a`, borderColor: `${q.color}4d` }
                        : { color: 'var(--text-tertiary)', borderColor: 'var(--border-primary)' }
                    }
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Project tag */}
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value.slice(0, 24))}
              placeholder="Project tag (2-3 words max)"
              maxLength={24}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
            />

            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
            />
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
              {editingTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Delete Confirmation Modal ───

function DeleteConfirmModal({
  open,
  onOpenChange,
  onConfirm,
  taskTitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  taskTitle: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)]">Delete Task</Dialog.Title>
          <p className="text-sm text-[var(--text-secondary)]">
            Remove &ldquo;{taskTitle}&rdquo;? This can&apos;t be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <Dialog.Close asChild>
              <button type="button" className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150">
                Keep it
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={() => { onConfirm(); onOpenChange(false) }}
              className="px-4 py-2 rounded-lg bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] text-[var(--color-error)] hover:bg-[color-mix(in_srgb,var(--color-error)_20%,transparent)] transition-colors duration-150 text-sm font-medium"
            >
              Delete
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Exported Task Board Section ───

export function TaskBoardSection() {
  const { tasks, updateTask, deleteTask } = useTasks()

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)

  const handleMoveTask = async (taskId: string, newStatus: string) => {
    try {
      await updateTask(taskId, {
        status: newStatus as KanbanColumn,
        completed: newStatus === 'done',
      })
    } catch (err) {
      console.error('Failed to move task:', err)
    }
  }

  const openCreate = () => { setEditingTask(undefined); setTaskModalOpen(true) }
  const openEdit = (task: Task) => { setEditingTask(task); setTaskModalOpen(true) }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Task Board</h3>
          <button
            type="button"
            onClick={openCreate}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-sm font-medium"
          >
            + New Task
          </button>
        </div>

        <KanbanBoard
          tasks={tasks}
          onMoveTask={handleMoveTask}
          onEdit={openEdit}
          onDelete={(task) => setDeleteTarget(task)}
        />
      </div>

      <TaskModal open={taskModalOpen} onOpenChange={setTaskModalOpen} editingTask={editingTask} />
      <DeleteConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        onConfirm={() => {
          if (deleteTarget) {
            deleteTask(deleteTarget.id).catch(console.error)
          }
        }}
        taskTitle={deleteTarget?.title ?? ''}
      />
    </>
  )
}
