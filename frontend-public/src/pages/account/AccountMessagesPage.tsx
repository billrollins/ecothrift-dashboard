import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  deleteMyThread,
  fetchMyThread,
  markMyThreadUnread,
  markThreadRead,
  postThreadMessage,
  type MyThread,
} from '../../api'
import { useAccountData } from './accountData'

type Filter = 'all' | 'unread'

function formatWhen(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function authorLabel(kind: string): string {
  if (kind === 'customer') return 'You'
  if (kind === 'staff') return 'Eco-Thrift'
  return 'Update'
}

export default function AccountMessagesPage() {
  const { conversations, currentConversations, refresh } = useAccountData()
  const [params, setParams] = useSearchParams()
  const selected = params.get('thread') || ''
  const [filter, setFilter] = useState<Filter>('all')
  const [showOlder, setShowOlder] = useState(false)
  const [thread, setThread] = useState<MyThread | null>(null)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const selectThread = (token: string | null) => {
    const next = new URLSearchParams(params)
    if (token) next.set('thread', token)
    else next.delete('thread')
    setParams(next, { replace: true })
    setConfirmDelete(false)
    setActionError(null)
  }

  useEffect(() => {
    if (!selected) {
      setThread(null)
      setThreadError(null)
      setConfirmDelete(false)
      return
    }
    let active = true
    setThreadLoading(true)
    setThreadError(null)
    setConfirmDelete(false)
    fetchMyThread(selected)
      .then(async (data) => {
        if (!active) return
        setThread(data)
        if (data.customer_unread > 0) {
          try {
            const cleared = await markThreadRead(data.public_token)
            if (!active) return
            setThread({
              ...data,
              customer_unread: 0,
              messages: cleared.messages || data.messages,
            })
            void refresh()
          } catch {
            /* ignore mark-read failures */
          }
        }
      })
      .catch((err) => {
        if (active) {
          setThread(null)
          setThreadError(err instanceof Error ? err.message : 'Could not load thread')
        }
      })
      .finally(() => {
        if (active) setThreadLoading(false)
      })
    return () => {
      active = false
    }
  }, [selected, refresh])

  const onReply = async (e: FormEvent) => {
    e.preventDefault()
    if (!thread?.public_token || !reply.trim() || sending) return
    if (thread.state === 'pending_verification') return
    setSending(true)
    setSendError(null)
    try {
      const next = await postThreadMessage(thread.public_token, reply.trim())
      setThread({
        ...thread,
        customer_unread: 0,
        messages: next.messages || [],
        state: next.state || thread.state,
      })
      setReply('')
      void refresh()
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send')
    } finally {
      setSending(false)
    }
  }

  const onMarkUnread = async () => {
    if (!thread?.public_token || actionBusy) return
    setActionBusy(true)
    setActionError(null)
    try {
      await markMyThreadUnread(thread.public_token)
      setThread({ ...thread, customer_unread: 1 })
      void refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not mark unread')
    } finally {
      setActionBusy(false)
    }
  }

  const onDelete = async () => {
    if (!thread?.public_token || actionBusy) return
    setActionBusy(true)
    setActionError(null)
    try {
      await deleteMyThread(thread.public_token)
      setThread(null)
      selectThread(null)
      void refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete')
    } finally {
      setActionBusy(false)
      setConfirmDelete(false)
    }
  }

  const locked = thread?.state === 'pending_verification'
  const olderCount = conversations.length - currentConversations.length
  const baseList =
    showOlder || (selected && !currentConversations.some((c) => c.public_token === selected))
      ? conversations
      : currentConversations

  const visible = useMemo(() => {
    if (filter === 'unread') {
      return baseList.filter((c) => (c.customer_unread || 0) > 0 || c.public_token === selected)
    }
    return baseList
  }, [baseList, filter, selected])

  const unreadCount = useMemo(
    () => conversations.filter((c) => (c.customer_unread || 0) > 0).length,
    [conversations],
  )

  return (
    <div className={`msgpane${selected ? ' msgpane--open' : ''}`}>
      <div className="msglist">
        <div className="acctcard__head">
          <h2>Messages</h2>
        </div>
        <div className="acct__filters" role="group" aria-label="Filter messages">
          {(
            [
              ['all', 'All'],
              ['unread', unreadCount > 0 ? `Unread (${unreadCount})` : 'Unread'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`filterchip${filter === key ? ' filterchip--on' : ''}`}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
            >
              {label}
            </button>
          ))}
        </div>
        {conversations.length === 0 ? (
          <div className="acct__empty">
            <p>No message threads yet.</p>
            <Link className="btn btn--primary" to="/shop">
              Browse the shop
            </Link>
          </div>
        ) : visible.length === 0 ? (
          <div className="acct__empty">
            <p>{filter === 'unread' ? 'Nothing unread.' : 'No conversations here.'}</p>
          </div>
        ) : (
          <ul>
            {visible.map((c) => {
              const on = c.public_token === selected
              return (
                <li key={c.public_token}>
                  <button
                    type="button"
                    className={`msgrow${on ? ' msgrow--on' : ''}${c.customer_unread ? ' msgrow--unread' : ''}`}
                    onClick={() => selectThread(c.public_token)}
                  >
                    <div className="msgrow__top">
                      <span className="msgrow__title">
                        {c.listing_title || 'Conversation'}
                      </span>
                      {c.customer_unread > 0 ? (
                        <span className="tabpill__badge" aria-label={`${c.customer_unread} unread`}>
                          {c.customer_unread}
                        </span>
                      ) : null}
                    </div>
                    <div className="msgrow__preview">
                      {c.last_message_preview || c.state.replace(/_/g, ' ')}
                    </div>
                    <div className="msgrow__when">{formatWhen(c.last_message_at)}</div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {olderCount > 0 && filter === 'all' ? (
          <div className="acct__more">
            <button
              type="button"
              className="txt"
              onClick={() => setShowOlder((v) => !v)}
            >
              {showOlder
                ? 'Hide older conversations'
                : `Show ${olderCount} older conversation${olderCount === 1 ? '' : 's'}`}
            </button>
          </div>
        ) : null}
      </div>

      <div className="msgthread">
        {!selected ? (
          <div className="acct__empty msgthread__empty">
            <p>Select a conversation to read and reply.</p>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="msgthread__back txt"
              onClick={() => selectThread(null)}
            >
              ← Back to messages
            </button>
            {threadLoading && !thread ? (
              <div className="acct__loading" aria-busy="true">
                <span className="skline" style={{ width: 200 }} />
              </div>
            ) : null}
            {threadError ? <div className="formerror">{threadError}</div> : null}
            {thread ? (
              <>
                <div className="msgthread__head">
                  <h2>{thread.listing_title || 'Conversation'}</h2>
                  {thread.reservation_status_token ? (
                    <Link className="txt" to={`/hold/${thread.reservation_status_token}`}>
                      View hold
                    </Link>
                  ) : thread.listing_slug ? (
                    <Link className="txt" to={`/shop/${thread.listing_slug}`}>
                      View item
                    </Link>
                  ) : null}
                </div>
                <div className="msgthread__tools">
                  <button
                    type="button"
                    className="txt"
                    disabled={actionBusy || (thread.customer_unread || 0) > 0}
                    onClick={() => void onMarkUnread()}
                  >
                    Mark unread
                  </button>
                  {!confirmDelete ? (
                    <button
                      type="button"
                      className="txt msgthread__delete"
                      disabled={actionBusy}
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
                {confirmDelete ? (
                  <div className="msgthread__confirm" role="alertdialog" aria-labelledby="del-title">
                    <p id="del-title">
                      Delete this conversation? This cannot be undone.
                    </p>
                    <div className="hbtns">
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={actionBusy}
                        onClick={() => void onDelete()}
                      >
                        {actionBusy ? 'Deleting…' : 'Delete'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={actionBusy}
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                {actionError ? <div className="formerror">{actionError}</div> : null}
                <div className="bubblelist">
                  {(thread.messages || []).map((m) => (
                    <div
                      key={m.id}
                      className={`bubble bubble--${m.author_kind === 'customer' ? 'customer' : m.author_kind === 'staff' ? 'staff' : 'system'}`}
                    >
                      <div className="bubble__meta">
                        {authorLabel(m.author_kind)} · {formatWhen(m.created_at)}
                      </div>
                      <div className="bubble__text">{m.body}</div>
                    </div>
                  ))}
                  {(thread.messages || []).length === 0 && (
                    <p className="acct__hint">No messages yet.</p>
                  )}
                </div>
                {locked ? (
                  <div className="acctcard acctcard--warn">
                    <p>
                      Confirm your email to unlock this conversation. Check your inbox
                      for the confirmation link.
                    </p>
                  </div>
                ) : (
                  <form className="msgcompose" onSubmit={onReply}>
                    <label className="field">
                      <span>Reply</span>
                      <textarea
                        rows={3}
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="Write a reply…"
                      />
                    </label>
                    {sendError && <div className="formerror">{sendError}</div>}
                    <button
                      className="btn btn--primary"
                      type="submit"
                      disabled={sending || !reply.trim()}
                    >
                      {sending ? 'Sending…' : 'Send reply'}
                    </button>
                  </form>
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
