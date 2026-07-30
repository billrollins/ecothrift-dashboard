import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { loadMyRequests } from '../api'
import { useSeo } from '../useSeo'

type HoldRow = {
  status_token: string
  listing_title: string
  quantity: number
  status_display: string
  status: string
}

type ConvRow = {
  public_token: string
  state: string
  listing_title: string | null
  reservation_status_token: string | null
  customer_unread: number
}

export default function AccountPage() {
  useSeo({ title: 'My account', noindex: true })
  const { user, isLoading, logout, authFetch } = useAuth()
  const [holds, setHolds] = useState<HoldRow[]>([])
  const [conversations, setConversations] = useState<ConvRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const localRequests = loadMyRequests()

  useEffect(() => {
    if (!user) return
    let active = true
    Promise.all([
      authFetch('/api/webstore/my/holds/').then(async (r) => {
        if (!r.ok) throw new Error('Could not load holds')
        return r.json()
      }),
      authFetch('/api/webstore/my/conversations/').then(async (r) => {
        if (!r.ok) throw new Error('Could not load messages')
        return r.json()
      }),
    ])
      .then(([h, c]) => {
        if (!active) return
        setHolds(h)
        setConversations(c)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Load failed')
      })
    return () => {
      active = false
    }
  }, [user, authFetch])

  if (isLoading) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <span className="skline" style={{ width: 180 }} />
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/account/sign-in" replace />

  return (
    <div className="wrap" style={{ paddingBottom: 60 }}>
      <div className="pagehead">
        <div className="eyebrow">Account</div>
        <h1>Hi {user.first_name}</h1>
      </div>
      <p className="lead">{user.email}</p>
      <button type="button" className="btn btn--ghost" onClick={() => logout()}>
        Sign out
      </button>

      {error && <div className="formerror" style={{ marginTop: 16 }}>{error}</div>}

      <section style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 22 }}>My requests</h2>
        {holds.length === 0 ? (
          <p>No holds on this account yet.</p>
        ) : (
          <ul>
            {holds.map((h) => (
              <li key={h.status_token}>
                <Link to={`/hold/${h.status_token}`}>
                  {h.listing_title} × {h.quantity} — {h.status_display || h.status}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {localRequests.length > 0 && (
          <>
            <h3 style={{ fontSize: 16, marginTop: 24 }}>Saved on this device</h3>
            <ul>
              {localRequests.map((r) => (
                <li key={`${r.kind}-${r.token}`}>
                  {r.kind === 'hold' ? (
                    <Link to={`/hold/${r.token}`}>{r.title}</Link>
                  ) : (
                    <span>{r.title} (message thread)</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 22 }}>My messages</h2>
        {conversations.length === 0 ? (
          <p>No message threads yet.</p>
        ) : (
          <ul>
            {conversations.map((c) => (
              <li key={c.public_token}>
                {c.reservation_status_token ? (
                  <Link to={`/hold/${c.reservation_status_token}`}>
                    {c.listing_title || 'Hold'} — {c.state.replace(/_/g, ' ')}
                    {c.customer_unread ? ` (${c.customer_unread} new)` : ''}
                  </Link>
                ) : (
                  <span>
                    {c.listing_title || 'Inquiry'} — {c.state.replace(/_/g, ' ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
