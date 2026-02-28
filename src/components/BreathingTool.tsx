'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type Duration = 1 | 3 | 5
type Phase = 'inhale' | 'hold' | 'exhale'

const PHASE_DURATION = 4000 // 4 seconds per phase
const PHASES: Phase[] = ['inhale', 'hold', 'exhale']

const phaseLabels: Record<Phase, string> = {
  inhale: 'Breathe in…',
  hold: 'Hold…',
  exhale: 'Breathe out…',
}

const phaseScale: Record<Phase, string> = {
  inhale: 'scale-110',
  hold: 'scale-110',
  exhale: 'scale-100',
}

export function BreathingTool() {
  const [duration, setDuration] = useState<Duration>(3)
  const [isRunning, setIsRunning] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [phase, setPhase] = useState<Phase>('inhale')
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef<number>(0)
  const animFrameRef = useRef<number>(0)

  const totalMs = duration * 60 * 1000
  const cycleMs = PHASE_DURATION * 3 // one full breath cycle

  const stop = useCallback(() => {
    setIsRunning(false)
    cancelAnimationFrame(animFrameRef.current)
  }, [])

  useEffect(() => {
    if (!isRunning) return

    startTimeRef.current = Date.now()

    const tick = () => {
      const now = Date.now()
      const el = now - startTimeRef.current
      setElapsed(el)

      if (el >= totalMs) {
        setIsRunning(false)
        setIsComplete(true)
        return
      }

      // Determine current phase within the cycle
      const posInCycle = el % cycleMs
      const phaseIndex = Math.floor(posInCycle / PHASE_DURATION)
      setPhase(PHASES[phaseIndex] ?? 'inhale')

      animFrameRef.current = requestAnimationFrame(tick)
    }

    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [isRunning, totalMs, cycleMs])

  const start = () => {
    setIsComplete(false)
    setElapsed(0)
    setPhase('inhale')
    setIsRunning(true)
  }

  const progressPct = Math.min((elapsed / totalMs) * 100, 100)

  if (isComplete) {
    return (
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 text-center space-y-4 transition-colors duration-150">
        <div className="text-4xl">🧘</div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Session complete</h3>
        <p className="text-[var(--text-secondary)] text-sm">
          Nice work — {duration} minute{duration > 1 ? 's' : ''} of mindful breathing.
        </p>
        <button
          type="button"
          onClick={() => setIsComplete(false)}
          className="px-4 py-2 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors duration-150 text-sm font-medium"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-5 transition-colors duration-150">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Breathing Exercise</h3>

      {/* Duration selector */}
      {!isRunning && (
        <div className="flex gap-2">
          {([1, 3, 5] as Duration[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDuration(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                duration === d
                  ? 'bg-[var(--accent)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {d} min
            </button>
          ))}
        </div>
      )}

      {/* Breathing circle */}
      {isRunning && (
        <div className="flex flex-col items-center gap-4">
          <div
            className={`w-28 h-28 rounded-full bg-[var(--accent-muted)] border-2 border-[var(--accent)] flex items-center justify-center transition-transform duration-[4000ms] ease-in-out ${phaseScale[phase]}`}
          >
            <span className="text-sm font-medium text-[var(--accent)]">
              {phaseLabels[phase]}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5">
            <div
              className="bg-[var(--accent)] h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            {Math.ceil((totalMs - elapsed) / 1000)}s remaining
          </p>
        </div>
      )}

      {/* Start / Stop */}
      <button
        type="button"
        onClick={isRunning ? stop : start}
        className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
          isRunning
            ? 'bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] text-[var(--color-error)] hover:bg-[color-mix(in_srgb,var(--color-error)_20%,transparent)]'
            : 'bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)]'
        }`}
      >
        {isRunning ? 'Stop' : 'Start'}
      </button>
    </div>
  )
}
