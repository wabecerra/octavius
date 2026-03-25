'use client'

import { useState, useEffect, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTasks, Task, Quadrant } from '@/hooks'
import type { Sprint } from '@/lib/sprint'
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
  onCreateTask,
  onUpdateTask,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingTask?: Task
  onCreateTask: (task: { title: string; description?: string; priority?: string; status?: string; quadrant?: string; project?: string; dueDate?: string }) => Promise<Task>
  onUpdateTask: (id: string, updates: Partial<Task>) => Promise<Task>
}) {

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Task['priority']>('medium')
  const [status, setStatus] = useState<KanbanColumn>('backlog')
  const [quadrant, setQuadrant] = useState<Quadrant>('')
  const [project, setProject] = useState('')
  const [dueDate, setDueDate] = useState('')

  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title)
      setDescription(editingTask.description ?? '')
      setPriority(editingTask.priority)
      setStatus((editingTask.status as KanbanColumn) ?? 'backlog')
      setQuadrant(editingTask.quadrant ?? '')
      setProject(editingTask.project ?? '')
      setDueDate(editingTask.dueDate ?? '')
    } else {
      setTitle('')
      setDescription('')
      setPriority('medium')
      setStatus('backlog')
      setQuadrant('')
      setProject('')
      setDueDate('')
    }
  }, [editingTask, open])

  const handleSave = async () => {
    if (!title.trim()) return
    try {
      if (editingTask) {
        await onUpdateTask(editingTask.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          status,
          quadrant,
          project: project.trim(),
          dueDate: dueDate || undefined,
        })
      } else {
        await onCreateTask({
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
          <Dialog.Description className="sr-only">
            {editingTask ? 'Edit task details including title, priority, status, and quadrant' : 'Create a new task with title, priority, and other details'}
          </Dialog.Description>
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

            {/* Status (edit only) */}
            {editingTask && (
              <div>
                <label className="block text-xs text-[var(--text-tertiary)] mb-1.5">Status</label>
                <div className="flex gap-2">
                  {(['backlog', 'in-progress', 'done'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150 ${
                        status === s
                          ? 'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent)]'
                          : 'border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      {s === 'in-progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
          <Dialog.Description className="sr-only">Confirm deletion of a task</Dialog.Description>
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

export function TaskBoardSection({ sprint }: { sprint: Sprint }) {
  const { tasks, updateTask, deleteTask, createTask } = useTasks({
    since: sprint.startDate,
    until: sprint.endDate,
    includeOpen: true,
  })

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)

  // Count carried-over tasks (open tasks created before this sprint)
  const carriedOverCount = useMemo(
    () => tasks.filter((t) => !t.completed && t.createdAt < sprint.startDate).length,
    [tasks, sprint.startDate],
  )

  // For the done column: only show tasks completed during this sprint
  // (done tasks from before the sprint are excluded by the API unless they're still open)
  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Show all non-done tasks (backlog + in-progress, including carry-overs)
      if (t.status !== 'done') return true
      // For done tasks: show if created in this sprint OR completed in this sprint
      if (t.createdAt >= sprint.startDate) return true
      if (t.updatedAt && t.updatedAt >= sprint.startDate) return true
      return false
    })
  }, [tasks, sprint.startDate])

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
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Sprint Board</h3>
            {carriedOverCount > 0 && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] text-[var(--color-warning)] border border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)]">
                {carriedOverCount} carried over
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-sm font-medium"
          >
            + New Task
          </button>
        </div>

        <KanbanBoard
          tasks={visibleTasks}
          sprintStart={sprint.startDate}
          onMoveTask={handleMoveTask}
          onEdit={openEdit}
          onDelete={(task) => setDeleteTarget(task)}
        />
      </div>

      <TaskModal
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        editingTask={editingTask}
        onCreateTask={createTask}
        onUpdateTask={updateTask}
      />
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
