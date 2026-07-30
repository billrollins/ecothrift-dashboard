import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type PublicUser = {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string | null
}

type AuthContextValue = {
  user: PublicUser | null
  accessToken: string | null
  isLoading: boolean
  requestMagicLink: (email: string) => Promise<{ detail: string }>
  consumeMagicLink: (token: string) => Promise<void>
  logout: () => Promise<void>
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
}

const AuthContext = createContext<AuthContextValue | null>(null)

let memoryAccess: string | null = null

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [accessToken, setAccessTokenState] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const setAccessToken = (token: string | null) => {
    memoryAccess = token
    setAccessTokenState(token)
  }

  const loadUser = useCallback(async () => {
    try {
      const refreshRes = await fetch('/api/auth/refresh/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!refreshRes.ok) {
        setUser(null)
        setAccessToken(null)
        return
      }
      const refreshData = await refreshRes.json()
      setAccessToken(refreshData.access)
      const meRes = await fetch('/api/auth/me/', {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${refreshData.access}`,
        },
      })
      if (!meRes.ok) {
        setUser(null)
        setAccessToken(null)
        return
      }
      setUser((await meRes.json()) as PublicUser)
    } catch {
      setUser(null)
      setAccessToken(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  const requestMagicLink = useCallback(async (email: string) => {
    const res = await fetch('/api/auth/magic-link/request/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.detail || 'Could not request sign-in link')
    return data as { detail: string }
  }, [])

  const consumeMagicLink = useCallback(async (token: string) => {
    const res = await fetch('/api/auth/magic-link/consume/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.detail || 'Sign-in link invalid or expired')
    if (data.access) setAccessToken(data.access)
    if (data.user) setUser(data.user as PublicUser)
    else await loadUser()
  }, [loadUser])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout/', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(memoryAccess ? { Authorization: `Bearer ${memoryAccess}` } : {}),
        },
        body: '{}',
      })
    } catch {
      /* ignore */
    }
    setAccessToken(null)
    setUser(null)
  }, [])

  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers || {})
    headers.set('Accept', 'application/json')
    if (memoryAccess) headers.set('Authorization', `Bearer ${memoryAccess}`)
    return fetch(url, { ...init, credentials: 'include', headers })
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        requestMagicLink,
        consumeMagicLink,
        logout,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
