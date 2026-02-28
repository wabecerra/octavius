'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface ActivityDataPoint {
  date: string
  steps: number
  calories: number
  activeMinutes: number
}

interface ActivityChartProps {
  data: ActivityDataPoint[]
}

function formatData(data: ActivityDataPoint[]) {
  return data.map((d) => ({
    label: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    steps: d.steps,
    calories: d.calories,
    activeMinutes: d.activeMinutes,
  }))
}

export function ActivityChart({ data }: ActivityChartProps) {
  const chartData = formatData(data)

  if (chartData.length === 0) return null

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150">
      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Daily Activity</h4>
      <div className="grid grid-cols-3 gap-4 mb-4">
        {chartData.length > 0 && (() => {
          const latest = chartData[chartData.length - 1]
          return (
            <>
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--quadrant-health)]">{latest.steps.toLocaleString()}</p>
                <p className="text-xs text-[var(--text-tertiary)]">Steps</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--color-warning)]">{latest.calories.toLocaleString()}</p>
                <p className="text-xs text-[var(--text-tertiary)]">Calories</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--accent)]">{latest.activeMinutes}</p>
                <p className="text-xs text-[var(--text-tertiary)]">Active min</p>
              </div>
            </>
          )
        })()}
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)' }}
            />
            <Bar dataKey="steps" fill="var(--quadrant-health)" name="Steps" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
