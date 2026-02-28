'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface SpO2DataPoint {
  timestamp: string
  percentage: number
}

interface SpO2ChartProps {
  data: SpO2DataPoint[]
}

function formatData(data: SpO2DataPoint[]) {
  return data.map((d) => ({
    label: new Date(d.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    percentage: d.percentage,
  }))
}

export function SpO2Chart({ data }: SpO2ChartProps) {
  const chartData = formatData(data)

  if (chartData.length === 0) return null

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150">
      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Blood Oxygen (SpO2)</h4>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} domain={[90, 100]} unit="%" />
            <Tooltip
              contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)' }}
            />
            <Line type="monotone" dataKey="percentage" stroke="var(--color-info)" strokeWidth={2} dot={false} name="SpO2" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
