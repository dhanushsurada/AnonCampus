import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
})

// Attach bearer token if available
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Refresh queue logic to handle concurrent requests when token expires
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: any) => void
  reject: (reason?: any) => void
}> = []

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

// Response interceptor with graceful refresh and no redirect loops
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config

    // If no response or not 401, reject immediately
    if (!error.response || error.response.status !== 401) {
      return Promise.reject(error)
    }

    // Do NOT intercept or refresh for auth endpoints (login, register, refresh)
    const isAuthRoute =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/refresh')

    if (isAuthRoute) {
      return Promise.reject(error)
    }

    if (typeof window === 'undefined') {
      return Promise.reject(error)
    }

    const refreshToken = localStorage.getItem('refresh_token')

    // If no refresh token or already retried, clear session and redirect
    if (!refreshToken || originalRequest._retry) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
        window.location.href = '/auth/login'
      }
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        })
        .catch((err) => Promise.reject(err))
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      const res = await axios.post(`${API_BASE}/api/auth/refresh`, {
        refresh_token: refreshToken,
      })

      const { access_token, refresh_token: newRefreshToken } = res.data
      localStorage.setItem('access_token', access_token)
      if (newRefreshToken) {
        localStorage.setItem('refresh_token', newRefreshToken)
      }

      // Update Zustand store if available
      try {
        const { useAuthStore } = await import('@/lib/store')
        const state = useAuthStore.getState()
        if (state.user) {
          state.setAuth(state.user, access_token, newRefreshToken || refreshToken)
        }
      } catch {}

      processQueue(null, access_token)
      originalRequest.headers.Authorization = `Bearer ${access_token}`
      return api(originalRequest)
    } catch (refreshErr) {
      processQueue(refreshErr, null)
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      if (!window.location.pathname.startsWith('/auth')) {
        window.location.href = '/auth/login'
      }
      return Promise.reject(refreshErr)
    } finally {
      isRefreshing = false
    }
  }
)

export const authApi = {
  register: (data: {
    email: string
    password: string
    student_id: string
    department: string
    academic_year: number
  }) => api.post('/auth/register', data),

  login: async (data: { email: string; password: string }) => {
    const res = await api.post('/auth/login', data)
    if (typeof window !== 'undefined' && res.data.access_token) {
      localStorage.setItem('access_token', res.data.access_token)
      localStorage.setItem('refresh_token', res.data.refresh_token)
    }
    return res
  },

  me: () => api.get('/auth/me'),

  updateProfile: (data: {
    department?: string
    academic_year?: number
    security_question?: string
    security_answer?: string
  }) => api.patch('/auth/profile', data),

  logout: async (refresh_token?: string) => {
    try {
      const token = refresh_token || (typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null)
      if (token) {
        await api.post('/auth/logout', { refresh_token: token })
      }
    } catch {
      // Ignore network errors on logout
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      }
    }
  },

  refresh: (refresh_token: string) =>
    api.post('/auth/refresh', { refresh_token }),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (data: { token: string; new_password: string }) =>
    api.post('/auth/reset-password', data),

  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post('/auth/change-password', data),

  getSecurityQuestion: (email: string, student_id: string) =>
    api.get('/auth/security-question', { params: { email, student_id } }),

  resetPasswordByStudentCredentials: (data: {
    email: string
    student_id: string
    department: string
    academic_year: number
    security_answer?: string
    new_password: string
  }) => api.post('/auth/reset-password-student-credentials', data),
}

export const issuesApi = {
  list: (params?: any) => api.get('/issues', { params }),
  listClusters: (params?: any) => api.get('/issues/clusters', { params }),
  myIssues: (params?: any) => api.get('/issues/me', { params }),
  get: (id: number) => api.get(`/issues/${id}`),
  create: (data: any) => api.post('/issues', data),
  support: (id: number) => api.post(`/issues/${id}/support`),
  addContext: (id: number, context_text: string) =>
    api.post(`/issues/${id}/context`, { context_text }),
  feedback: (id: number, data: any) =>
    api.post(`/issues/${id}/feedback`, data),
  getCluster: (id: number) => api.get(`/issues/clusters/${id}`),
}

export const adminApi = {
  listClusters: (params?: any) => api.get('/admin/issues', { params }),
  updateStatus: (cluster_id: number, new_status: string, reason?: string) =>
    api.post('/admin/update-status', { cluster_id, new_status, reason }),
  stats: () => api.get('/admin/stats'),
  auditLog: (params?: any) => api.get('/admin/audit-log', { params }),
  clusterDetail: (id: number) => api.get(`/admin/clusters/${id}`),
}
