import { useEffect, useState } from 'react'

/** Relative hold deadline formatting - mirrors apps/webstore/services/hold_status.py */

export type HoldDeadline = {
  lead: string
  secondary: string
  kind: 'countdown' | 'day'
}

function padLocal(d: Date) {
  return {
    dayName: d.toLocaleDateString(undefined, { weekday: 'long' }),
    dayShort: d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
}

export function formatHoldDeadline(iso: string | null | undefined, now: Date = new Date()): HoldDeadline {
  if (!iso) {
    return { lead: 'Yours until store close', secondary: '', kind: 'day' }
  }
  const expires = new Date(iso)
  if (Number.isNaN(expires.getTime())) {
    return { lead: 'Yours until store close', secondary: '', kind: 'day' }
  }
  const remainingMs = expires.getTime() - now.getTime()
  if (remainingMs <= 0) {
    const { dayShort } = padLocal(expires)
    return { lead: 'Hold window ended', secondary: dayShort, kind: 'day' }
  }
  const twoHours = 2 * 60 * 60 * 1000
  if (remainingMs <= twoHours) {
    const minutes = Math.max(1, Math.floor(remainingMs / 60000))
    const { time } = padLocal(expires)
    return {
      lead: `${minutes} minute${minutes === 1 ? '' : 's'} left`,
      secondary: `until ${time}`,
      kind: 'countdown',
    }
  }
  const { dayName, dayShort, time } = padLocal(expires)
  const sameDay =
    expires.getFullYear() === now.getFullYear() &&
    expires.getMonth() === now.getMonth() &&
    expires.getDate() === now.getDate()
  return {
    lead: sameDay ? `Yours until ${time} today` : `Yours until ${dayName}`,
    secondary: `until ${time} · ${dayShort}`,
    kind: 'day',
  }
}

/** Tick while under the two-hour countdown window. */
export function useCountdown(iso: string | null | undefined): HoldDeadline {
  const [now, setNow] = useState(() => new Date())
  const kind = formatHoldDeadline(iso, now).kind

  useEffect(() => {
    if (!iso || kind !== 'countdown') return undefined
    const id = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(id)
  }, [iso, kind])

  return formatHoldDeadline(iso, now)
}
