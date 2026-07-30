import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchHold,
  postThreadMessage,
  rememberMyRequest,
  type HoldSummary,
  type PublicThread,
} from '../api'
import { STORE } from '../data/content'
import { useSeo } from '../useSeo'

export default function HoldStatusPage() {
  useSeo({ title: 'Hold status', noindex: true })
  const { token = '' } = useParams()
  const [hold, setHold] = useState<HoldSummary | null>(null)
  const [thread, setThread] = useState<PublicThread | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchHold(token)
      .then((data) => {
        if (!active) return
        setHold(data)
        setThread(data.thread ?? null)
        rememberMyRequest({
          kind: 'hold',
          token: data.status_token,
          title: data.listing_title,
        })
        if (data.thread?.public_token) {
          rememberMyRequest({
            kind: 'thread',
            token: data.thread.public_token,
            title: data.listing_title,
          })
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Hold not found')
      })
    return () => {
      active = false
    }
  }, [token])

  const onReply = async (e: FormEvent) => {
    e.preventDefault()
    if (!thread?.public_token || !reply.trim() || sending) return
    setSending(true)
    setSendError(null)
    try {
      const next = await postThreadMessage(thread.public_token, reply.trim())
      setThread(next)
      setReply('')
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send')
    } finally {
      setSending(false)
    }
  }

  if (error) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <div className="eyebrow">Hold status</div>
          <h1>Hold not found</h1>
        </div>
        <p className="lead">{error}</p>
        <Link className="btn btn--primary" to="/shop">
          Back to shop
        </Link>
      </div>
    )
  }

  if (!hold) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <span className="skline" style={{ width: 220 }} />
        </div>
      </div>
    )
  }

  return (
    <div className="wrap">
      <div className="pagehead">
        <div className="eyebrow">Hold status</div>
        <h1>{hold.status_display || hold.status}</h1>
      </div>
      <p className="lead">
        {hold.listing_title} × {hold.quantity}
      </p>
      <div className="pickupnote" style={{ marginBottom: 24 }}>
        {hold.policy}
      </div>
      <dl className="orderfacts">
        <div>
          <dt>Status</dt>
          <dd>{hold.status_display}</dd>
        </div>
        {hold.expires_at && (
          <div>
            <dt>Expires</dt>
            <dd>{new Date(hold.expires_at).toLocaleString()}</dd>
          </div>
        )}
        <div>
          <dt>Pickup</dt>
          <dd>
            {STORE.retail.name} — {STORE.retail.address}. {STORE.retail.hours}.
          </dd>
        </div>
      </dl>

      {thread && (
        <section style={{ marginTop: 36, marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>Messages</h2>
          <div className="pickupnote" style={{ marginBottom: 16 }}>
            {(thread.messages || []).map((m) => (
              <div key={m.id} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {m.author_kind} · {new Date(m.created_at).toLocaleString()}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
              </div>
            ))}
            {(thread.messages || []).length === 0 && <p>No messages yet.</p>}
          </div>
          <form onSubmit={onReply}>
            <label className="field">
              <span>Reply</span>
              <textarea
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Ask a question about this hold…"
              />
            </label>
            {sendError && <div className="formerror">{sendError}</div>}
            <button className="btn btn--primary" type="submit" disabled={sending || !reply.trim()}>
              {sending ? 'Sending…' : 'Send reply'}
            </button>
          </form>
        </section>
      )}

      <p style={{ marginTop: 24 }}>
        {/* POLICY_COPY_OK: negation prose */}
        Save this page link. Pay in store at pickup — no shipping, delivery, or online payment.
      </p>
      <div className="hbtns" style={{ marginTop: 18, marginBottom: 60 }}>
        <Link className="btn btn--primary" to="/shop">
          Continue shopping
        </Link>
      </div>
    </div>
  )
}
