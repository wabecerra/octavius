'use client'

import { useState } from 'react'
import { useFocusGoals, useSchedule } from '@/hooks'
import { TaskBoardSection } from '@/components/TaskBoardSection'

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
      <TaskBoardSection />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FocusGoalsSection />
        <DailySchedule />
      </div>
    </div>
  )
}
