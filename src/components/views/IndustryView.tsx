'use client'

import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTasks, useFocusGoals, useSchedule, Task } from '@/hooks'

// ─── Shared Constants ───

const PRIORITY_COLORS: Record<Task['priority'], string> = {
  high: 'bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] text-[var(--color-error)] border-[color-mix(in_srgb,var(--color-error)_30%,transparent)]',
  medium: 'bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)]',
  low: 'bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_30%,transparent)]',
}

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
  const [dueDate, setDueDate] = useState('')

  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title)
      setDescription(editingTask.description ?? '')
      setPriority(editingTask.priority)
      setDueDate(editingTask.dueDate ?? '')
    } else {
      setTitle('')
      setDescription('')
      setPriority('medium')
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
          dueDate: dueDate || undefined,
        })
      } else {
        await createTask({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          status: 'backlog',
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

// ─── Kanban Board ───

function KanbanBoard() {
  const { tasks, updateTask, deleteTask } = useTasks()

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)

  const getColumn = (task: Task): KanbanColumn => {
    return task.status as KanbanColumn
  }

  const moveToColumn = async (taskId: string, column: KanbanColumn) => {
    try {
      await updateTask(taskId, {
        status: column,
        completed: column === 'done',
      })
    } catch (err) {
      console.error('Failed to move task:', err)
    }
  }

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, column: KanbanColumn) => {
    e.preventDefault()
    if (draggedTaskId) {
      moveToColumn(draggedTaskId, column)
      setDraggedTaskId(null)
    }
  }

  const columns: { key: KanbanColumn; label: string; color: string }[] = [
    { key: 'backlog', label: 'Backlog', color: 'border-[var(--text-tertiary)]' },
    { key: 'in-progress', label: 'In Progress', color: 'border-[var(--color-warning)]' },
    { key: 'done', label: 'Done', color: 'border-[var(--color-success)]' },
  ]

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columns.map((col) => {
            const colTasks = tasks.filter((t) => getColumn(t) === col.key)
            return (
              <div
                key={col.key}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.key)}
                className={`bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 min-h-[200px] border-t-2 ${col.color} transition-colors duration-150 shadow-sm`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-[var(--text-secondary)]">{col.label}</h4>
                  <span className="text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full">
                    {colTasks.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-3 cursor-grab active:cursor-grabbing hover:bg-[var(--bg-hover)] transition-colors duration-150 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm text-[var(--text-primary)] ${task.completed ? 'line-through opacity-60' : ''}`}>
                          {task.title}
                        </p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${PRIORITY_COLORS[task.priority]}`}>
                          {task.priority}
                        </span>
                      </div>
                      {task.dueDate && (
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">{task.dueDate}</p>
                      )}
                      <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => openEdit(task)}
                          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150"
                        >
                          Edit
                        </button>
                        <span className="text-[var(--text-disabled)]">·</span>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(task)}
                          className="text-xs text-[var(--color-error)] opacity-70 hover:opacity-100 transition-colors duration-150"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
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

// ─── Focus Goals ───

function FocusGoalsSection() {
  const { goals, addGoal, removeGoal } = useFocusGoals()
  const [newGoal, setNewGoal] = useState('')
  const [capMessage, setCapMessage] = useState('')

  const handleAdd = async () => {
    if (!newGoal.trim()) return
    if (goals.length >= 3) {
      setCapMessage("You've set your 3 focus goals for today")
      return
    }

    try {
      await addGoal(newGoal.trim())
      setNewGoal('')
      setCapMessage('')
    } catch (err) {
      console.error('Failed to add focus goal:', err)
    }
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Focus Goals</h3>
      <p className="text-xs text-[var(--text-tertiary)]">Up to 3 priorities for today</p>

      <div className="space-y-2">
        {goals.map((g, i) => (
          <div key={g.id} className="flex items-center gap-2 bg-[var(--bg-secondary)] rounded-lg px-3 py-2">
            <span className="text-[var(--accent)] text-sm font-bold">{i + 1}.</span>
            <span className="text-sm text-[var(--text-primary)] flex-1">{g.title}</span>
            <button
              type="button"
              onClick={() => removeGoal(g.id)}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--color-error)] transition-colors duration-150"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {goals.length < 3 && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Add a focus goal..."
            className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="px-3 py-2 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-sm"
          >
            Add
          </button>
        </div>
      )}

      {capMessage && (
        <p className="text-xs text-[var(--color-warning)]">{capMessage}</p>
      )}
    </div>
  )
}

// ─── Daily Schedule ───

function DailySchedule() {
  const { items, addItem, toggleDone } = useSchedule()
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  const handleAdd = async () => {
    if (!title.trim()) return
    try {
      await addItem({
        time: startTime || '09:00',
        title: title.trim(),
      })
      setTitle('')
      setStartTime('')
      setEndTime('')
    } catch (err) {
      console.error('Failed to add schedule item:', err)
    }
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Today&apos;s Schedule</h3>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">No items scheduled for today</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 bg-[var(--bg-secondary)] rounded-lg px-3 py-2">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => toggleDone(item.id, !item.done)}
                className="rounded border-[var(--border-primary)]"
              />
              {item.time && (
                <span className="text-xs text-[var(--text-tertiary)] font-mono w-24 shrink-0">
                  {item.time}
                </span>
              )}
              <span className={`text-sm ${item.done ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
                {item.title}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add schedule item..."
          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
        />
        <div className="flex gap-2">
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
          />
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="px-3 py-2 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-sm"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Industry View ───

export function IndustryView() {
  return (
    <div className="space-y-6">
      <KanbanBoard />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FocusGoalsSection />
        <DailySchedule />
      </div>
    </div>
  )
}
