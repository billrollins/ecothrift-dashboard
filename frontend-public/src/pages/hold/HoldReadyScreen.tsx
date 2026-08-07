import { useState, type FormEvent } from 'react'
import {
  markThreadRead,
  postThreadMessage,
  type HoldSummary,
  type PublicThread,
} from '../../api'
import {
  DeadlineLine,
  DirectionsButton,
  HoldShell,
  ItemCard,
  PickupCode,
  StoreFacts,
} from './shared'

type Props = {
  hold: HoldSummary
  thread: PublicThread | null
  onThreadUpdate: (t: PublicThread) => void
}

/** Staff replies are attributed to the store, never to a person. */
function authorLabel(kind: string): string {
  if (kind === 'customer') return 'You'
  if (kind === 'staff') return 'Eco-Thrift'
  return 'Update'
}

export default function HoldReadyScreen({ hold, thread, onThreadUpdate }: Props) {
  const [open, setOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const unread = thread?.customer_unread || 0
  const msgCount = thread?.messages?.length || 0

  const onReply = async (e: FormEvent) => {
    e.preventDefault()
    if (!thread?.public_token || !reply.trim() || sending) return
    setSending(true)
    setSendError(null)
    try {
      const next = await postThreadMessage(thread.public_token, reply.trim())
      onThreadUpdate(next)
      setReply('')
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send')
    } finally {
      setSending(false)
    }
  }

  const toggleMessages = async () => {
    const next = !open
    setOpen(next)
    if (next && thread?.public_token && unread > 0) {
      try {
        const t = await markThreadRead(thread.public_token)
        onThreadUpdate(t)
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <HoldShell hold={hold}>
      <h1 className="holdflow__h1">{hold.headline}</h1>
      <DeadlineLine hold={hold} />
      <PickupCode code={hold.pickup_code} />

      <DirectionsButton />
      <StoreFacts />

      {hold.staff_note_public ? (
        <div className="holdnote">
          <div className="holdnote__label">A note from us</div>
          <p>{hold.staff_note_public}</p>
        </div>
      ) : null}

      <ItemCard hold={hold} />

      {thread && (
        <div className="holdmsgs">
          <button type="button" className="holdmsgs__toggle" onClick={toggleMessages}>
            Messages ({msgCount}){unread > 0 ? ` · ${unread} new` : ''}
            <span aria-hidden="true">{open ? ' ▴' : ' ▾'}</span>
          </button>
          {open && (
            <div className="holdmsgs__body">
              {(thread.messages || []).map((m) => (
                <div key={m.id} className="holdmsgs__row">
                  <div className="holdmsgs__meta">{authorLabel(m.author_kind)}</div>
                  <div className="holdmsgs__text">{m.body}</div>
                </div>
              ))}
              {(thread.messages || []).length === 0 && <p>No messages yet.</p>}
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
                <button
                  className="btn btn--ghost"
                  type="submit"
                  disabled={sending || !reply.trim()}
                >
                  {sending ? 'Sending…' : 'Send reply'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </HoldShell>
  )
}
