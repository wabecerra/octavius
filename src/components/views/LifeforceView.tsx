'use client'

import { useState, useCallback, useEffect } from 'react'
import { useCheckins } from '@/hooks'
import { useToast } from '@/components/Toast'
import { validateCheckInValue } from '@/lib/validation'
import { BreathingTool } from '@/components/BreathingTool'
import {
  HeartRateChart,
  HrvChart,
  SpO2Chart,
  SleepChart,
  ActivityChart,
  DateRangeFilter,
  HealthCsvUpload,
  HealthEmptyState,
} from '@/components/health'

// ─── Wellness Check-In Form ───

function WellnessCheckInForm() {
  const { createCheckin } = useCheckins()
  const { toast } = useToast()
  const [mood, setMood] = useState(3)
  const [energy, setEnergy] = useState(3)
  const [stress, setStress] = useState(3)
  const [errors, setErrors] = useState<string[]>([])

  const handleSubmit = async () => {
    const errs: string[] = []
    if (!validateCheckInValue(mood)) errs.push('Mood must be 1–5')
    if (!validateCheckInValue(energy)) errs.push('Energy must be 1–5')
    if (!validateCheckInValue(stress)) errs.push('Stress must be 1–5')

    if (errs.length > 0) {
      setErrors(errs)
      return
    }

    try {
      await createCheckin({ mood, energy, stress })
      setErrors([])
      toast({ title: 'Check-in saved', variant: 'success' })
    } catch {
      setErrors(['Failed to save check-in'])
    }
  }

  const sliders = [
    { label: 'Mood', value: mood, set: setMood, emoji: ['😞', '😐', '🙂', '😊', '😄'] },
    { label: 'Energy', value: energy, set: setEnergy, emoji: ['🪫', '🔋', '⚡', '💪', '🔥'] },
    { label: 'Stress', value: stress, set: setStress, emoji: ['😌', '🙂', '😐', '😰', '😫'] },
  ]

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-5 transition-colors duration-150 shadow-sm">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Daily Check-In</h3>
      <p className="text-sm text-[var(--text-secondary)]">How are you feeling today?</p>

      {errors.length > 0 && (
        <div className="bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-error)_30%,transparent)] rounded-lg p-3">
          {errors.map((e) => (
            <p key={e} className="text-sm text-[var(--color-error)]">{e}</p>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {sliders.map((s) => (
          <div key={s.label} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm text-[var(--text-secondary)]">{s.label}</label>
              <span className="text-lg">{s.emoji[s.value - 1]}</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={s.value}
              onChange={(e) => s.set(Number(e.target.value))}
              className="w-full accent-[var(--accent)] h-2 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]"
            />
            <div className="flex justify-between text-xs text-[var(--text-tertiary)]">
              <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        className="w-full py-2.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-sm font-medium"
      >
        Save Check-In
      </button>
    </div>
  )
}

// ─── Health Metrics Form ───

function HealthMetricsForm() {
  const [steps, setSteps] = useState('')
  const [sleep, setSleep] = useState('')
  const [heartRate, setHeartRate] = useState('')

  const handleSave = useCallback(() => {
    console.log('Health metrics:', { steps, sleep, heartRate })
  }, [steps, sleep, heartRate])

  const fields = [
    { label: 'Steps', value: steps, set: setSteps, icon: '🚶', placeholder: 'e.g. 8000', type: 'number' },
    { label: 'Sleep (hours)', value: sleep, set: setSleep, icon: '😴', placeholder: 'e.g. 7.5', type: 'number' },
    { label: 'Heart Rate (bpm)', value: heartRate, set: setHeartRate, icon: '❤️', placeholder: 'e.g. 72', type: 'number' },
  ]

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-5 transition-colors duration-150 shadow-sm">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Health Metrics</h3>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.label}>
            <label className="text-sm text-[var(--text-secondary)] flex items-center gap-2 mb-1">
              <span>{f.icon}</span> {f.label}
            </label>
            <input
              type={f.type}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              onBlur={handleSave}
              placeholder={f.placeholder}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm
                placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors duration-150"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Biometric Data Section ───

interface HealthMemoryItem {
  text: string
  tags: string[]
}

type ReadingType = 'heart_rate' | 'hrv' | 'spo2' | 'sleep' | 'activity'

function getDateRangeBounds(range: string): { start: Date; end: Date } {
  const end = new Date()
  const start = new Date()
  if (range === '7d') start.setDate(end.getDate() - 7)
  else if (range === '30d') start.setDate(end.getDate() - 30)
  else if (range === '90d') start.setDate(end.getDate() - 90)
  else if (range.includes(':')) {
    const [s, e] = range.split(':')
    return { start: new Date(s), end: new Date(e) }
  }
  return { start, end }
}

function BiometricDataSection() {
  const [dateRange, setDateRange] = useState('30d')
  const [items, setItems] = useState<HealthMemoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchKey, setFetchKey] = useState(0)

  const refreshData = useCallback(() => setFetchKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/memory/items?source_type=device_sync&tags=lifeforce')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: HealthMemoryItem[] }) => {
        if (!cancelled) setItems(data.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [fetchKey])

  const { start, end } = getDateRangeBounds(dateRange)

  const heartRateData: Array<{ timestamp: string; bpm: number; type: string }> = []
  const hrvData: Array<{ timestamp: string; ms: number }> = []
  const spo2Data: Array<{ timestamp: string; percentage: number }> = []
  const sleepData: Array<{ startTime: string; stages: { deep: number; light: number; rem: number; awake: number } }> = []
  const activityData: Array<{ date: string; steps: number; calories: number; activeMinutes: number }> = []

  for (const item of items) {
    try {
      const data = JSON.parse(item.text)
      const readingType = item.tags.find((t): t is ReadingType =>
        ['heart_rate', 'hrv', 'spo2', 'sleep', 'activity'].includes(t),
      )
      if (!readingType) continue

      const ts = data.timestamp ?? data.startTime ?? data.date
      if (ts) {
        const d = new Date(ts)
        if (d < start || d > end) continue
      }

      switch (readingType) {
        case 'heart_rate':
          heartRateData.push(data)
          break
        case 'hrv':
          hrvData.push(data)
          break
        case 'spo2':
          spo2Data.push(data)
          break
        case 'sleep':
          sleepData.push(data)
          break
        case 'activity':
          activityData.push(data)
          break
      }
    } catch {
      // skip unparseable items
    }
  }

  const hasData = heartRateData.length > 0 || hrvData.length > 0 || spo2Data.length > 0 || sleepData.length > 0 || activityData.length > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Biometric Data</h3>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <HealthCsvUpload onImportSuccess={refreshData} />

      {loading && (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Loading health data…</p>
      )}

      {!loading && !hasData && <HealthEmptyState />}

      {!loading && hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <HeartRateChart data={heartRateData} />
          <HrvChart data={hrvData} />
          <SpO2Chart data={spo2Data} />
          <SleepChart data={sleepData} />
          <ActivityChart data={activityData} />
        </div>
      )}
    </div>
  )
}

// ─── Main Lifeforce View ───

export function LifeforceView() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <BiometricDataSection />
      </div>
      <div className="space-y-6">
        <WellnessCheckInForm />
        <HealthMetricsForm />
        <BreathingTool />
      </div>
    </div>
  )
}
