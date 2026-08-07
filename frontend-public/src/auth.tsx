import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type PublicUser = {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string | null
  has_password?: boolean
  email_verified?: boolean
}

export type ConsumeResult = {
  redirect_to: string
  purpose: string
  needs_password_prompt: boolean
  user: PublicUser | null
  code?: string
}

type LookupResult = {
  has_account: boolean
  has_password: boolean
}

type AuthContextValue = {
  user: PublicUser | null
  accessToken: string | null
  isLoading: boolean
  hasPassword: boolean
  emailVerified: boolean
  requestMagicLink: (email: string) => Promise<{ detail: string }>
  consumeToken: (token: string) => Promise<ConsumeResult>
  /** @deprecated use consumeToken */
  consumeMagicLink: (token: string) => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<PublicUser>
  lookupEmail: (email: string) => Promise<LookupResult>
  register: (input: {
    email: string
    first_name: string
    password?: string
  }) => Promise<{ detail: string }>
  setPassword: (input: {
    password: string
    old_password?: string
  }) => Promise<PublicUser>
  requestReset: (email: string) => Promise<{ detail: string }>
  resendVerification: () => Promise<{ detail: string }>
  logout: () => Promise<void>
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SESSION_HINT_KEY = 'ecothrift.public_session.v1'
const PASSWORD_PROMPT_KEY = 'ecothrift.public_password_prompt.v1'

let memoryAccess: string | null = null

export function getAccessToken(): string | null {
  return memoryAccess
}

export function peekPasswordPrompt(): boolean {
  try {
    return sessionStorage.getItem(PASSWORD_PROMPT_KEY) === '1'
  } catch {
    return false
  }
}

export function clearPasswordPrompt() {
  try {
    sessionStorage.removeItem(PASSWORD_PROMPT_KEY)
  } catch {
    /* ignore */
  }
}

function markPasswordPrompt() {
  try {
    sessionStorage.setItem(PASSWORD_PROMPT_KEY, '1')
  } catch {
    /* ignore */
  }
}

function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1'
  } catch {
    return false
  }
}

function setSessionHint(on: boolean) {
  try {
    if (on) localStorage.setItem(SESSION_HINT_KEY, '1')
    else localStorage.removeItem(SESSION_HINT_KEY)
  } catch {
    /* ignore quota / private mode */
  }
}

async function readJson(res: Response) {
  return res.json().catch(() => ({} as Record<string, unknown>))
}

function detailMessage(data: Record<string, unknown>, fallback: string) {
  const d = data.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d.length) return String(d[0])
  return fallback
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [accessToken, setAccessTokenState] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Read by consumeToken, which must keep a stable identity so the pages that
  // call it from an effect do not re-run that effect when `user` changes.
  const userRef = useRef<PublicUser | null>(null)

  useEffect(() => {
    userRef.current = user
  }, [user])

  const setAccessToken = (token: string | null) => {
    memoryAccess = token
    setAccessTokenState(token)
  }

  const clearSession = useCallback(() => {
    setUser(null)
    setAccessToken(null)
    setSessionHint(false)
  }, [])

  const loadUser = useCallback(async () => {
    try {
      const refreshRes = await fetch('/api/auth/refresh/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!refreshRes.ok) {
        clearSession()
        return
      }
      const refreshData = await refreshRes.json()
      setAccessToken(refreshData.access)
      setSessionHint(true)
      const meRes = await fetch('/api/auth/me/', {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${refreshData.access}`,
        },
      })
      if (!meRes.ok) {
        clearSession()
        return
      }
      setUser((await meRes.json()) as PublicUser)
    } catch {
      clearSession()
    } finally {
      setIsLoading(false)
    }
  }, [clearSession])

  useEffect(() => {
    if (!hasSessionHint()) {
      setIsLoading(false)
      return
    }
    loadUser()
  }, [loadUser])

  const requestMagicLink = useCallback(async (email: string) => {
    const res = await fetch('/api/auth/magic-link/request/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await readJson(res)
    if (!res.ok) throw new Error(detailMessage(data, 'Could not request sign-in link'))
    return data as { detail: string }
  }, [])

  // A magic-link token is single-use, so a token may only ever be POSTed once
  // per page load. Callers repeat: StrictMode invokes effects twice in dev, and
  // a successful consume sets `user`, which re-renders the page that started it.
  // Every repeat after the first would come back "invalid or expired", so hand
  // back the original promise instead of spending the token again.
  const consumeInFlight = useRef(new Map<string, Promise<ConsumeResult>>())

  const consumeToken = useCallback((token: string): Promise<ConsumeResult> => {
    const started = consumeInFlight.current.get(token)
    if (started) return started

    const pending = (async (): Promise<ConsumeResult> => {
      const res = await fetch('/api/auth/magic-link/consume/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await readJson(res)
      if (!res.ok) throw new Error(detailMessage(data, 'Sign-in link invalid or expired'))
      const code = (data.code as string) || ''
      // Soft hold-verify outcomes forward without issuing a session.
      if (!data.access) {
        return {
          redirect_to: (data.redirect_to as string) || '/account',
          purpose: (data.purpose as string) || 'sign_in',
          needs_password_prompt: false,
          user: userRef.current,
          code,
        }
      }
      setSessionHint(true)
      setAccessToken(data.access as string)
      const nextUser = (data.user as PublicUser) || null
      if (nextUser) setUser(nextUser)
      else await loadUser()
      if (data.needs_password_prompt) markPasswordPrompt()
      return {
        redirect_to: (data.redirect_to as string) || '/account',
        purpose: (data.purpose as string) || 'sign_in',
        needs_password_prompt: Boolean(data.needs_password_prompt),
        user: nextUser || userRef.current,
        code,
      }
    })()

    consumeInFlight.current.set(token, pending)
    // A rejected token can be retried (network blips); a spent one cannot.
    pending.catch(() => consumeInFlight.current.delete(token))
    return pending
  }, [loadUser])

  const consumeMagicLink = useCallback(async (token: string) => {
    await consumeToken(token)
  }, [consumeToken])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await readJson(res)
    if (!res.ok) throw new Error(detailMessage(data, 'Invalid email or password'))
    setSessionHint(true)
    if (data.access) setAccessToken(data.access as string)
    const nextUser = data.user as PublicUser
    setUser(nextUser)
    return nextUser
  }, [])

  const lookupEmail = useCallback(async (email: string): Promise<LookupResult> => {
    const res = await fetch('/api/auth/customer/lookup/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await readJson(res)
    if (!res.ok) throw new Error(detailMessage(data, 'Could not look up email'))
    return {
      has_account: Boolean(data.has_account),
      has_password: Boolean(data.has_password),
    }
  }, [])

  const register = useCallback(async (input: {
    email: string
    first_name: string
    password?: string
  }) => {
    const res = await fetch('/api/auth/customer/register/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    })
    const data = await readJson(res)
    if (!res.ok) throw new Error(detailMessage(data, 'Could not create account'))
    return data as { detail: string }
  }, [])

  const setPassword = useCallback(async (input: {
    password: string
    old_password?: string
  }) => {
    const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    })
    if (memoryAccess) headers.set('Authorization', `Bearer ${memoryAccess}`)
    const res = await fetch('/api/auth/customer/set-password/', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(input),
    })
    const data = await readJson(res)
    if (!res.ok) throw new Error(detailMessage(data, 'Could not save password'))
    const nextUser = data.user as PublicUser
    setUser(nextUser)
    clearPasswordPrompt()
    return nextUser
  }, [])

  const requestReset = useCallback(async (email: string) => {
    const res = await fetch('/api/auth/customer/reset-password/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await readJson(res)
    if (!res.ok) throw new Error(detailMessage(data, 'Could not request reset'))
    return data as { detail: string }
  }, [])

  const resendVerification = useCallback(async () => {
    const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    })
    if (memoryAccess) headers.set('Authorization', `Bearer ${memoryAccess}`)
    const res = await fetch('/api/auth/customer/resend-verification/', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: '{}',
    })
    const data = await readJson(res)
    if (!res.ok) throw new Error(detailMessage(data, 'Could not resend confirmation'))
    return data as { detail: string }
  }, [])

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
    clearSession()
  }, [clearSession])

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
        hasPassword: Boolean(user?.has_password),
        emailVerified: Boolean(user?.email_verified),
        requestMagicLink,
        consumeToken,
        consumeMagicLink,
        signInWithPassword,
        lookupEmail,
        register,
        setPassword,
        requestReset,
        resendVerification,
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
