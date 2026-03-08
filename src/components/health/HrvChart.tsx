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

  const tableId = 'hrv-data-table'

  return (
    <div
      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150"
      role="img"
      aria-label={`Heart rate variability chart showing ${chartData.length} data points`}
      aria-describedby={tableId}
    >
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

      <table id={tableId} className="sr-only">
        <caption>Heart Rate Variability Data</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>HRV (ms)</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.ms}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
