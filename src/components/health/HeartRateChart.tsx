'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

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

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150">
      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Heart Rate</h4>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
            <XAxis dataKey="timestamp" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} domain={['auto', 'auto']} unit=" bpm" />
            <Tooltip
              contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)' }}
            />
            <Legend />
            <Line type="monotone" dataKey="resting" stroke="var(--quadrant-health)" strokeWidth={2} dot={false} name="Resting" />
            <Line type="monotone" dataKey="active" stroke="var(--color-error)" strokeWidth={2} dot={false} name="Active" />
            <Line type="monotone" dataKey="average" stroke="var(--accent)" strokeWidth={2} dot={false} name="Average" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
