import { useEffect, useState } from 'react'

/** localStorage-backed cooldown so a reload cannot reset a resend timer. */

const PREFIX = 'eco:hold-resend:'

export function remainingCooldownSeconds(key: string, _cooldownSeconds = 60): number {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return 0
    const until = Number(raw)
    if (!Number.isFinite(until)) return 0
    const left = Math.ceil((until - Date.now()) / 1000)
    return left > 0 ? left : 0
  } catch {
    return 0
  }
}

export function startCooldown(key: string, cooldownSeconds = 60): number {
  const until = Date.now() + cooldownSeconds * 1000
  try {
    localStorage.setItem(PREFIX + key, String(until))
  } catch {
    /* private mode */
  }
  return cooldownSeconds
}

export function useResendCooldown(key: string, cooldownSeconds = 60) {
  const [left, setLeft] = useState(() => remainingCooldownSeconds(key, cooldownSeconds))

  useEffect(() => {
    setLeft(remainingCooldownSeconds(key, cooldownSeconds))
    if (remainingCooldownSeconds(key, cooldownSeconds) <= 0) return undefined
    const id = window.setInterval(() => {
      const next = remainingCooldownSeconds(key, cooldownSeconds)
      setLeft(next)
      if (next <= 0) window.clearInterval(id)
    }, 500)
    return () => window.clearInterval(id)
  }, [key, cooldownSeconds])

  const arm = (seconds?: number) => {
    const secs = startCooldown(key, seconds ?? cooldownSeconds)
    setLeft(secs)
  }

  return { secondsLeft: left, arm, cooling: left > 0 }
}
