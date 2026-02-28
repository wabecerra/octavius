'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface SleepDataPoint {
  startTime: string
  stages: { deep: number; light: number; rem: number; awake: number }
}

interface SleepChartProps {
  data: SleepDataPoint[]
}

function formatData(data: SleepDataPoint[]) {
  return data.map((d) => ({
    label: new Date(d.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    deep: d.stages.deep,
    light: d.stages.light,
    rem: d.stages.rem,
    awake: d.stages.awake,
  }))
}

export function SleepChart({ data }: SleepChartProps) {
  const chartData = formatData(data)

  if (chartData.length === 0) return null

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150">
      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Sleep Stages</h4>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} unit=" min" />
            <Tooltip
              contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)' }}
            />
            <Legend />
            <Bar dataKey="deep" stackId="sleep" fill="var(--quadrant-soul)" name="Deep" />
            <Bar dataKey="light" stackId="sleep" fill="var(--color-info)" name="Light" />
            <Bar dataKey="rem" stackId="sleep" fill="var(--accent)" name="REM" />
            <Bar dataKey="awake" stackId="sleep" fill="var(--color-warning)" name="Awake" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
