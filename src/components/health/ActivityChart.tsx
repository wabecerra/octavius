'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { CHART_THEME } from '@/lib/chart-theme'

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

  const tableId = 'activity-data-table'

  return (
    <div
      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150"
      role="img"
      aria-label={`Daily activity chart showing ${chartData.length} days of steps, calories, and active minutes`}
      aria-describedby={tableId}
    >
      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Daily Activity</h4>
      <div className="grid grid-cols-3 gap-4 mb-4">
        {chartData.length > 0 && (() => {
          const latest = chartData[chartData.length - 1]
          return (
            <>
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--quadrant-health)]" aria-label={`Steps: ${latest.steps.toLocaleString()}`}>{latest.steps.toLocaleString()}</p>
                <p className="text-xs text-[var(--text-tertiary)]">Steps</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--color-warning)]" aria-label={`Calories: ${latest.calories.toLocaleString()}`}>{latest.calories.toLocaleString()}</p>
                <p className="text-xs text-[var(--text-tertiary)]">Calories</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--accent)]" aria-label={`Active minutes: ${latest.activeMinutes}`}>{latest.activeMinutes}</p>
                <p className="text-xs text-[var(--text-tertiary)]">Active min</p>
              </div>
            </>
          )
        })()}
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid {...CHART_THEME.grid} />
            <XAxis
              dataKey="label"
              tick={CHART_THEME.axis.tick}
              axisLine={{ stroke: CHART_THEME.axis.stroke }}
            />
            <YAxis
              tick={CHART_THEME.axis.tick}
              axisLine={{ stroke: CHART_THEME.axis.stroke }}
            />
            <Tooltip {...CHART_THEME.tooltip} />
            <Bar dataKey="steps" fill={CHART_THEME.colors.quadrant.health} name="Steps" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table id={tableId} className="sr-only">
        <caption>Daily Activity Data</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Steps</th>
            <th>Calories</th>
            <th>Active Minutes</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.steps}</td>
              <td>{row.calories}</td>
              <td>{row.activeMinutes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
