'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export type Theme = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const STORAGE_KEY = 'octavius-theme'

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function resolveTheme(preference: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  return systemPrefersDark ? 'dark' : 'light'
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'system' || stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable
  }
  return 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme())
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    const pref = readStoredTheme()
    return resolveTheme(pref, typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true)
  })

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    try {
      localStorage.setItem(STORAGE_KEY, newTheme)
    } catch {
      // localStorage unavailable
    }
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const resolved = resolveTheme(newTheme, systemDark)
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }, [])

  // Sync on mount and listen for system preference changes
  useEffect(() => {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const resolved = resolveTheme(theme, systemDark)
    setResolvedTheme(resolved)
    applyTheme(resolved)

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        const next = e.matches ? 'dark' : 'light'
        setResolvedTheme(next)
        applyTheme(next)
      }
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}

export function cycleTheme(current: Theme): Theme {
  const order: Theme[] = ['system', 'light', 'dark']
  const idx = order.indexOf(current)
  return order[(idx + 1) % order.length]
}
