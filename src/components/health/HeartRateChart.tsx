'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { CHART_THEME } from '@/lib/chart-theme'

interface HeartRateDataPoint {
  timestamp: string
  bpm: number
  type: string
}

interface HeartRateChartProps {
  data: HeartRateDataPoint[]
}

/** Pivot data by timestamp so each row has resting/active/average columns */
function pivotByTimestamp(data: HeartRateDataPoint[]) {
  const map = new Map<string, { timestamp: string; resting?: number; active?: number; average?: number }>()
  for (const d of data) {
    const label = new Date(d.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const existing = map.get(label) ?? { timestamp: label }
    if (d.type === 'resting') existing.resting = d.bpm
    else if (d.type === 'active') existing.active = d.bpm
    else if (d.type === 'average') existing.average = d.bpm
    map.set(label, existing)
  }
  return Array.from(map.values())
}

export function HeartRateChart({ data }: HeartRateChartProps) {
  const chartData = pivotByTimestamp(data)

  if (chartData.length === 0) return null

  const tableId = 'heart-rate-data-table'

  return (
    <div
      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150"
      role="img"
      aria-label={`Heart rate chart showing ${chartData.length} data points with resting, active, and average heart rate trends`}
      aria-describedby={tableId}
    >
      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Heart Rate</h4>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid {...CHART_THEME.grid} />
            <XAxis
              dataKey="timestamp"
              tick={CHART_THEME.axis.tick}
              axisLine={{ stroke: CHART_THEME.axis.stroke }}
            />
            <YAxis
              tick={CHART_THEME.axis.tick}
              axisLine={{ stroke: CHART_THEME.axis.stroke }}
              domain={['auto', 'auto']}
              unit=" bpm"
            />
            <Tooltip {...CHART_THEME.tooltip} />
            <Legend />
            <Line type="monotone" dataKey="resting" stroke={CHART_THEME.colors.quadrant.health} strokeWidth={2} dot={false} name="Resting" />
            <Line type="monotone" dataKey="active" stroke={CHART_THEME.colors.categorical[5]} strokeWidth={2} dot={false} name="Active" />
            <Line type="monotone" dataKey="average" stroke={CHART_THEME.colors.accent} strokeWidth={2} dot={false} name="Average" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Screen reader accessible data table */}
      <table id={tableId} className="sr-only">
        <caption>Heart Rate Data</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Resting (bpm)</th>
            <th>Active (bpm)</th>
            <th>Average (bpm)</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.timestamp}>
              <td>{row.timestamp}</td>
              <td>{row.resting ?? '—'}</td>
              <td>{row.active ?? '—'}</td>
              <td>{row.average ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
