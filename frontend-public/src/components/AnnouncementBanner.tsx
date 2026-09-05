import { useMemo, useState } from 'react'
import { useAnnouncements } from '../announcements'
import type { PublicAnnouncement } from '../api'

function dismissKey(row: PublicAnnouncement) {
  return `ann-dismiss:${row.id}:${row.updated_at || ''}`
}

export default function AnnouncementBanner() {
  const rows = useAnnouncements('banner')
  const [tick, setTick] = useState(0)
  const current = useMemo(() => {
    void tick
    return rows.find((row) => {
      if (!row.dismissible) return true
      try {
        return localStorage.getItem(dismissKey(row)) !== '1'
      } catch {
        return true
      }
    })
  }, [rows, tick])

  if (!current) return null
  const shown = current

  function dismiss() {
    try {
      localStorage.setItem(dismissKey(shown), '1')
    } catch {
      /* ignore */
    }
    setTick((n) => n + 1)
  }

  return (
    <div className={`ann ann--banner ann--${shown.style || 'info'}`} role="status">
      <div className="wrap ann__banner-inner">
        <div>
          {shown.title ? <strong>{shown.title}</strong> : null}
          {shown.body_html ? (
            <span
              className="ann__body ann__body--inline"
              dangerouslySetInnerHTML={{ __html: shown.body_html }}
            />
          ) : null}
          {shown.cta_label && shown.cta_url ? (
            <a className="ann__cta" href={shown.cta_url}>
              {shown.cta_label}
            </a>
          ) : null}
        </div>
        {shown.dismissible ? (
          <button type="button" className="ann__dismiss" onClick={dismiss} aria-label="Dismiss">
            ×
          </button>
        ) : null}
      </div>
    </div>
  )
}
