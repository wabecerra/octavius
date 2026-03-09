'use client'

import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '@/hooks'

// ─── Types ───

type KanbanColumn = 'backlog' | 'in-progress' | 'done'

const COLUMNS: { key: KanbanColumn; label: string; color: string }[] = [
  { key: 'backlog', label: 'Backlog', color: 'border-[var(--text-tertiary)]' },
  { key: 'in-progress', label: 'In Progress', color: 'border-[var(--color-warning)]' },
  { key: 'done', label: 'Done', color: 'border-[var(--color-success)]' },
]

const PRIORITY_COLORS: Record<Task['priority'], string> = {
  high: 'bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] text-[var(--color-error)] border-[color-mix(in_srgb,var(--color-error)_30%,transparent)]',
  medium: 'bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)]',
  low: 'bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_30%,transparent)]',
}

const QUADRANT_META: Record<string, { label: string; color: string; bg: string }> = {
  lifeforce:  { label: 'Lifeforce',  color: '#34d399', bg: 'rgba(52,211,153,0.10)' },
  industry:   { label: 'Industry',   color: '#60a5fa', bg: 'rgba(96,165,250,0.10)' },
  fellowship: { label: 'Fellowship', color: '#f87171', bg: 'rgba(248,113,113,0.10)' },
  essence:    { label: 'Essence',    color: '#c084fc', bg: 'rgba(192,132,252,0.10)' },
}

// ─── Sortable Task Card ───

interface SortableTaskCardProps {
  task: Task
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}

function SortableTaskCard({ task, onEdit, onDelete }: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg p-3 hover:bg-[var(--bg-hover)] transition-colors duration-150 group"
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          type="button"
          className="mt-0.5 cursor-grab active:cursor-grabbing text-[var(--text-disabled)] hover:text-[var(--text-secondary)] shrink-0 touch-none"
          aria-label={`Drag ${task.title}`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm text-[var(--text-primary)] ${task.completed ? 'line-through opacity-60' : ''}`}>
              {task.title}
            </p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${PRIORITY_COLORS[task.priority]}`}>
              {task.priority}
            </span>
          </div>
          {/* Quadrant + Project tags */}
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {task.quadrant && QUADRANT_META[task.quadrant] && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-tight"
                style={{
                  color: QUADRANT_META[task.quadrant].color,
                  backgroundColor: QUADRANT_META[task.quadrant].bg,
                  border: `1px solid ${QUADRANT_META[task.quadrant].color}33`,
                }}
              >
                {QUADRANT_META[task.quadrant].label}
              </span>
            )}
            {task.project && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-tight bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)]">
                {task.project}
              </span>
            )}
          </div>
          {task.dueDate && (
            <p className="text-xs text-[var(--text-tertiary)] mt-1">{task.dueDate}</p>
          )}
          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150"
            >
              Edit
            </button>
            <span className="text-[var(--text-disabled)]">·</span>
            <button
              type="button"
              onClick={() => onDelete(task)}
              className="text-xs text-[var(--color-error)] opacity-70 hover:opacity-100 transition-colors duration-150"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Overlay card (shown while dragging) ───

function TaskCardOverlay({ task }: { task: Task }) {
  return (
    <div className="bg-[var(--bg-secondary)] border-2 border-[var(--accent)] rounded-lg p-3 shadow-xl opacity-90">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-[var(--text-primary)]">{task.title}</p>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${PRIORITY_COLORS[task.priority]}`}>
          {task.priority}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {task.quadrant && QUADRANT_META[task.quadrant] && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-tight"
            style={{
              color: QUADRANT_META[task.quadrant].color,
              backgroundColor: QUADRANT_META[task.quadrant].bg,
              border: `1px solid ${QUADRANT_META[task.quadrant].color}33`,
            }}
          >
            {QUADRANT_META[task.quadrant].label}
          </span>
        )}
        {task.project && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-tight bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)]">
            {task.project}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Kanban Board ───

interface KanbanBoardProps {
  tasks: Task[]
  onMoveTask: (taskId: string, newStatus: KanbanColumn) => Promise<void>
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}

export function KanbanBoard({ tasks, onMoveTask, onEdit, onDelete }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const getColumnTasks = (col: KanbanColumn) =>
    tasks.filter((t) => t.status === col)

  const findColumnForTask = (taskId: string): KanbanColumn | null => {
    const task = tasks.find((t) => t.id === taskId)
    return task ? (task.status as KanbanColumn) : null
  }

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id)
    setActiveTask(task ?? null)
  }

  const handleDragOver = (_event: DragOverEvent) => {
    // Could add real-time column highlighting here
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null)
    const { active, over } = event
    if (!over) return

    const taskId = active.id as string
    const overId = over.id as string

    // Check if dropped over a column container
    const columnKeys = COLUMNS.map((c) => c.key)
    let targetColumn: KanbanColumn | null = null

    if (columnKeys.includes(overId as KanbanColumn)) {
      targetColumn = overId as KanbanColumn
    } else {
      // Dropped on another task — find which column that task is in
      targetColumn = findColumnForTask(overId)
    }

    if (targetColumn) {
      const currentColumn = findColumnForTask(taskId)
      if (currentColumn !== targetColumn) {
        onMoveTask(taskId, targetColumn)
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const colTasks = getColumnTasks(col.key)
          const taskIds = colTasks.map((t) => t.id)

          return (
            <SortableContext
              key={col.key}
              id={col.key}
              items={taskIds}
              strategy={verticalListSortingStrategy}
            >
              <div
                id={col.key}
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
                    <SortableTaskCard
                      key={task.id}
                      task={task}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              </div>
            </SortableContext>
          )
        })}
      </div>

      <DragOverlay>
        {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
