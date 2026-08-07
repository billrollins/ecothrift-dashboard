import { useEffect, useRef } from 'react'
import { fetchHoldConfirmationStatus } from '../api'

const POLL_MS = 5000
const MAX_MS = 10 * 60 * 1000

type Options = {
  token: string
  enabled: boolean
  expiresAt?: string | null
  onConfirmed: (heldUntil: string | null) => void
}

/**
 * Poll confirmation-status every 5s while the tab is visible and unconfirmed.
 * Stops on confirm, hold expiry, or after 10 minutes.
 */
export function useConfirmationPolling({
  token,
  enabled,
  expiresAt,
  onConfirmed,
}: Options) {
  const onConfirmedRef = useRef(onConfirmed)
  onConfirmedRef.current = onConfirmed

  useEffect(() => {
    if (!enabled || !token) return undefined

    const started = Date.now()
    let cancelled = false
    let timer: number | undefined

    const expired = () => {
      if (!expiresAt) return false
      const t = Date.parse(expiresAt)
      return Number.isFinite(t) && t <= Date.now()
    }

    const tick = async () => {
      if (cancelled) return
      if (document.visibilityState === 'hidden') return
      if (Date.now() - started >= MAX_MS) return
      if (expired()) return
      try {
        const status = await fetchHoldConfirmationStatus(token)
        if (cancelled) return
        if (status.confirmed) {
          onConfirmedRef.current(status.held_until)
          return
        }
      } catch {
        /* ignore transient errors; keep polling */
      }
      if (!cancelled && Date.now() - started < MAX_MS && !expired()) {
        timer = window.setTimeout(tick, POLL_MS)
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        if (timer) window.clearTimeout(timer)
        void tick()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    timer = window.setTimeout(tick, POLL_MS)

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [token, enabled, expiresAt])
}
