/**
 * Account (PLAN-SCANNER.md row 23, C9; the live AccountScreens.tsx `AccountPage`), a view of /thriftplus
 * (`?show=account`) since the coordinator's call 1: your name, phone and photo (no retake: ask at the register), the
 * home-screen card, who is on the account, emails, recent activity, and Sign out (which also ends the website session,
 * server side). No passwords (owner 2026-10-16). Words as live.
 *
 * Calm (owner 2026-11-19 night): nothing opens in place. "Remove Sam" / "Leave this account" ask on a fade-in sheet
 * over the page (the live screen opened a box under the button).
 */
import { useState } from 'react'
import type { AccountProps } from '../contracts'
import { formatPhone, money } from '../core'
import { actions, useAction, useMe } from '../store'
import { Button, Sheet, Spinner } from '../ui'
import { tb } from './Balance'
import { HomeScreenCard } from './HomeScreenCard'

function errorText(e: unknown, fallback = 'Try again.'): string {
  return e instanceof Error && e.message ? e.message : fallback
}

type Confirm = { id: number; first: string; you: boolean }

export function Account({ member, onSignOut }: AccountProps) {
  const me = useMe()
  const remove = useAction(actions.removePerson)
  const news = useAction(actions.setMyNews)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [err, setErr] = useState('')
  const data = me.data
  // ThriftBucks and Thrift+ credit only (rows of retired kinds from before 10-12 are left out).
  const activity = (data?.money ?? []).filter((m) => m.kind === 'bank' || m.kind === 'credit')

  const run = async (fn: () => Promise<unknown>) => {
    setErr('')
    try {
      await fn()
      setConfirm(null)
    } catch (e) {
      setErr(errorText(e, 'Could not do that. Ask at the register.'))
      setConfirm(null)
    }
  }

  return (
    <section className="mb-sec" data-testid="account-page">
      <div className="mb-you">
        {data?.you?.photo_url ? (
          <img className="mb-photo" src={data.you.photo_url} alt="Your photo" width={84} height={84} data-testid="account-photo" />
        ) : (
          <span className="mb-photo mb-letter disp" aria-hidden="true" data-testid="account-photo-none">
            {member.first_name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="mb-who">
          <p className="mb-name" data-testid="account-name">{data?.you?.name || member.first_name}</p>
          <p className="mb-phone tn" data-testid="account-phone">{data?.you?.phone ? formatPhone(data.you.phone) : ' '}</p>
        </div>
      </div>
      {/* No retake in the app (owner 2026-10-20): the photo is the register's check of who you are. */}
      <p className="mb-note" data-testid="account-photo-note">Ask at the register to change your photo.</p>

      <div className="mb-gap">
        <HomeScreenCard variant="account" />
      </div>

      {me.loading && !data ? (
        <div className="mb-wait mb-tall"><Spinner /></div>
      ) : null}
      {me.error && !data ? (
        <p role="alert" className="mb-bad">Could not load your account. Check your signal and try again.</p>
      ) : null}

      {data ? (
        <>
          <h2 className="mb-h">Who is on the account</h2>
          <ul className="mb-list">
            {data.people.map((p) => {
              const canRemove =
                data.can_change && p.role === 'secondary' && (p.is_you || data.people.some((x) => x.is_you && x.role === 'primary'))
              return (
                <li key={p.id} className="mb-person">
                  <span className="mb-pn">
                    <b>{p.first_name}</b>
                    <span>
                      {p.role === 'primary' ? 'Main member' : 'Second adult'}
                      {p.is_you ? ' (you)' : ''}
                    </span>
                  </span>
                  {canRemove ? (
                    <button type="button" className="mb-pill" onClick={() => setConfirm({ id: p.id, first: p.first_name, you: p.is_you })}>
                      {p.is_you ? 'Leave this account' : `Remove ${p.first_name}`}
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>

          {data.emails ? (
            <>
              <h2 className="mb-h">Emails</h2>
              {!data.emails.has_email ? (
                <p className="mb-note">Add an email to your membership at the register to get your receipts and Thrift+ updates by email.</p>
              ) : (
                <div className="mb-box">
                  {data.emails.note ? <p className="mb-note mb-pad">{data.emails.note}</p> : null}
                  <div className={`mb-news${data.emails.note ? ' mb-top' : ''}`}>
                    <b>
                      Store news
                      <span className={data.emails.news ? 'mb-on' : 'mb-off'}>{data.emails.news ? 'On' : 'Off'}</span>
                    </b>
                    {data.emails.news || data.can_change ? (
                      <button
                        type="button"
                        className="mb-pill"
                        disabled={news.pending}
                        onClick={() => void run(() => news.run(!data.emails?.news))}
                      >
                        {data.emails.news ? 'Turn off' : 'Turn on'}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          ) : null}
          {err ? (
            <p role="alert" className="mb-bad">
              {err}
            </p>
          ) : null}

          <h2 className="mb-h">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="mb-note">Nothing yet. ThriftBucks show up here after your first purchase.</p>
          ) : (
            <ul className="mb-list mb-act">
              {activity.slice(0, 12).map((m, i) => {
                const minus = Number(m.amount) < 0
                return (
                  <li key={`${m.created_at}-${i}`}>
                    <span className="mb-pn">
                      <b>{m.reason || (m.kind === 'bank' ? 'ThriftBucks' : 'Thrift+ credit')}</b>
                      <span>{new Date(m.created_at).toLocaleDateString()}</span>
                    </span>
                    <em className={`tn${minus ? '' : ' mb-plusamt'}`}>
                      {minus ? '-' : '+'}
                      {m.kind === 'bank' ? <span>{tb(m.amount)}</span> : money(String(Math.abs(Number(m.amount)).toFixed(2)))}
                    </em>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      ) : null}

      <Button kind="line" wide className="mb-out" onClick={onSignOut}>
        Sign out
      </Button>

      {confirm ? (
        <Sheet label={confirm.you ? 'Leave this account' : `Remove ${confirm.first}`} onClose={() => setConfirm(null)} testId="account-confirm">
          <p className="mb-ask">
            {confirm.you ? 'Leave this account? You will be signed out.' : `Take ${confirm.first} off the account? Their member QR stops working.`}
          </p>
          <div className="mb-asks">
            <Button kind="ink" className="mb-red" pending={remove.pending} onClick={() => void run(() => remove.run(confirm.id))}>
              {confirm.you ? 'Leave' : 'Remove'}
            </Button>
            <Button kind="line" disabled={remove.pending} onClick={() => setConfirm(null)}>
              Never mind
            </Button>
          </div>
        </Sheet>
      ) : null}
    </section>
  )
}
