'use client'

export function HealthEmptyState() {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-8 text-center transition-colors duration-150">
      <div className="text-4xl mb-4">📊</div>
      <h4 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No biometric data yet</h4>
      <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mb-4">
        Import your health data to see trends for heart rate, HRV, SpO2, sleep, and activity.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center text-sm text-[var(--text-tertiary)]">
        <div className="flex items-center gap-2">
          <span className="text-base">📁</span>
          <span>Upload a RingConn CSV export above</span>
        </div>
        <span className="hidden sm:inline">·</span>
        <div className="flex items-center gap-2">
          <span className="text-base">🔄</span>
          <span>Configure ROOK or Apple Health webhooks for auto-sync</span>
        </div>
      </div>
    </div>
  )
}
