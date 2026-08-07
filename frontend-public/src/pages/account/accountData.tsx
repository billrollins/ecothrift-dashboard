import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../../auth'
import type { HoldSummary, MyConversationRow } from '../../api'

const ACTIVE_STATUSES = new Set([
  'pending_verification',
  'requested',
  'confirmed',
  'ready_for_pickup',
])

const PAST_STATUSES = new Set(['completed', 'declined', 'cancelled', 'expired'])

/** Ended holds older than this are folded away; pickups are kept as receipts. */
const RECENT_DAYS = 90
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000

function isRecent(iso: string | null | undefined, now: number): boolean {
  if (!iso) return true
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return true
  return now - t <= RECENT_MS
}

/** Kept in the default history view: every pickup, plus recent ended holds. */
export function isCurrentHistory(h: HoldSummary, now: number = Date.now()): boolean {
  if (h.status === 'completed') return true
  return isRecent(h.created_at, now)
}

/** Kept in the default message list: anything unresolved, plus recent threads. */
export function isCurrentThread(c: MyConversationRow, now: number = Date.now()): boolean {
  if (c.state !== 'resolved') return true
  if ((c.customer_unread || 0) > 0) return true
  return isRecent(c.last_message_at, now)
}

function statusRank(h: HoldSummary): number {
  if (h.status === 'ready_for_pickup') return 0
  if (h.status === 'pending_verification') return 1
  if (h.status === 'requested' || h.status === 'confirmed') return 2
  return 3
}

function sortActive(a: HoldSummary, b: HoldSummary): number {
  const ra = statusRank(a)
  const rb = statusRank(b)
  if (ra !== rb) return ra - rb
  const ea = a.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY
  const eb = b.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY
  return ea - eb
}

type AccountDataValue = {
  holds: HoldSummary[]
  conversations: MyConversationRow[]
  activeHolds: HoldSummary[]
  pastHolds: HoldSummary[]
  /** Pickups plus ended holds from the last 90 days - what History shows by default. */
  currentPastHolds: HoldSummary[]
  /** Finished holds the customer hid from History. */
  archivedHolds: HoldSummary[]
  /** Unresolved or recent threads - what Messages shows by default. */
  currentConversations: MyConversationRow[]
  unreadTotal: number
  needsYouCount: number
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  archiveHold: (statusToken: string) => Promise<void>
  unarchiveHold: (statusToken: string) => Promise<void>
}

const AccountDataContext = createContext<AccountDataValue | null>(null)

export function AccountDataProvider({ children }: { children: ReactNode }) {
  const { user, authFetch } = useAuth()
  const [holds, setHolds] = useState<HoldSummary[]>([])
  const [conversations, setConversations] = useState<MyConversationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) return
    setError(null)
    try {
      const [hRes, cRes] = await Promise.all([
        authFetch('/api/webstore/my/holds/'),
        authFetch('/api/webstore/my/conversations/'),
      ])
      if (!hRes.ok) throw new Error('Could not load holds')
      if (!cRes.ok) throw new Error('Could not load messages')
      const [h, c] = await Promise.all([hRes.json(), cRes.json()])
      setHolds(Array.isArray(h) ? h : [])
      setConversations(Array.isArray(c) ? c : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [user, authFetch])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    void refresh()
  }, [user, refresh])

  useEffect(() => {
    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const archiveHold = useCallback(
    async (statusToken: string) => {
      const res = await authFetch(
        `/api/webstore/my/holds/${encodeURIComponent(statusToken)}/archive/`,
        { method: 'POST' },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error((data && data.detail) || 'Could not archive')
      }
      await refresh()
    },
    [authFetch, refresh],
  )

  const unarchiveHold = useCallback(
    async (statusToken: string) => {
      const res = await authFetch(
        `/api/webstore/my/holds/${encodeURIComponent(statusToken)}/unarchive/`,
        { method: 'POST' },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error((data && data.detail) || 'Could not restore')
      }
      await refresh()
    },
    [authFetch, refresh],
  )

  const activeHolds = useMemo(
    () => holds.filter((h) => ACTIVE_STATUSES.has(h.status)).slice().sort(sortActive),
    [holds],
  )
  const pastHolds = useMemo(
    () =>
      holds.filter(
        (h) => PAST_STATUSES.has(h.status) && !h.customer_archived_at,
      ),
    [holds],
  )
  const archivedHolds = useMemo(
    () =>
      holds.filter(
        (h) => PAST_STATUSES.has(h.status) && Boolean(h.customer_archived_at),
      ),
    [holds],
  )
  const currentPastHolds = useMemo(
    () => pastHolds.filter((h) => isCurrentHistory(h)),
    [pastHolds],
  )
  const currentConversations = useMemo(
    () => conversations.filter((c) => isCurrentThread(c)),
    [conversations],
  )
  const unreadTotal = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.customer_unread || 0), 0),
    [conversations],
  )
  const needsYouCount = useMemo(
    () =>
      activeHolds.filter(
        (h) =>
          h.status === 'pending_verification' ||
          h.status === 'ready_for_pickup' ||
          (h.thread?.customer_unread || 0) > 0,
      ).length,
    [activeHolds],
  )

  const value = useMemo(
    () => ({
      holds,
      conversations,
      activeHolds,
      pastHolds,
      currentPastHolds,
      archivedHolds,
      currentConversations,
      unreadTotal,
      needsYouCount,
      loading,
      error,
      refresh,
      archiveHold,
      unarchiveHold,
    }),
    [
      holds,
      conversations,
      activeHolds,
      pastHolds,
      currentPastHolds,
      archivedHolds,
      currentConversations,
      unreadTotal,
      needsYouCount,
      loading,
      error,
      refresh,
      archiveHold,
      unarchiveHold,
    ],
  )

  return (
    <AccountDataContext.Provider value={value}>{children}</AccountDataContext.Provider>
  )
}

export function useAccountData() {
  const ctx = useContext(AccountDataContext)
  if (!ctx) throw new Error('useAccountData must be used within AccountDataProvider')
  return ctx
}
