'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface HrvDataPoint {
  timestamp: string
  ms: number
}

interface HrvChartProps {
  data: HrvDataPoint[]
}

function formatData(data: HrvDataPoint[]) {
  return data.map((d) => ({
    label: new Date(d.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    ms: d.ms,
  }))
}

export function HrvChart({ data }: HrvChartProps) {
  const chartData = formatData(data)

  if (chartData.length === 0) return null

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150">
      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Heart Rate Variability</h4>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} unit=" ms" />
            <Tooltip
              contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)' }}
            />
            <Line type="monotone" dataKey="ms" stroke="var(--quadrant-health)" strokeWidth={2} dot={false} name="HRV" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
