'use client'

import { useState, useCallback } from 'react'
import { apiCall } from '@/hooks/use-api'

const QUADRANT_OPTIONS = [
  { key: 'lifeforce', label: 'Lifeforce', desc: 'Health, fitness, wellness, biometrics', color: '#34d399', bg: 'rgba(52,211,153,0.10)' },
  { key: 'industry', label: 'Industry', desc: 'Career, tasks, sprints, projects', color: '#60a5fa', bg: 'rgba(96,165,250,0.10)' },
  { key: 'fellowship', label: 'Fellowship', desc: 'Relationships, connections, community', color: '#f87171', bg: 'rgba(248,113,113,0.10)' },
  { key: 'essence', label: 'Essence', desc: 'Journaling, gratitude, mindfulness, growth', color: '#c084fc', bg: 'rgba(192,132,252,0.10)' },
] as const

interface OnboardingWizardProps {
  onComplete: () => void
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [focusQuadrants, setFocusQuadrants] = useState<string[]>([])
  const [firstTaskTitle, setFirstTaskTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleQuadrant = (key: string) => {
    setFocusQuadrants(prev =>
      prev.includes(key) ? prev.filter(q => q !== key) : [...prev, key]
    )
  }

  const handleFinish = useCallback(async () => {
    setSaving(true)
    try {
      // Save profile
      await apiCall('/api/dashboard/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          focusQuadrants: focusQuadrants.join(','),
          onboardingComplete: 'true',
        }),
      })

      // Create first task if provided
      if (firstTaskTitle.trim()) {
        await apiCall('/api/dashboard/tasks', {
          method: 'POST',
          body: JSON.stringify({
            title: firstTaskTitle.trim(),
            priority: 'medium',
            status: 'backlog',
            quadrant: focusQuadrants[0] || 'industry',
          }),
        })
      }

      onComplete()
    } catch (err) {
      console.error('Onboarding save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [name, focusQuadrants, firstTaskTitle, onComplete])

  const steps = [
    // Step 0: Welcome
    <div key="welcome" className="text-center space-y-6">
      <div className="text-5xl">⚡</div>
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">Welcome to Octavius</h2>
      <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
        Your Life Operating System. Let&apos;s set up your dashboard in under a minute.
      </p>
      <button
        type="button"
        onClick={() => setStep(1)}
        className="px-6 py-2.5 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors text-sm font-medium"
      >
        Let&apos;s Go
      </button>
    </div>,

    // Step 1: Name
    <div key="name" className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">What should we call you?</h2>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">This appears in your dashboard greeting.</p>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        autoFocus
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-4 py-3 text-[var(--text-primary)] text-base placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setStep(0)}
          className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => setStep(2)}
          disabled={!name.trim()}
          className="px-6 py-2 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors text-sm font-medium disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>,

    // Step 2: Quadrant focus
    <div key="quadrants" className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">What are you focusing on?</h2>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">Pick one or more quadrants. You can change this anytime.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {QUADRANT_OPTIONS.map(q => {
          const selected = focusQuadrants.includes(q.key)
          return (
            <button
              key={q.key}
              type="button"
              onClick={() => toggleQuadrant(q.key)}
              className="p-4 rounded-xl border-2 text-left transition-all duration-150"
              style={{
                borderColor: selected ? q.color : 'var(--border-primary)',
                backgroundColor: selected ? q.bg : 'var(--bg-secondary)',
              }}
            >
              <span className="text-sm font-medium" style={{ color: q.color }}>{q.label}</span>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">{q.desc}</p>
            </button>
          )
        })}
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setStep(1)}
          className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => setStep(3)}
          disabled={focusQuadrants.length === 0}
          className="px-6 py-2 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors text-sm font-medium disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>,

    // Step 3: First task
    <div key="task" className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Create your first task</h2>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">What&apos;s one thing you want to get done? (optional)</p>
      </div>
      <input
        type="text"
        value={firstTaskTitle}
        onChange={(e) => setFirstTaskTitle(e.target.value)}
        placeholder="e.g., Set up weekly workout plan"
        autoFocus
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg px-4 py-3 text-[var(--text-primary)] text-base placeholder:text-[var(--text-disabled)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus)] transition-colors"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setStep(2)}
          className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleFinish}
          disabled={saving}
          className="px-6 py-2 rounded-lg bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors text-sm font-medium disabled:opacity-40"
        >
          {saving ? 'Setting up...' : firstTaskTitle.trim() ? 'Create & Start' : 'Skip & Start'}
        </button>
      </div>
    </div>,
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="w-full max-w-lg p-8">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full transition-colors duration-200"
              style={{
                backgroundColor: i <= step ? 'var(--accent)' : 'var(--border-primary)',
              }}
            />
          ))}
        </div>
        {steps[step]}
      </div>
    </div>
  )
}
