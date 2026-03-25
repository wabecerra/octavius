import { useState, useEffect, useCallback } from 'react'

export interface AuthUser {
  userId: string
  email: string
}

export interface AuthState {
  user: AuthUser | null
  loading: boolean
  logout: () => void
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const session = localStorage.getItem('octavius_session')
      const userData = localStorage.getItem('octavius_user')
      if (session && userData) {
        setUser(JSON.parse(userData))
      }
    } catch {
      // corrupted data — clear
      localStorage.removeItem('octavius_session')
      localStorage.removeItem('octavius_user')
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('octavius_session')
    localStorage.removeItem('octavius_user')
    setUser(null)
    window.location.href = '/login'
  }, [])

  return { user, loading, logout }
}
