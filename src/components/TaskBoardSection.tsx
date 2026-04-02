'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTasks, useActiveAgents, Task, Quadrant } from '@/hooks'
import type { Sprint } from '@/lib/sprint'
import { KanbanBoard } from '@/components/ui/KanbanBoard'

// ─── Subtask types ───

interface Subtask {
  id: string
  parentTaskId: string
  title: string
  description: string
  status: string
  stepOrder: number
  agentId: string | null
  requiresApproval: boolean
  approvedAt: string | null
  output: string
  createdAt: string
  updatedAt: string
}

const SUBTASK_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]',
  awaiting_approval: 'bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)]',
  approved: 'bg-[color-mix(in_srgb,var(--color-info)_15%,transparent)] text-[var(--color-info)]',
  'in-progress': 'bg-[color-mix(in_srgb,var(--color-info)_15%,transparent)] text-[var(--color-info)] animate-pulse',
  completed: 'bg-[color-mix(in_srgb,var(--color-success)_15%,transparent)] text-[var(--color-success)]',
  failed: 'bg-[color-mix(in_srgb,var(--color-error)_15%,transparent)] text-[var(--color-error)]',
  skipped: 'bg-[var(--bg-tertiary)] text-[var(--text-disabled)] line-through',
}

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

// ─── Expandable Description ───

const DESC_TRUNCATE_LEN = 200

function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const needsTruncation = text.length > DESC_TRUNCATE_LEN

  return (
    <div className="border-t border-[var(--border-primary)] pt-3">
      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap break-words">
        {expanded || !needsTruncation ? text : `${text.slice(0, DESC_TRUNCATE_LEN)}...`}
      </p>
      {needsTruncation && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[var(--accent)] hover:text-[var(--text-primary)] mt-1 transition-colors duration-150"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

// ─── Task Detail Modal (with subtask approval) ───

function TaskDetailModal({
  open,
  onOpenChange,
  task,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task | null
}) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchSubtasks = useCallback(async (taskId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/subtasks?taskId=${taskId}`)
      if (res.ok) {
        const data = await res.json()
        setSubtasks(data.subtasks || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && task) {
      fetchSubtasks(task.id)
    } else {
      setSubtasks([])
    }
  }, [open, task, fetchSubtasks])

  const handleAction = async (subtaskId: string, action: 'approve' | 'skip' | 'dispatch') => {
    setActionLoading(subtaskId)
    try {
      const res = await fetch('/api/dashboard/subtasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId, action }),
      })
      if (res.ok) {
        // Refresh subtasks
        if (task) await fetchSubtasks(task.id)
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null)
    }
  }

  if (!task) return null

  const awaitingApproval = subtasks.filter(s => s.status === 'awaiting_approval')

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 shadow-xl max-h-[80vh] overflow-y-auto">
          <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)]">
            {task.title}
          </Dialog.Title>
          <Dialog.Description className="sr-only">Task details and subtask management</Dialog.Description>

          {/* Task meta */}
          <div className="flex gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded border ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
            <span className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">{task.status}</span>
          </div>

          {/* Subtasks — shown FIRST so approval actions aren't buried */}
          <div className="border-t border-[var(--border-primary)] pt-4">
            <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">
              Subtasks
              {awaitingApproval.length > 0 && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)]">
                  {awaitingApproval.length} awaiting approval
                </span>
              )}
            </h4>

            {loading ? (
              <p className="text-xs text-[var(--text-tertiary)]">Loading subtasks...</p>
            ) : subtasks.length === 0 ? (
              <p className="text-xs text-[var(--text-tertiary)]">No subtasks</p>
            ) : (
              <div className="space-y-2">
                {subtasks.map((st) => (
                  <div
                    key={st.id}
                    className="border border-[var(--border-primary)] rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-primary)]">{st.title}</p>
                        {st.description && (
                          <p className="text-xs text-[var(--text-tertiary)] mt-0.5 line-clamp-3">{st.description}</p>
                        )}
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${SUBTASK_STATUS_STYLES[st.status] || SUBTASK_STATUS_STYLES.pending}`}>
                        {st.status.replace('_', ' ')}
                      </span>
                    </div>

                    {st.agentId && (
                      <p className="text-[10px] text-[var(--color-info)]">Agent: {st.agentId}</p>
                    )}

                    {st.output && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                          Output
                        </summary>
                        <pre className="mt-1 p-2 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)] overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap text-[10px]">
                          {st.output}
                        </pre>
                      </details>
                    )}

                    {/* Approval actions */}
                    {st.status === 'awaiting_approval' && (
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={actionLoading === st.id}
                          onClick={() => handleAction(st.id, 'approve')}
                          className="px-3 py-1 rounded-lg text-xs font-medium bg-[color-mix(in_srgb,var(--color-success)_15%,transparent)] text-[var(--color-success)] hover:bg-[color-mix(in_srgb,var(--color-success)_25%,transparent)] transition-colors duration-150 disabled:opacity-50"
                        >
                          {actionLoading === st.id ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading === st.id}
                          onClick={() => handleAction(st.id, 'skip')}
                          className="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors duration-150 disabled:opacity-50"
                        >
                          Skip
                        </button>
                      </div>
                    )}

                    {/* Dispatch actions for stuck pending subtasks */}
                    {st.status === 'pending' && (
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={actionLoading === st.id}
                          onClick={() => handleAction(st.id, 'dispatch')}
                          className="px-3 py-1 rounded-lg text-xs font-medium bg-[color-mix(in_srgb,var(--color-info)_15%,transparent)] text-[var(--color-info)] hover:bg-[color-mix(in_srgb,var(--color-info)_25%,transparent)] transition-colors duration-150 disabled:opacity-50"
                        >
                          {actionLoading === st.id ? 'Dispatching...' : '▶ Dispatch'}
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading === st.id}
                          onClick={() => handleAction(st.id, 'skip')}
                          className="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors duration-150 disabled:opacity-50"
                        >
                          Skip
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Task description — shown after subtasks, truncated */}
          {task.description && (
            <ExpandableDescription text={task.description} />
          )}

          <div className="flex justify-end pt-2">
            <Dialog.Close asChild>
              <button type="button" className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150">
                Close
              </button>
            </Dialog.Close>
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
  const { agentByTaskId } = useActiveAgents()

  // Build map of taskId → agentId for active agent indicators
  const activeAgentMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const [taskId, agent] of agentByTaskId) {
      map.set(taskId, agent.agentId)
    }
    return map
  }, [agentByTaskId])

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)
  const [detailTask, setDetailTask] = useState<Task | null>(null)

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
          activeAgentMap={activeAgentMap}
          onMoveTask={handleMoveTask}
          onEdit={openEdit}
          onDelete={(task) => setDeleteTarget(task)}
          onView={(task) => setDetailTask(task)}
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
      <TaskDetailModal
        open={!!detailTask}
        onOpenChange={(open) => { if (!open) setDetailTask(null) }}
        task={detailTask}
      />
    </>
  )
}
