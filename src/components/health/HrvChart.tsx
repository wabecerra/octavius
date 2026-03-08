'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { CHART_THEME } from '@/lib/chart-theme'

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
            <CartesianGrid {...CHART_THEME.grid} />
            <XAxis
              dataKey="label"
              tick={CHART_THEME.axis.tick}
              axisLine={{ stroke: CHART_THEME.axis.stroke }}
            />
            <YAxis
              tick={CHART_THEME.axis.tick}
              axisLine={{ stroke: CHART_THEME.axis.stroke }}
              unit=" ms"
            />
            <Tooltip {...CHART_THEME.tooltip} />
            <Line type="monotone" dataKey="ms" stroke={CHART_THEME.colors.quadrant.health} strokeWidth={2} dot={false} name="HRV" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}