'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { CHART_THEME } from '@/lib/chart-theme'

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
            <CartesianGrid {...CHART_THEME.grid} />
            <XAxis
              dataKey="label"
              tick={CHART_THEME.axis.tick}
              axisLine={{ stroke: CHART_THEME.axis.stroke }}
            />
            <YAxis
              tick={CHART_THEME.axis.tick}
              axisLine={{ stroke: CHART_THEME.axis.stroke }}
              unit=" min"
            />
            <Tooltip {...CHART_THEME.tooltip} />
            <Legend />
            <Bar dataKey="deep" stackId="sleep" fill={CHART_THEME.colors.quadrant.soul} name="Deep" />
            <Bar dataKey="light" stackId="sleep" fill={CHART_THEME.colors.categorical[0]} name="Light" />
            <Bar dataKey="rem" stackId="sleep" fill={CHART_THEME.colors.accent} name="REM" />
            <Bar dataKey="awake" stackId="sleep" fill={CHART_THEME.colors.categorical[1]} name="Awake" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}