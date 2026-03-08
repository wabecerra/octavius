'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { CHART_THEME } from '@/lib/chart-theme'

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

  const tableId = 'spo2-data-table'

  return (
    <div
      className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150"
      role="img"
      aria-label={`Blood oxygen saturation chart showing ${chartData.length} data points`}
      aria-describedby={tableId}
    >
      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Blood Oxygen (SpO2)</h4>
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
              domain={[90, 100]}
              unit="%"
            />
            <Tooltip {...CHART_THEME.tooltip} />
            <Line type="monotone" dataKey="percentage" stroke={CHART_THEME.colors.categorical[4]} strokeWidth={2} dot={false} name="SpO2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table id={tableId} className="sr-only">
        <caption>Blood Oxygen (SpO2) Data</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>SpO2 (%)</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.percentage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
