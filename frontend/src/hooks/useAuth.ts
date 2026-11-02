import { useAuthStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export function useRequireAuth(role?: string) {
  const { isAuthenticated, user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login')
      return
    }
    if (role && user?.role !== role && user?.role !== 'super_admin') {
      router.push('/dashboard')
    }
  }, [isAuthenticated, user, role, router])

  return { user, isAuthenticated }
}

export function useAutoRefresh() {
  const { accessToken, refreshToken, setAuth, logout } = useAuthStore()

  useEffect(() => {
    if (!refreshToken) return

    const doRefresh = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!res.ok) {
          logout()
          return
        }
        const data = await res.json()
        const { useAuthStore: store } = await import('@/lib/store')
        const { user } = store.getState()
        if (user) {
          store.getState().setAuth(user, data.access_token, data.refresh_token)
        }
      } catch {
        // Network blip, will retry on next api call or timer
      }
    }

    if (!accessToken) {
      doRefresh()
      return
    }

    try {
      // Decode exp from JWT
      const parts = accessToken.split('.')
      if (parts.length < 2) return
      const payload = JSON.parse(atob(parts[1]))
      const expiresIn = payload.exp * 1000 - Date.now() - 60_000 // 1 min before expiry

      if (expiresIn <= 0) {
        // Token already expired or about to expire — refresh immediately!
        doRefresh()
        return
      }

      const timer = setTimeout(doRefresh, expiresIn)
      return () => clearTimeout(timer)
    } catch {
      doRefresh()
    }
  }, [accessToken, refreshToken, logout, setAuth])
}
