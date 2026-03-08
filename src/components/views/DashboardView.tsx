'use client'

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts'
import { QuadrantCard } from '@/components/QuadrantCard'
import { KpiCard } from '@/components/ui/KpiCard'
import { CHART_THEME } from '@/lib/chart-theme'
import type { WellnessCheckIn, Connection } from '@/types'

interface DashboardViewProps {
  profileName: string
  checkins: WellnessCheckIn[]
  incompleteTasks: number
  todayGoals: number
  connections: Connection[]
  overdueConnections: Connection[]
  weekJournals: number
  radarData: { quadrant: string; score: number }[]
  showWeeklyReview: boolean
}

export function DashboardView({
  profileName,
  checkins,
  incompleteTasks,
  todayGoals,
  connections,
  overdueConnections,
  weekJournals,
  radarData,
  showWeeklyReview,
}: DashboardViewProps) {
  const latest = checkins.length > 0 ? checkins[0] : null

  return (
    <div className="space-y-6">
      {/* Welcome banner for first-time users */}
      {!profileName && (
        <div className="bg-gradient-to-r from-[var(--accent-muted)] to-[color-mix(in_srgb,var(--quadrant-lifeforce)_10%,transparent)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150 shadow-sm">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Welcome to Octavius 🧠</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Your personal life operating system. Octavius helps you optimize four life quadrants — health, career, relationships, and soul — through AI agents and a smart memory system.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-[var(--color-success)]">1.</span>
              <span className="text-[var(--text-secondary)]">Head to <strong>Settings</strong> and fill in your profile</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[var(--color-success)]">2.</span>
              <span className="text-[var(--text-secondary)]">Check in on <strong>Lifeforce</strong> — how are you feeling?</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[var(--color-success)]">3.</span>
              <span className="text-[var(--text-secondary)]">Create a task in <strong>Industry</strong> — what are you working on?</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[var(--color-success)]">4.</span>
              <span className="text-[var(--text-secondary)]">Connect an OpenClaw gateway for AI agents (optional)</span>
            </div>
          </div>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          title="Mood"
          value={latest ? `${latest.mood}/5` : '—'}
          icon="💚"
          status={checkins.length === 0 ? 'empty' : 'idle'}
          emptyMessage="No check-ins yet"
          sparklineData={checkins.slice(0, 14).map((c) => c.mood).reverse()}
          accentColor="var(--quadrant-health)"
        />
        <KpiCard
          title="Open Tasks"
          value={incompleteTasks}
          icon="💼"
          accentColor="var(--quadrant-career)"
        />
        <KpiCard
          title="Connections"
          value={connections.length}
          icon="🤝"
          trend={overdueConnections.length > 0 ? { direction: 'down', label: `${overdueConnections.length} overdue` } : undefined}
          accentColor="var(--quadrant-relationships)"
        />
        <KpiCard
          title="Journal (week)"
          value={weekJournals}
          icon="🧘"
          accentColor="var(--quadrant-soul)"
        />
      </div>

      {/* Quadrant Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="widget-contain">
          <QuadrantCard
            quadrant="health"
            name="Lifeforce"
            icon="💚"
            color="#34d399"
            metrics={[{ label: 'Latest mood', value: latest ? `${latest.mood}/5` : '—' }]}
            agentStatus="idle"
            sparklineData={checkins.slice(0, 14).map((c) => c.mood).reverse()}
          />
        </div>
        <div className="widget-contain">
          <QuadrantCard
            quadrant="career"
            name="Industry"
            icon="💼"
            color="#60a5fa"
            metrics={[
              { label: 'Open tasks', value: incompleteTasks },
              { label: 'Focus goals', value: todayGoals },
            ]}
            agentStatus="idle"
          />
        </div>
        <div className="widget-contain">
          <QuadrantCard
            quadrant="relationships"
            name="Fellowship"
            icon="🤝"
            color="#f87171"
            metrics={[
              { label: 'Connections', value: connections.length },
              { label: 'Overdue', value: overdueConnections.length },
            ]}
            agentStatus="idle"
          />
        </div>
        <div className="widget-contain">
          <QuadrantCard
            quadrant="soul"
            name="Essence"
            icon="🧘"
            color="#c084fc"
            metrics={[{ label: 'Journal entries (week)', value: weekJournals }]}
            agentStatus="idle"
          />
        </div>
      </div>

      {/* Balance Score Radar */}
      <div
        className="widget-contain bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 transition-colors duration-150 shadow-sm"
        role="img"
        aria-label={`Quadrant balance radar chart: ${radarData.map((d) => `${d.quadrant} ${d.score}%`).join(', ')}`}
        aria-describedby="radar-data-table"
      >
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Quadrant Balance</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke={CHART_THEME.grid.stroke} />
              <PolarAngleAxis dataKey="quadrant" tick={CHART_THEME.axis.tick} />
              <Radar dataKey="score" stroke={CHART_THEME.colors.accent} fill={CHART_THEME.colors.accent} fillOpacity={0.2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <table id="radar-data-table" className="sr-only">
          <caption>Quadrant Balance Scores</caption>
          <thead>
            <tr>
              <th>Quadrant</th>
              <th>Score (%)</th>
            </tr>
          </thead>
          <tbody>
            {radarData.map((d) => (
              <tr key={d.quadrant}>
                <td>{d.quadrant}</td>
                <td>{d.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Weekly Review Prompt */}
      {showWeeklyReview && (
        <div className="bg-[var(--bg-secondary)] border-2 border-[var(--accent)] rounded-xl p-6 transition-colors duration-150 shadow-sm">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Weekly Review</h3>
          <p className="text-sm text-[var(--text-secondary)]">Time to reflect on your week. What went well? What could improve?</p>
        </div>
      )}
    </div>
  )
}
