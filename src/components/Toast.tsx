'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'

// ─── Types ───

type ToastVariant = 'default' | 'success' | 'error' | 'warning'

interface ToastItem {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  createdAt: number
}

interface ToastContextValue {
  toast: (opts: { title: string; description?: string; variant?: ToastVariant }) => void
}

// ─── Context ───

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

// ─── Variant styles ───

const VARIANT_STYLES: Record<ToastVariant, string> = {
  default:
    'bg-[var(--bg-elevated)] border-[var(--border-primary)] text-[var(--text-primary)]',
  success:
    'bg-[var(--bg-elevated)] border-[var(--color-success)] text-[var(--text-primary)]',
  error:
    'bg-[var(--bg-elevated)] border-[var(--color-error)] text-[var(--text-primary)]',
  warning:
    'bg-[var(--bg-elevated)] border-[var(--color-warning)] text-[var(--text-primary)]',
}

const VARIANT_ICONS: Record<ToastVariant, string> = {
  default: 'ℹ️',
  success: '✓',
  error: '✕',
  warning: '⚠',
}

const VARIANT_ICON_COLORS: Record<ToastVariant, string> = {
  default: 'text-[var(--color-info)]',
  success: 'text-[var(--color-success)]',
  error: 'text-[var(--color-error)]',
  warning: 'text-[var(--color-warning)]',
}

const MAX_VISIBLE = 3
const AUTO_DISMISS_MS = 4000

// ─── Provider ───

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback(
    (opts: { title: string; description?: string; variant?: ToastVariant }) => {
      const item: ToastItem = {
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: opts.title,
        description: opts.description,
        variant: opts.variant ?? 'default',
        createdAt: Date.now(),
      }
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), item])
    },
    [],
  )

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Auto-dismiss
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((t) => {
      const elapsed = Date.now() - t.createdAt
      const remaining = Math.max(AUTO_DISMISS_MS - elapsed, 0)
      return setTimeout(() => dismiss(t.id), remaining)
    })
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismiss])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container — fixed bottom-right */}
      {toasts.length > 0 && (
        <div
          className="fixed bottom-4 right-4 z-[60] flex flex-col-reverse gap-2 pointer-events-none"
          style={{ maxWidth: 360 }}
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg
                motion-safe:animate-[slideInRight_250ms_ease-out]
                ${VARIANT_STYLES[t.variant]}`}
            >
              <span
                className={`text-sm font-bold shrink-0 mt-0.5 ${VARIANT_ICON_COLORS[t.variant]}`}
                aria-hidden="true"
              >
                {VARIANT_ICONS[t.variant]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0 mt-0.5"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
