'use client'

import { useState, useEffect, useCallback } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import * as Dialog from '@radix-ui/react-dialog'
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { QuadrantCard } from '@/components/QuadrantCard'
import { useOctaviusStore, latestCheckIn, overdueConnections } from '@/store'
import { computeBalanceScore } from '@/lib/balance-score'
import { shouldShowWeeklyReviewPrompt } from '@/lib/weekly-review'
import { toChartData } from '@/lib/chart-utils'
import { validateCheckInValue } from '@/lib/validation'
import { executeTask, AgentExecutionError } from '@/lib/agent-adapter'
import { estimateDailyCost } from '@/lib/cost-tracker'
import { routeTask } from '@/lib/model-router'
import { BreathingTool } from '@/components/BreathingTool'
import { MemoryConfigSection } from '@/components/MemoryConfigSection'
import { ChatPanel } from '@/components/ChatPanel'
import { ThemeToggle } from '@/components/ThemeToggle'
import { GatewayStatusPanel } from '@/components/GatewayStatusPanel'
import { ScheduledJobsPanel } from '@/components/ScheduledJobsPanel'
import { HeartbeatActionsPanel } from '@/components/HeartbeatActionsPanel'
import { WorkspaceFilesEditor } from '@/components/WorkspaceFilesEditor'
import {
  HeartRateChart,
  HrvChart,
  SpO2Chart,
  SleepChart,
  ActivityChart,
  DateRangeFilter,
  HealthCsvUpload,
  HealthEmptyState,
} from '@/components/health'
import { useGatewayInit, useGatewayReconnect, getGatewayClient } from '@/lib/gateway/use-gateway'
import type { ChatMessage } from '@/lib/gateway/types'
import type { WellnessCheckIn, Task, Connection, Agent, AgentTask, AgentTaskStatus, ModelTier } from '@/types'

const TAB_ITEMS = [
  { value: 'dashboard', label: 'Dashboard', group: 'main' },
  { value: 'health', label: 'Lifeforce', group: 'life' },
  { value: 'career', label: 'Industry', group: 'life' },
  { value: 'relationships', label: 'Fellowship', group: 'life' },
  { value: 'soul', label: 'Essence', group: 'life' },
  { value: 'agents', label: 'Agents', group: 'system' },
  { value: 'settings', label: 'Settings', group: 'system' },
] as const

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// Compound Loop phases

function getCompoundPhase(dayOfWeek: number): string {
  if (dayOfWeek >= 1 && dayOfWeek <= 2) return 'Plan'
  if (dayOfWeek >= 3 && dayOfWeek <= 4) return 'Work'
  if (dayOfWeek === 5) return 'Review'
  return 'Compound'
}

// Kanban column type for task tracking
type KanbanColumn = 'backlog' | 'in-progress' | 'done'

const PRIORITY_COLORS: Record<Task['priority'], string> = {
  high: 'bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] text-[var(--color-error)] border-[color-mix(in_srgb,var(--color-error)_30%,transparent)]',
  medium: 'bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)]',
  low: 'bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_30%,transparent)]',
}

// ─── Health Tab: Wellness Check-In Form ───

function WellnessCheckInForm() {
  const addCheckIn = useOctaviusStore((s) => s.addCheckIn)
  const [mood, setMood] = useState(3)
  const [energy, setEnergy] = useState(3)
  const [stress, setStress] = useState(3)
  const [errors, setErrors] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    const errs: string[] = []
    if (!validateCheckInValue(mood)) errs.push('Mood must be 1–5')
    if (!validateCheckInValue(energy)) errs.push('Energy must be 1–5')
    if (!validateCheckInValue(stress)) errs.push('Stress must be 1–5')

    if (errs.length > 0) {
      setErrors(errs)
      return
    }

    const checkIn: WellnessCheckIn = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      mood: mood as WellnessCheckIn['mood'],
      energy: energy as WellnessCheckIn['energy'],
      stress: stress as WellnessCheckIn['stress'],
    }
    addCheckIn(checkIn)
    setErrors([])
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 2000)
  }

  const sliders = [
    { label: 'Mood', value: mood, set: setMood, emoji: ['😞', '😐', '🙂', '😊', '😄'] },
    { label: 'Energy', value: energy, set: setEnergy, emoji: ['🪫', '🔋', '⚡', '💪', '🔥'] },
    { label: 'Stress', value: stress, set: setStress, emoji: ['😌', '🙂', '😐', '😰', '😫'] },
  ]

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-5 transition-colors duration-150">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Daily Check-In</h3>
      <p className="text-sm text-[var(--text-secondary)]">How are you feeling today?</p>

      {errors.length > 0 && (
        <div className="bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-error)_30%,transparent)] rounded-lg p-3">
          {errors.map((e) => (
            <p key={e} className="text-sm text-[var(--color-error)]">{e}</p>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {sliders.map((s) => (
          <div key={s.label} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm text-[var(--text-secondary)]">{s.label}</label>
              <span className="text-lg">{s.emoji[s.value - 1]}</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={s.value}
              onChange={(e) => s.set(Number(e.target.value))}
              className="w-full accent-[var(--accent)] h-2 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]"
            />
            <div className="flex justify-between text-xs text-[var(--text-tertiary)]">
              <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        className="w-full py-2.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-sm font-medium"
      >
        {submitted ? '✓ Saved' : 'Save Check-In'}
      </button>
    </div>
  )
}

// ─── Health Tab: Metrics Inputs ───

function HealthMetricsForm() {
  const metrics = useOctaviusStore((s) => s.health.metrics)
  const updateMetrics = useOctaviusStore((s) => s.updateMetrics)

  const [steps, setSteps] = useState(metrics.steps?.toString() ?? '')
  const [sleep, setSleep] = useState(metrics.sleepHours?.toString() ?? '')
  const [heartRate, setHeartRate] = useState(metrics.heartRate?.toString() ?? '')

  const handleSave = useCallback(() => {
    const update: Record<string, number> = {}
    if (steps) update.steps = Number(steps)
    if (sleep) update.sleepHours = Number(sleep)
    if (heartRate) update.heartRate = Number(heartRate)
    updateMetrics(update)
  }, [steps, sleep, heartRate, updateMetrics])

  const fields = [
    { label: 'Steps', value: steps, set: setSteps, icon: '🚶', placeholder: 'e.g. 8000', type: 'number' },
    { label: 'Sleep (hours)', value: sleep, set: setSleep, icon: '😴', placeholder: 'e.g. 7.5', type: 'number' },
    { label: 'Heart Rate (bpm)', value: heartRate, set: setHeartRate, icon: '❤️', placeholder: 'e.g. 72', type: 'number' },
  ]

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-5 transition-colors duration-150">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Health Metrics</h3>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.label}>
            <label className="text-sm text-[var(--text-secondary)] flex items-center gap-2 mb-1">
              <span>{f.icon}</span> {f.label}
            </label>
            <input
              type={f.type}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              onBlur={handleSave}
              placeholder={f.placeholder}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm
                placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Career Tab: Task Create/Edit Modal ───

function TaskModal({
  open,
  onOpenChange,
  editingTask,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingTask?: Task
}) {
  const createTask = useOctaviusStore((s) => s.createTask)
  const editTask = useOctaviusStore((s) => s.editTask)

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

  const handleSave = () => {
    if (!title.trim()) return
    if (editingTask) {
      editTask(editingTask.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
      })
    } else {
      createTask({
        id: crypto.randomUUID(),
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
        completed: false,
        createdAt: new Date().toISOString(),
      })
    }
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
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

// ─── Career Tab: Delete Confirmation Modal ───

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
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
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

// ─── Career Tab: Kanban Board ───

function KanbanBoard() {
  const tasks = useOctaviusStore((s) => s.career.tasks)
  const editTask = useOctaviusStore((s) => s.editTask)
  const deleteTask = useOctaviusStore((s) => s.deleteTask)

  // Track in-progress state locally — tasks start as backlog, move to in-progress, then done (completed)
  const [inProgressIds, setInProgressIds] = useState<Set<string>>(new Set())
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)

  const getColumn = (task: Task): KanbanColumn => {
    if (task.completed) return 'done'
    if (inProgressIds.has(task.id)) return 'in-progress'
    return 'backlog'
  }

  const moveToColumn = (taskId: string, column: KanbanColumn) => {
    if (column === 'done') {
      editTask(taskId, { completed: true })
      setInProgressIds((prev) => { const next = new Set(prev); next.delete(taskId); return next })
    } else if (column === 'in-progress') {
      editTask(taskId, { completed: false })
      setInProgressIds((prev) => new Set(prev).add(taskId))
    } else {
      editTask(taskId, { completed: false })
      setInProgressIds((prev) => { const next = new Set(prev); next.delete(taskId); return next })
    }
  }

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
                className={`bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 min-h-[200px] border-t-2 ${col.color} transition-colors duration-150`}
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
        onConfirm={() => { if (deleteTarget) deleteTask(deleteTarget.id) }}
        taskTitle={deleteTarget?.title ?? ''}
      />
    </>
  )
}

// ─── Career Tab: Focus Goals ───

function FocusGoalsSection() {
  const focusGoals = useOctaviusStore((s) => s.career.focusGoals)
  const addFocusGoal = useOctaviusStore((s) => s.addFocusGoal)
  const [newGoal, setNewGoal] = useState('')
  const [capMessage, setCapMessage] = useState('')

  const todayStr = new Date().toISOString().slice(0, 10)
  const todayGoals = focusGoals.filter((g) => g.date === todayStr)

  const handleAdd = () => {
    if (!newGoal.trim()) return
    const success = addFocusGoal({
      id: crypto.randomUUID(),
      date: todayStr,
      title: newGoal.trim(),
    })
    if (success) {
      setNewGoal('')
      setCapMessage('')
    } else {
      setCapMessage("You've set your 3 focus goals for today")
    }
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Focus Goals</h3>
      <p className="text-xs text-[var(--text-tertiary)]">Up to 3 priorities for today</p>

      <div className="space-y-2">
        {todayGoals.map((g, i) => (
          <div key={g.id} className="flex items-center gap-2 bg-[var(--bg-secondary)] rounded-lg px-3 py-2">
            <span className="text-[var(--accent)] text-sm font-bold">{i + 1}.</span>
            <span className="text-sm text-[var(--text-primary)]">{g.title}</span>
          </div>
        ))}
      </div>

      {todayGoals.length < 3 && (
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

// ─── Career Tab: Daily Schedule ───

function DailySchedule() {
  const scheduleItems = useOctaviusStore((s) => s.career.scheduleItems)
  const addScheduleItem = useOctaviusStore((s) => s.addScheduleItem)
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  const todayStr = new Date().toISOString().slice(0, 10)
  const todayItems = scheduleItems
    .filter((item) => item.date === todayStr)
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))

  const handleAdd = () => {
    if (!title.trim()) return
    addScheduleItem({
      id: crypto.randomUUID(),
      date: todayStr,
      title: title.trim(),
      startTime: startTime || undefined,
      endTime: endTime || undefined,
    })
    setTitle('')
    setStartTime('')
    setEndTime('')
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Today&apos;s Schedule</h3>

      {todayItems.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">No items scheduled for today</p>
      ) : (
        <div className="space-y-2">
          {todayItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 bg-[var(--bg-secondary)] rounded-lg px-3 py-2">
              {item.startTime && (
                <span className="text-xs text-[var(--text-tertiary)] font-mono w-24 shrink-0">
                  {item.startTime}{item.endTime ? ` – ${item.endTime}` : ''}
                </span>
              )}
              <span className="text-sm text-[var(--text-primary)]">{item.title}</span>
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

// ─── Relationships Tab: Connection Modal ───

function ConnectionModal({
  open,
  onOpenChange,
  editingConnection,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingConnection?: Connection
}) {
  const addConnection = useOctaviusStore((s) => s.addConnection)
  const updateConnection = useOctaviusStore((s) => s.updateConnection)

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

  const handleSave = () => {
    if (!name.trim() || !relationshipType.trim()) return
    if (editingConnection) {
      updateConnection(editingConnection.id, {
        name: name.trim(),
        relationshipType: relationshipType.trim(),
        reminderFrequencyDays: Number(reminderDays) || 14,
      })
    } else {
      addConnection({
        id: crypto.randomUUID(),
        name: name.trim(),
        relationshipType: relationshipType.trim(),
        lastContactDate: new Date().toISOString().slice(0, 10),
        reminderFrequencyDays: Number(reminderDays) || 14,
      })
    }
    onOpenChange(false)
  }

  const RELATIONSHIP_TYPES = ['Family', 'Friend', 'Colleague', 'Mentor', 'Partner', 'Other']

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
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

// ─── Relationships Tab: Activity Log Form ───

function ActivityLogForm({ connections }: { connections: Connection[] }) {
  const logActivity = useOctaviusStore((s) => s.logActivity)
  const [connectionId, setConnectionId] = useState('')
  const [description, setDescription] = useState('')
  const [saved, setSaved] = useState(false)

  const handleLog = () => {
    if (!connectionId || !description.trim()) return
    logActivity({
      id: crypto.randomUUID(),
      connectionId,
      description: description.trim(),
      date: new Date().toISOString().slice(0, 10),
    })
    setDescription('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
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
        {saved ? '✓ Logged' : 'Log Activity'}
      </button>
    </div>
  )
}

// ─── Relationships Tab: Connection List with Overdue Highlighting ───

function RelationshipsTab() {
  const connections = useOctaviusStore((s) => s.relationships.connections)
  const setReminderFrequency = useOctaviusStore((s) => s.setReminderFrequency)
  const store = useOctaviusStore()
  const overdue = overdueConnections(store)
  const overdueIds = new Set(overdue.map((c) => c.id))

  const [modalOpen, setModalOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<Connection | undefined>()

  const openCreate = () => { setEditingConnection(undefined); setModalOpen(true) }
  const openEdit = (conn: Connection) => { setEditingConnection(conn); setModalOpen(true) }

  const daysSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
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
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 text-center transition-colors duration-150">
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
                    className={`bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2 transition-colors duration-150 cursor-pointer hover:bg-[var(--bg-hover)] ${
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
                    {/* Inline reminder frequency selector */}
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

// ─── Soul Tab: Journal ───

function JournalSection() {
  const addJournalEntry = useOctaviusStore((s) => s.addJournalEntry)
  const journalEntries = useOctaviusStore((s) => s.soul.journalEntries)
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)

  const handleBlur = () => {
    if (!text.trim()) return
    addJournalEntry({
      id: crypto.randomUUID(),
      text: text.trim(),
      timestamp: new Date().toISOString(),
    })
    setSaved(true)
    setTimeout(() => { setSaved(false); setText('') }, 1500)
  }

  // Show recent entries
  const recentEntries = [...journalEntries]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5)

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Journal</h3>
      <p className="text-xs text-[var(--text-tertiary)]">Write freely — saves when you click away</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        placeholder="What's on your mind?"
        rows={4}
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] resize-none transition-colors duration-150"
      />
      {saved && <p className="text-xs text-[var(--color-success)]">✓ Entry saved</p>}

      {recentEntries.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[var(--border-primary)]">
          <p className="text-xs text-[var(--text-tertiary)]">Recent entries</p>
          {recentEntries.map((entry) => (
            <div key={entry.id} className="bg-[var(--bg-secondary)] rounded-lg px-3 py-2">
              <p className="text-xs text-[var(--text-tertiary)] mb-1">
                {new Date(entry.timestamp).toLocaleDateString()}
              </p>
              <p className="text-sm text-[var(--text-secondary)] line-clamp-2">{entry.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Soul Tab: Gratitude Prompt ───

function GratitudePrompt() {
  const addGratitudeEntry = useOctaviusStore((s) => s.addGratitudeEntry)
  const [items, setItems] = useState(['', '', ''])
  const [saved, setSaved] = useState(false)

  const updateItem = (index: number, value: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? value : item)))
  }

  const handleSubmit = () => {
    const filled = items.filter((item) => item.trim())
    if (filled.length === 0) return
    addGratitudeEntry({
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      items: filled.map((item) => item.trim()),
    })
    setItems(['', '', ''])
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Gratitude</h3>
      <p className="text-xs text-[var(--text-tertiary)]">What are you grateful for today?</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[var(--accent)] text-sm font-bold">{i + 1}.</span>
            <input
              type="text"
              value={item}
              onChange={(e) => updateItem(i, e.target.value)}
              placeholder={`Something you appreciate...`}
              className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        className="w-full py-2 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-sm font-medium"
      >
        {saved ? '✓ Saved' : 'Save Gratitude'}
      </button>
    </div>
  )
}

// ─── Soul Tab: Mood Tracker Chart ───

function MoodTrackerChart() {
  const checkIns = useOctaviusStore((s) => s.health.checkIns)
  const chartData = toChartData(checkIns)

  // Format timestamps for display
  const formattedData = chartData.map((d) => ({
    ...d,
    label: new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Mood Tracker</h3>
      <p className="text-xs text-[var(--text-tertiary)]">Your mood over time from check-ins</p>

      {formattedData.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
          No check-in data yet. Complete a wellness check-in to see your mood trend.
        </p>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#6B7280', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              />
              <YAxis
                domain={[1, 5]}
                ticks={[1, 2, 3, 4, 5]}
                tick={{ fill: '#6B7280', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <Line
                type="monotone"
                dataKey="mood"
                stroke="#7C3AED"
                strokeWidth={2}
                dot={{ fill: '#7C3AED', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Agents Tab: Agent Card ───

const AGENT_ICONS: Record<string, string> = {
  'generalist-health': '💚',
  'generalist-career': '💼',
  'generalist-relationships': '🤝',
  'generalist-soul': '🧘',
  'specialist-research': '🔍',
  'specialist-engineering': '⚙️',
  'specialist-marketing': '📣',
  'specialist-video': '🎬',
  'specialist-image': '🖼️',
  'specialist-writing': '✍️',
}

const STATUS_COLORS: Record<Agent['status'], string> = {
  idle: 'bg-[var(--text-tertiary)]',
  running: 'bg-[var(--color-success)] animate-pulse',
  error: 'bg-[var(--color-error)]',
}

function AgentCardItem({ agent, onSendTask }: { agent: Agent; onSendTask: (agent: Agent) => void }) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-3 transition-colors duration-150">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{AGENT_ICONS[agent.role] ?? '🤖'}</span>
          <h4 className="text-sm font-medium text-[var(--text-primary)]">{agent.name}</h4>
        </div>
        <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[agent.status]}`} title={agent.status} />
      </div>
      <p className="text-xs text-[var(--text-tertiary)] capitalize">{agent.role.replace(/-/g, ' ')}</p>
      {agent.lastActivityAt && (
        <p className="text-[10px] text-[var(--text-disabled)]">
          Last active: {new Date(agent.lastActivityAt).toLocaleString()}
        </p>
      )}
      <button
        type="button"
        onClick={() => onSendTask(agent)}
        className="w-full py-1.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-xs font-medium"
      >
        Send Task
      </button>
    </div>
  )
}

// ─── Agents Tab: Send Task Modal ───

function SendTaskModal({
  open,
  onOpenChange,
  targetAgent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetAgent: Agent | null
}) {
  const createAgentTask = useOctaviusStore((s) => s.createAgentTask)
  const updateAgentTaskStatus = useOctaviusStore((s) => s.updateAgentTaskStatus)
  const updateAgentStatus = useOctaviusStore((s) => s.updateAgentStatus)
  const appendEscalationEvent = useOctaviusStore((s) => s.appendEscalationEvent)
  const routerConfig = useOctaviusStore((s) => s.routerConfig)

  const [description, setDescription] = useState('')
  const [complexity, setComplexity] = useState(5)
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!targetAgent || !description.trim()) return
    setSending(true)

    const tier: ModelTier = complexity <= 4 ? 1 : complexity <= 7 ? 2 : 3
    const routing = routeTask(complexity, routerConfig, false)
    const task: AgentTask = {
      id: crypto.randomUUID(),
      agentId: targetAgent.id,
      description: description.trim(),
      complexityScore: complexity,
      tier,
      modelUsed: routing.model,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    createAgentTask(task)
    updateAgentStatus(targetAgent.id, 'running')
    updateAgentTaskStatus(task.id, 'running')
    onOpenChange(false)
    setDescription('')
    setComplexity(5)
    setSending(false)

    // Execute in background
    try {
      const result = await executeTask(task, routerConfig, false)
      updateAgentTaskStatus(task.id, 'complete', result.result)
      updateAgentStatus(targetAgent.id, 'idle')
    } catch (err) {
      if (err instanceof AgentExecutionError) {
        appendEscalationEvent(err.escalation)
        updateAgentTaskStatus(task.id, 'failed', err.message)
      } else {
        updateAgentTaskStatus(task.id, 'failed', String(err))
      }
      updateAgentStatus(targetAgent.id, 'error')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
          <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)]">
            Send Task to {targetAgent?.name ?? 'Agent'}
          </Dialog.Title>
          <div className="space-y-3">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task..."
              rows={3}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] resize-none transition-colors duration-150"
            />
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                Complexity: {complexity}/10
                <span className="ml-2 text-[var(--text-disabled)]">
                  (Tier {complexity <= 4 ? 1 : complexity <= 7 ? 2 : 3})
                </span>
              </label>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={complexity}
                onChange={(e) => setComplexity(Number(e.target.value))}
                className="w-full accent-[var(--accent)] h-2 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--text-disabled)] mt-1">
                <span>Simple</span><span>Complex</span>
              </div>
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
              onClick={handleSend}
              disabled={sending || !description.trim()}
              className="px-4 py-2 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-sm font-medium disabled:opacity-40"
            >
              {sending ? 'Sending...' : 'Send Task'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Agents Tab: Task List with Sort Controls ───

type AgentTaskSortKey = 'status' | 'agentId' | 'createdAt' | 'complexityScore'

function AgentTaskList() {
  const agentTasks = useOctaviusStore((s) => s.agentTasks)
  const agents = useOctaviusStore((s) => s.agents)
  const [sortBy, setSortBy] = useState<AgentTaskSortKey>('createdAt')
  const [sortAsc, setSortAsc] = useState(false)

  const agentMap = new Map(agents.map((a) => [a.id, a.name]))

  const sorted = [...agentTasks].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'status') cmp = a.status.localeCompare(b.status)
    else if (sortBy === 'agentId') cmp = (agentMap.get(a.agentId) ?? '').localeCompare(agentMap.get(b.agentId) ?? '')
    else if (sortBy === 'createdAt') cmp = a.createdAt.localeCompare(b.createdAt)
    else if (sortBy === 'complexityScore') cmp = a.complexityScore - b.complexityScore
    return sortAsc ? cmp : -cmp
  })

  const toggleSort = (key: AgentTaskSortKey) => {
    if (sortBy === key) setSortAsc(!sortAsc)
    else { setSortBy(key); setSortAsc(true) }
  }

  const STATUS_BADGE: Record<AgentTaskStatus, string> = {
    pending: 'bg-[color-mix(in_srgb,var(--text-tertiary)_20%,transparent)] text-[var(--text-secondary)]',
    running: 'bg-[color-mix(in_srgb,var(--color-info)_10%,transparent)] text-[var(--color-info)]',
    complete: 'bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)]',
    failed: 'bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] text-[var(--color-error)]',
    cancelled: 'bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] text-[var(--color-warning)]',
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Task History</h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-4">No tasks dispatched yet</p>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {(['createdAt', 'status', 'agentId', 'complexityScore'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleSort(key)}
                className={`px-2.5 py-1 rounded text-xs border transition-colors duration-150 ${
                  sortBy === key ? 'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {key === 'createdAt' ? 'Date' : key === 'agentId' ? 'Agent' : key === 'complexityScore' ? 'Complexity' : 'Status'}
                {sortBy === key && (sortAsc ? ' ↑' : ' ↓')}
              </button>
            ))}
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {sorted.map((task) => (
              <div key={task.id} className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-[var(--text-primary)] truncate">{task.description}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${STATUS_BADGE[task.status]}`}>
                    {task.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[var(--text-tertiary)]">
                  <span>{agentMap.get(task.agentId) ?? task.agentId}</span>
                  <span>Tier {task.tier}</span>
                  <span>C:{task.complexityScore}</span>
                  <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                </div>
                {task.result && (
                  <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{task.result}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Agents Tab: Main Component ───

function AgentsTab() {
  const agents = useOctaviusStore((s) => s.agents)
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [targetAgent, setTargetAgent] = useState<Agent | null>(null)

  const generalists = agents.filter((a) => a.role.startsWith('generalist-'))
  const specialists = agents.filter((a) => a.role.startsWith('specialist-'))

  const openSendTask = (agent: Agent) => {
    setTargetAgent(agent)
    setSendModalOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Generalist Agents */}
      <div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Generalist Agents</h3>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">One per quadrant — handles general tasks in their domain</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {generalists.map((agent) => (
            <AgentCardItem key={agent.id} agent={agent} onSendTask={openSendTask} />
          ))}
        </div>
      </div>

      {/* Specialist Agents */}
      <div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Specialist Agents</h3>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">Domain experts for focused tasks</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {specialists.map((agent) => (
            <AgentCardItem key={agent.id} agent={agent} onSendTask={openSendTask} />
          ))}
        </div>
      </div>

      {/* Agent Task List */}
      <AgentTaskList />

      {/* Workspace Files Editor */}
      <WorkspaceFilesEditor />

      {/* Send Task Modal */}
      <SendTaskModal open={sendModalOpen} onOpenChange={setSendModalOpen} targetAgent={targetAgent} />
    </div>
  )
}

// ─── Settings Tab: Main Component ───

function SettingsTab() {
  const profile = useOctaviusStore((s) => s.profile)
  const updateProfile = useOctaviusStore((s) => s.updateProfile)
  const routerConfig = useOctaviusStore((s) => s.routerConfig)
  const updateRouterConfig = useOctaviusStore((s) => s.updateRouterConfig)
  const escalationLog = useOctaviusStore((s) => s.escalationLog)
  const agentTasks = useOctaviusStore((s) => s.agentTasks)
  const localModelStatus = useOctaviusStore((s) => s.localModelStatus)
  const checkLocalModel = useOctaviusStore((s) => s.checkLocalModel)

  // Gateway state
  const gatewayStatus = useOctaviusStore((s) => s.gatewayStatus)
  const gatewayAddress = useOctaviusStore((s) => s.gatewayAddress)
  const gatewayPort = useOctaviusStore((s) => s.gatewayPort)
  const connectedAt = useOctaviusStore((s) => s.connectedAt)
  const lastHealthyAt = useOctaviusStore((s) => s.lastHealthyAt)
  const registeredAgents = useOctaviusStore((s) => s.registeredAgents)
  const activeSessions = useOctaviusStore((s) => s.activeSessions)
  const recentSessions = useOctaviusStore((s) => s.recentSessions)
  const dailyTokenUsage = useOctaviusStore((s) => s.dailyTokenUsage)
  const scheduledJobs = useOctaviusStore((s) => s.scheduledJobs)
  const heartbeatActions = useOctaviusStore((s) => s.heartbeatActions)
  const setGatewayAddress = useOctaviusStore((s) => s.setGatewayAddress)
  const setScheduledJobs = useOctaviusStore((s) => s.setScheduledJobs)
  const setHeartbeatActions = useOctaviusStore((s) => s.setHeartbeatActions)
  const reconnect = useGatewayReconnect()

  // Gateway config form state
  const [gwAddress, setGwAddress] = useState(gatewayAddress)
  const [gwPort, setGwPort] = useState(String(gatewayPort))
  const [gwToken, setGwToken] = useState('')
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')

  const dailyCost = estimateDailyCost(agentTasks, routerConfig.tierCostRates)

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  // Check local model health when Settings tab loads
  useEffect(() => {
    checkLocalModel()
  }, [checkLocalModel])

  // Wire accent color to CSS custom property
  useEffect(() => {
    document.documentElement.style.setProperty('--color-accent', profile.accentColor)
  }, [profile.accentColor])

  return (
    <div className="space-y-6">
      {/* Profile Form */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Profile</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Name</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => updateProfile({ name: e.target.value })}
              placeholder="Your name"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Core Values</label>
            <textarea
              value={profile.coreValues}
              onChange={(e) => updateProfile({ coreValues: e.target.value })}
              placeholder="What matters most to you?"
              rows={2}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] resize-none transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Life Vision</label>
            <textarea
              value={profile.lifeVision}
              onChange={(e) => updateProfile({ lifeVision: e.target.value })}
              placeholder="Where do you see yourself heading?"
              rows={2}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] resize-none transition-colors duration-150"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={profile.accentColor}
                  onChange={(e) => updateProfile({ accentColor: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-[var(--border-primary)] bg-transparent cursor-pointer"
                />
                <span className="text-xs text-[var(--text-tertiary)] font-mono">{profile.accentColor}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Weekly Review Day</label>
              <select
                value={profile.weeklyReviewDay}
                onChange={(e) => updateProfile({ weeklyReviewDay: Number(e.target.value) })}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
              >
                {DAYS.map((day, i) => (
                  <option key={day} value={i}>{day}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Model Router Config */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Model Router</h3>
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <span className={`w-2 h-2 rounded-full ${
              localModelStatus === 'connected' ? 'bg-[var(--color-success)]' :
              localModelStatus === 'disconnected' ? 'bg-[var(--color-error)]' :
              'bg-[var(--text-tertiary)]'
            }`} />
            {localModelStatus === 'connected' ? 'Local model connected' :
             localModelStatus === 'disconnected' ? 'Local model disconnected' :
             'Local model status unknown'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Local Endpoint</label>
            <input
              type="text"
              value={routerConfig.localEndpoint}
              onChange={(e) => updateRouterConfig({ localEndpoint: e.target.value })}
              placeholder="http://localhost:11434"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Local Model Name</label>
            <input
              type="text"
              value={routerConfig.localModelName}
              onChange={(e) => updateRouterConfig({ localModelName: e.target.value })}
              placeholder="llama3.2"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Tier 1 Cloud Model</label>
            <input
              type="text"
              value={routerConfig.tier1CloudModel}
              onChange={(e) => updateRouterConfig({ tier1CloudModel: e.target.value })}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Tier 2 Model</label>
            <input
              type="text"
              value={routerConfig.tier2Model}
              onChange={(e) => updateRouterConfig({ tier2Model: e.target.value })}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Tier 3 Model</label>
            <input
              type="text"
              value={routerConfig.tier3Model}
              onChange={(e) => updateRouterConfig({ tier3Model: e.target.value })}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Research Provider</label>
            <input
              type="text"
              value={routerConfig.researchProvider}
              onChange={(e) => updateRouterConfig({ researchProvider: e.target.value })}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">Daily Cost Budget (USD)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={routerConfig.dailyCostBudget}
            onChange={(e) => updateRouterConfig({ dailyCostBudget: Number(e.target.value) || 0 })}
            className="w-full sm:w-48 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
          />
        </div>
      </div>

      {/* Daily Cost Summary */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-3 transition-colors duration-150">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Cost Summary</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-[var(--text-primary)]">${dailyCost.toFixed(4)}</span>
          <span className="text-sm text-[var(--text-tertiary)]">/ ${routerConfig.dailyCostBudget.toFixed(2)} budget</span>
        </div>
        <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2">
          <div
            className="h-2 rounded-full bg-[var(--accent)] transition-all"
            style={{ width: `${Math.min((dailyCost / routerConfig.dailyCostBudget) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Escalation Log */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Escalation Log</h3>
        {escalationLog.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] text-center py-4">No escalation events</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-tertiary)] border-b border-[var(--border-primary)]">
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">Task ID</th>
                  <th className="pb-2 pr-4">From</th>
                  <th className="pb-2 pr-4">To</th>
                  <th className="pb-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {[...escalationLog].reverse().map((event) => (
                  <tr key={event.id} className="border-b border-[var(--border-secondary)]">
                    <td className="py-2 pr-4 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--text-secondary)] font-mono truncate max-w-[120px]">
                      {event.taskId.slice(0, 8)}
                    </td>
                    <td className="py-2 pr-4 text-xs text-[var(--text-secondary)]">Tier {event.fromTier}</td>
                    <td className="py-2 pr-4 text-xs text-[var(--accent)]">Tier {event.toTier}</td>
                    <td className="py-2 text-xs text-[var(--text-secondary)] truncate max-w-[200px]">{event.failureReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Memory Configuration */}
      <MemoryConfigSection />

      {/* Gateway Configuration */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Gateway Connection</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Gateway Address</label>
            <input
              type="text"
              value={gwAddress}
              onChange={(e) => setGwAddress(e.target.value)}
              placeholder="localhost"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Port</label>
            <input
              type="number"
              value={gwPort}
              onChange={(e) => setGwPort(e.target.value)}
              placeholder="18789"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setGatewayAddress(gwAddress || 'localhost', Number(gwPort) || 18789)}
              className="px-4 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-150"
            >
              Update
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">Gateway Token</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={gwToken}
              onChange={(e) => { setGwToken(e.target.value); setTokenStatus('idle') }}
              placeholder="Enter gateway token"
              className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] font-mono transition-colors duration-150"
            />
            <button
              type="button"
              disabled={!gwToken || tokenStatus === 'validating'}
              onClick={async () => {
                setTokenStatus('validating')
                try {
                  const res = await fetch('/api/gateway/validate-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: gwToken, address: gwAddress || 'localhost', port: Number(gwPort) || 18789 }),
                  })
                  const data = await res.json()
                  setTokenStatus(data.valid ? 'valid' : 'invalid')
                  if (data.valid) {
                    const client = getGatewayClient()
                    if (client) client.setToken(gwToken)
                  }
                } catch {
                  setTokenStatus('invalid')
                }
              }}
              className="px-4 py-2 text-sm bg-[var(--accent-muted)] text-[var(--accent)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors duration-150 disabled:opacity-40"
            >
              {tokenStatus === 'validating' ? 'Validating…' : 'Validate'}
            </button>
          </div>
          {tokenStatus === 'valid' && <p className="text-xs text-[var(--color-success)] mt-1">Token validated and saved</p>}
          {tokenStatus === 'invalid' && <p className="text-xs text-[var(--color-error)] mt-1">Token validation failed</p>}
        </div>
      </div>

      {/* Gateway Status Panel */}
      <GatewayStatusPanel
        connectionInfo={{
          status: gatewayStatus,
          address: gatewayAddress,
          port: gatewayPort,
          connectedAt,
          lastHealthyAt,
          consecutiveFailures: 0,
        }}
        registeredAgents={registeredAgents}
        activeSessions={activeSessions}
        recentSessions={recentSessions}
        dailyTokenUsage={dailyTokenUsage}
        onReconnect={reconnect}
        onProvision={async () => {
          try {
            await fetch('/api/gateway/provision', { method: 'POST' })
          } catch {
            // Provision errors handled by the API
          }
        }}
      />

      {/* Scheduled Jobs Panel */}
      <ScheduledJobsPanel
        jobs={scheduledJobs}
        onCreateJob={async (job) => {
          try {
            const res = await fetch('/api/memory/jobs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(job),
            })
            if (res.ok) {
              const created = await res.json()
              setScheduledJobs([...scheduledJobs, created])
            }
          } catch { /* handled */ }
        }}
        onUpdateJob={(id, updates) => {
          setScheduledJobs(scheduledJobs.map((j) => j.id === id ? { ...j, ...updates } : j))
        }}
        onDeleteJob={(id) => {
          setScheduledJobs(scheduledJobs.filter((j) => j.id !== id))
        }}
        onTriggerJob={async (id) => {
          try {
            await fetch(`/api/memory/jobs?action=trigger&id=${id}`, { method: 'POST' })
          } catch { /* handled */ }
        }}
      />

      {/* Heartbeat Actions Panel */}
      <HeartbeatActionsPanel
        actions={heartbeatActions}
        onToggle={(name, enabled) => {
          const updated = heartbeatActions.map((a) =>
            a.name === name ? { ...a, enabled } : a,
          )
          setHeartbeatActions(updated)
        }}
        onSave={(action) => {
          const updated = heartbeatActions.map((a) =>
            a.name === action.name ? action : a,
          )
          setHeartbeatActions(updated)
          // Trigger HEARTBEAT.md regeneration
          fetch('/api/gateway/provision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ regenerateHeartbeat: true }),
          }).catch(() => {})
        }}
      />
    </div>
  )
}

// ─── Biometric Data Section ───

interface HealthMemoryItem {
  text: string
  tags: string[]
}

type ReadingType = 'heart_rate' | 'hrv' | 'spo2' | 'sleep' | 'activity'

function getDateRangeBounds(range: string): { start: Date; end: Date } {
  const end = new Date()
  const start = new Date()
  if (range === '7d') start.setDate(end.getDate() - 7)
  else if (range === '30d') start.setDate(end.getDate() - 30)
  else if (range === '90d') start.setDate(end.getDate() - 90)
  else if (range.includes(':')) {
    const [s, e] = range.split(':')
    return { start: new Date(s), end: new Date(e) }
  }
  return { start, end }
}

function BiometricDataSection() {
  const [dateRange, setDateRange] = useState('30d')
  const [items, setItems] = useState<HealthMemoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchKey, setFetchKey] = useState(0)

  const refreshData = useCallback(() => setFetchKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/memory/items?source_type=device_sync&tags=lifeforce')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: HealthMemoryItem[] }) => {
        if (!cancelled) setItems(data.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [fetchKey])

  // Parse memory items into typed arrays
  const { start, end } = getDateRangeBounds(dateRange)

  const heartRateData: Array<{ timestamp: string; bpm: number; type: string }> = []
  const hrvData: Array<{ timestamp: string; ms: number }> = []
  const spo2Data: Array<{ timestamp: string; percentage: number }> = []
  const sleepData: Array<{ startTime: string; stages: { deep: number; light: number; rem: number; awake: number } }> = []
  const activityData: Array<{ date: string; steps: number; calories: number; activeMinutes: number }> = []

  for (const item of items) {
    try {
      const data = JSON.parse(item.text)
      const readingType = item.tags.find((t): t is ReadingType =>
        ['heart_rate', 'hrv', 'spo2', 'sleep', 'activity'].includes(t),
      )
      if (!readingType) continue

      // Date filter
      const ts = data.timestamp ?? data.startTime ?? data.date
      if (ts) {
        const d = new Date(ts)
        if (d < start || d > end) continue
      }

      switch (readingType) {
        case 'heart_rate':
          heartRateData.push(data)
          break
        case 'hrv':
          hrvData.push(data)
          break
        case 'spo2':
          spo2Data.push(data)
          break
        case 'sleep':
          sleepData.push(data)
          break
        case 'activity':
          activityData.push(data)
          break
      }
    } catch {
      // skip unparseable items
    }
  }

  const hasData = heartRateData.length > 0 || hrvData.length > 0 || spo2Data.length > 0 || sleepData.length > 0 || activityData.length > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Biometric Data</h3>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <HealthCsvUpload onImportSuccess={refreshData} />

      {loading && (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Loading health data…</p>
      )}

      {!loading && !hasData && <HealthEmptyState />}

      {!loading && hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <HeartRateChart data={heartRateData} />
          <HrvChart data={hrvData} />
          <SpO2Chart data={spo2Data} />
          <SleepChart data={sleepData} />
          <ActivityChart data={activityData} />
        </div>
      )}
    </div>
  )
}

// ─── Main Dashboard Component ───

export default function Dashboard() {
  const [now, setNow] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)
  const store = useOctaviusStore()
  const profile = useOctaviusStore((s) => s.profile)
  const storageError = useOctaviusStore((s) => s.storageError)
  const clearStorageError = useOctaviusStore((s) => s.clearStorageError)
  const checkIns = useOctaviusStore((s) => s.health.checkIns)
  const tasks = useOctaviusStore((s) => s.career.tasks)
  const focusGoals = useOctaviusStore((s) => s.career.focusGoals)
  const connections = useOctaviusStore((s) => s.relationships.connections)
  const journalEntries = useOctaviusStore((s) => s.soul.journalEntries)

  // Gateway integration: init client and sync to store
  useGatewayInit()
  const chatMessages = useOctaviusStore((s) => s.chatMessages)
  const gatewayStatus = useOctaviusStore((s) => s.gatewayStatus)
  const addChatMessage = useOctaviusStore((s) => s.addChatMessage)
  const [chatLoading, setChatLoading] = useState(false)

  const handleSendMessage = useCallback(async (content: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    addChatMessage(userMsg)
    setChatLoading(true)
    try {
      // Route through the orchestrator as a conversational task
      const task: AgentTask = {
        id: `chat-${Date.now()}`,
        agentId: 'octavius-orchestrator',
        description: content,
        complexityScore: 3,
        tier: 1,
        modelUsed: store.routerConfig.localModelName,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
      const result = await executeTask(task, store.routerConfig, store.localModelStatus === 'connected')
      addChatMessage({
        id: `msg-${Date.now()}-resp`,
        role: 'assistant',
        content: result.result,
        agentId: 'octavius-orchestrator',
        timestamp: new Date().toISOString(),
      })
    } catch {
      addChatMessage({
        id: `msg-${Date.now()}-err`,
        role: 'system',
        content: 'Failed to get a response. Please try again.',
        timestamp: new Date().toISOString(),
      })
    } finally {
      setChatLoading(false)
    }
  }, [addChatMessage, store.routerConfig, store.localModelStatus])

  // Hydration-safe: only start clock on client
  useEffect(() => {
    setNow(new Date())
    setMounted(true)
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Use a safe fallback date for SSR — real date kicks in after mount
  const safeNow = now ?? new Date(0)
  const hour = safeNow.getHours()
  const greeting = mounted ? getGreeting(hour) : ''
  const dateStr = mounted ? formatDate(safeNow) : ''
  const timeStr = mounted ? formatTime(safeNow) : ''
  const todayStr = safeNow.toISOString().slice(0, 10)

  // Quadrant balance score
  const weekStart = new Date(safeNow)
  weekStart.setDate(safeNow.getDate() - safeNow.getDay())
  const weekStartStr = weekStart.toISOString().slice(0, 10)

  const balanceCounts = {
    health: checkIns.filter((c) => c.timestamp >= weekStartStr).length,
    career: tasks.filter((t) => t.createdAt >= weekStartStr).length,
    relationships: store.relationships.activityLog.filter((a) => a.date >= weekStartStr).length,
    soul: journalEntries.filter((j) => j.timestamp >= weekStartStr).length + store.soul.gratitudeEntries.filter((g) => g.date >= weekStartStr).length,
  }
  const balanceScore = computeBalanceScore(balanceCounts)

  const radarData = [
    { quadrant: 'Lifeforce', score: balanceScore.health },
    { quadrant: 'Industry', score: balanceScore.career },
    { quadrant: 'Fellowship', score: balanceScore.relationships },
    { quadrant: 'Essence', score: balanceScore.soul },
  ]

  // Weekly review prompt
  const showWeeklyReview = shouldShowWeeklyReviewPrompt(safeNow, { weeklyReviewDay: profile.weeklyReviewDay })

  // Compound loop phase
  const compoundPhase = getCompoundPhase(safeNow.getDay())

  // Quadrant card metrics
  const latest = latestCheckIn(store)
  const overdue = overdueConnections(store)
  const incompleteTasks = tasks.filter((t) => !t.completed).length
  const todayGoals = focusGoals.filter((g) => g.date === todayStr).length
  const weekJournals = journalEntries.filter((j) => j.timestamp >= weekStartStr).length

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      {/* Welcome Bar */}
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {greeting}{profile.name ? `, ${profile.name}` : ''}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">{dateStr}</p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <ThemeToggle />
            <div>
              <p className="text-lg font-mono text-[var(--text-primary)] opacity-80">{timeStr}</p>
              <p className="text-xs text-[var(--accent)]">{compoundPhase} phase</p>
            </div>
          </div>
        </div>
      </header>

      {/* Storage Error Warning Banner */}
      {storageError && (
        <div className="mb-6 flex items-center justify-between bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)] rounded-lg px-4 py-3">
          <p className="text-sm text-[var(--color-warning)]">
            Unable to save data to local storage. Your changes may not persist between sessions.
          </p>
          <button
            type="button"
            onClick={clearStorageError}
            className="text-[var(--color-warning)] opacity-70 hover:opacity-100 text-sm ml-4 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <Tabs.Root defaultValue="dashboard" className="space-y-6">
        {/* Tab Navigation */}
        <Tabs.List className="flex items-center gap-1 overflow-x-auto pb-2 border-b border-[var(--border-primary)]" aria-label="Dashboard navigation">
          {TAB_ITEMS.map((tab, i) => {
            const prev = i > 0 ? TAB_ITEMS[i - 1] : null
            const showSeparator = prev && prev.group !== tab.group
            return (
              <span key={tab.value} className="flex items-center">
                {showSeparator && (
                  <span className="mx-1.5 w-px h-5 bg-[var(--border-primary)]" aria-hidden="true" />
                )}
                <Tabs.Trigger
                  value={tab.value}
                  className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-t-lg transition-colors duration-150 whitespace-nowrap
                    data-[state=active]:text-[var(--text-primary)] data-[state=active]:bg-[var(--bg-secondary)] data-[state=active]:border-b-2 data-[state=active]:border-[var(--accent)]
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
                >
                  {tab.label}
                </Tabs.Trigger>
              </span>
            )
          })}
        </Tabs.List>

        {/* Dashboard Overview Tab */}
        <Tabs.Content value="dashboard" className="space-y-6 focus-visible:outline-none">
          {/* Welcome banner for first-time users */}
          {!profile.name && (
            <div className="bg-gradient-to-r from-[var(--accent-muted)] to-[color-mix(in_srgb,var(--quadrant-health)_10%,transparent)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150">
              <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Welcome to Octavius 🧠</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Your personal life operating system. Octavius helps you optimize four life quadrants — health, career, relationships, and soul — through AI agents and a smart memory system.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-[var(--color-success)]">1.</span>
                  <span className="text-[var(--text-secondary)]">Head to <strong>Settings</strong> and fill in your profile</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[var(--color-success)]">2.</span>
                  <span className="text-[var(--text-secondary)]">Check in on <strong>Lifeforce</strong> — how are you feeling?</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[var(--color-success)]">3.</span>
                  <span className="text-[var(--text-secondary)]">Create a task in <strong>Industry</strong> — what are you working on?</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[var(--color-success)]">4.</span>
                  <span className="text-[var(--text-secondary)]">Connect an OpenClaw gateway for AI agents (optional)</span>
                </div>
              </div>
            </div>
          )}
          {/* Quadrant Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <QuadrantCard
              quadrant="health"
              name="Lifeforce"
              icon="💚"
              color="#22c55e"
              metrics={[{ label: 'Latest mood', value: latest ? `${latest.mood}/5` : '—' }]}
              agentStatus="idle"
            />
            <QuadrantCard
              quadrant="career"
              name="Industry"
              icon="💼"
              color="#eab308"
              metrics={[
                { label: 'Open tasks', value: incompleteTasks },
                { label: 'Focus goals', value: todayGoals },
              ]}
              agentStatus="idle"
            />
            <QuadrantCard
              quadrant="relationships"
              name="Fellowship"
              icon="🤝"
              color="#3b82f6"
              metrics={[
                { label: 'Connections', value: connections.length },
                { label: 'Overdue', value: overdue.length },
              ]}
              agentStatus="idle"
            />
            <QuadrantCard
              quadrant="soul"
              name="Essence"
              icon="🧘"
              color="#a855f7"
              metrics={[{ label: 'Journal entries (week)', value: weekJournals }]}
              agentStatus="idle"
            />
          </div>

          {/* Balance Score Radar */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Quadrant Balance</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.1)" />
                  <PolarAngleAxis dataKey="quadrant" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                  <Radar dataKey="score" stroke="#7C3AED" fill="#7C3AED" fillOpacity={0.2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Weekly Review Prompt */}
          {showWeeklyReview && (
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 border-[var(--accent)] transition-colors duration-150">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Weekly Review</h3>
              <p className="text-sm text-[var(--text-secondary)]">Time to reflect on your week. What went well? What could improve?</p>
            </div>
          )}
        </Tabs.Content>

        {/* Lifeforce Tab */}
        <Tabs.Content value="health" className="space-y-6 focus-visible:outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <BiometricDataSection />
            </div>
            <div className="space-y-6">
              <WellnessCheckInForm />
              <HealthMetricsForm />
              <BreathingTool />
            </div>
          </div>
        </Tabs.Content>

        {/* Industry Tab */}
        <Tabs.Content value="career" className="space-y-6 focus-visible:outline-none">
          <KanbanBoard />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FocusGoalsSection />
            <DailySchedule />
          </div>
        </Tabs.Content>

        {/* Fellowship Tab */}
        <Tabs.Content value="relationships" className="space-y-6 focus-visible:outline-none">
          <RelationshipsTab />
        </Tabs.Content>

        {/* Essence Tab */}
        <Tabs.Content value="soul" className="space-y-6 focus-visible:outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <JournalSection />
            <div className="space-y-6">
              <GratitudePrompt />
              <MoodTrackerChart />
            </div>
          </div>
        </Tabs.Content>

        {/* Agents Tab */}
        <Tabs.Content value="agents" className="space-y-6 focus-visible:outline-none">
          <AgentsTab />
        </Tabs.Content>

        {/* Settings Tab */}
        <Tabs.Content value="settings" className="space-y-6 focus-visible:outline-none">
          <SettingsTab />
        </Tabs.Content>
      </Tabs.Root>

      {/* Chat Panel — persistent across all tabs */}
      <div className="mt-6">
        <ChatPanel
          messages={chatMessages}
          onSendMessage={handleSendMessage}
          isLoading={chatLoading}
          gatewayStatus={gatewayStatus}
        />
      </div>
    </div>
  )
}
