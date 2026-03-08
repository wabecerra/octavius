'use client'

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useCheckins, useJournal, useGratitude } from '@/hooks'
import { useToast } from '@/components/Toast'
import { CHART_THEME } from '@/lib/chart-theme'
import { toChartData } from '@/lib/chart-utils'

// ─── Journal ───

function JournalSection() {
  const { entries, addEntry } = useJournal()
  const { toast } = useToast()
  const [text, setText] = useState('')

  const handleBlur = async () => {
    if (!text.trim()) return
    try {
      await addEntry(text.trim())
      toast({ title: 'Journal entry saved', variant: 'success' })
      setText('')
    } catch (err) {
      console.error('Failed to save journal entry:', err)
      toast({ title: 'Failed to save entry', variant: 'error' })
    }
  }

  const recentEntries = [...entries]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5)

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
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

// ─── Gratitude Prompt ───

function GratitudePrompt() {
  const { addGratitude } = useGratitude()
  const { toast } = useToast()
  const [items, setItems] = useState(['', '', ''])

  const updateItem = (index: number, value: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? value : item)))
  }

  const handleSubmit = async () => {
    const filled = items.filter((item) => item.trim())
    if (filled.length === 0) return
    try {
      await addGratitude(filled.map((item) => item.trim()))
      setItems(['', '', ''])
      toast({ title: 'Gratitude saved', variant: 'success' })
    } catch (err) {
      console.error('Failed to save gratitude:', err)
      toast({ title: 'Failed to save gratitude', variant: 'error' })
    }
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
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
        Save Gratitude
      </button>
    </div>
  )
}

// ─── Mood Tracker Chart ───

function MoodTrackerChart() {
  const { checkins } = useCheckins()
  const chartData = toChartData(checkins)

  const formattedData = chartData.map((d) => ({
    ...d,
    label: new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4 transition-colors duration-150 shadow-sm">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Mood Tracker</h3>
      <p className="text-xs text-[var(--text-tertiary)]">Your mood over time from check-ins</p>

      {formattedData.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
          No check-in data yet. Complete a wellness check-in to see your mood trend.
        </p>
      ) : (
        <>
          <div className="h-48" role="img" aria-label="Line chart showing mood scores over time">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formattedData}>
                <CartesianGrid {...CHART_THEME.grid} />
                <XAxis
                  dataKey="label"
                  tick={CHART_THEME.axis.tick}
                  axisLine={{ stroke: CHART_THEME.axis.stroke }}
                />
                <YAxis
                  domain={[1, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  tick={CHART_THEME.axis.tick}
                  axisLine={{ stroke: CHART_THEME.axis.stroke }}
                />
                <Tooltip {...CHART_THEME.tooltip} />
                <Line
                  type="monotone"
                  dataKey="mood"
                  stroke={CHART_THEME.colors.accent}
                  strokeWidth={2}
                  dot={{ fill: CHART_THEME.colors.accent, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Mood scores over time</caption>
            <thead>
              <tr><th>Date</th><th>Mood</th></tr>
            </thead>
            <tbody>
              {formattedData.map((d, i) => (
                <tr key={i}><td>{d.label}</td><td>{d.mood}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

// ─── Main Essence View ───

export function EssenceView() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <JournalSection />
      <div className="space-y-6">
        <GratitudePrompt />
        <MoodTrackerChart />
      </div>
    </div>
  )
}
