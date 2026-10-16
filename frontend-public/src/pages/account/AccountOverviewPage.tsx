import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isStaffLogin, useAuth } from '../../auth'
import { STORE, retailMapsDirectionsUrl } from '../../data/content'
import { useHolidayNote, useStoreHoursLabel } from '../../lib/storeHours'
import { useAccountData } from './accountData'
import HoldCard from './HoldCard'

export default function AccountOverviewPage() {
  const { user, logout, emailVerified, resendVerification } = useAuth()
  const hoursLabel = useStoreHoursLabel()
  const holiday = useHolidayNote()
  const { activeHolds, archivedHolds, unarchiveHold } = useAccountData()
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)
  const [archiveBusy, setArchiveBusy] = useState<string | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  const staffLogin = isStaffLogin(user)

  if (!user) return null

  const onResendVerify = async () => {
    setVerifyBusy(true)
    setVerifyMsg(null)
    try {
      const data = await resendVerification()
      setVerifyMsg(data.detail || 'Confirmation link sent.')
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : 'Could not resend')
    } finally {
      setVerifyBusy(false)
    }
  }

  const onRestore = async (token: string) => {
    setArchiveBusy(token)
    setArchiveError(null)
    try {
      await unarchiveHold(token)
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Could not restore')
    } finally {
      setArchiveBusy(null)
    }
  }

  return (
    <div className="acct__grid">
      <div className="acct__main">
        <section className="acctcard">
          <div className="acctcard__head">
            <h2>Active holds</h2>
            {activeHolds.length > 0 ? (
              <span className="acctcard__count">{activeHolds.length}</span>
            ) : null}
          </div>
          {activeHolds.length === 0 ? (
            <div className="acct__empty">
              <p>No active holds right now.</p>
              <Link className="btn btn--primary" to="/shop">
                Browse the shop
              </Link>
            </div>
          ) : (
            <div className="holdcard-list">
              {activeHolds.map((h) => (
                <HoldCard key={h.status_token} hold={h} />
              ))}
            </div>
          )}
        </section>

        {archivedHolds.length > 0 ? (
          <section className="acctcard">
            <div className="acctcard__head">
              <h2>Archived</h2>
              <span className="acctcard__count">{archivedHolds.length}</span>
            </div>
            <p className="acct__hint" style={{ marginTop: 0, marginBottom: 12 }}>
              Hidden from History. Restore to put one back.
            </p>
            {archiveError ? <div className="formerror">{archiveError}</div> : null}
            <ul className="archlist">
              {archivedHolds.map((h) => (
                <li key={h.status_token} className="archrow">
                  <div className="archrow__body">
                    <span className="archrow__title">
                      {h.listing_title}
                      {h.quantity > 1 ? ` × ${h.quantity}` : ''}
                    </span>
                    <span className="archrow__meta">
                      {h.status === 'completed' ? 'Picked up' : 'Ended'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={archiveBusy === h.status_token}
                    onClick={() => void onRestore(h.status_token)}
                  >
                    {archiveBusy === h.status_token ? 'Restoring…' : 'Restore'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside className="acct__side">
        <section className="acctcard">
          <h2>Profile</h2>
          <p className="acct__profile-name">
            {[user.first_name, user.last_name].filter(Boolean).join(' ') || 'Customer'}
          </p>
          <p className="acct__profile-email">{user.email}</p>
          <div className="acct__verify-row">
            {emailVerified ? (
              <span className="statuspill statuspill--success">Verified</span>
            ) : (
              <>
                <span className="statuspill statuspill--warn">Unverified</span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={verifyBusy}
                  onClick={onResendVerify}
                >
                  {verifyBusy ? 'Sending…' : 'Resend confirmation'}
                </button>
              </>
            )}
          </div>
          {!emailVerified && (
            <p className="acct__hint">
              Confirm your email before holds or questions reach the store.
            </p>
          )}
          {verifyMsg && <p className="acct__hint">{verifyMsg}</p>}
        </section>

        {/* One account (owner 2026-10-16): no password; the same emailed sign-in opens the Thrift+ app. */}
        {!staffLogin && (
          <section className="acctcard">
            <h2>Thrift+</h2>
            <p className="acct__hint">
              This is your Thrift+ account too. No password: we email you a link whenever you sign in.
            </p>
            <a className="btn btn--ghost" href="/scan">
              Open the Thrift+ app
            </a>
          </section>
        )}

        {staffLogin && (
          <section className="acctcard">
            <p className="acct__hint" style={{ margin: 0 }}>
              This is your staff login: your password is your Dash password. Change it in Dash.
            </p>
          </section>
        )}

        <section className="acctcard">
          <h2>Pickup</h2>
          <div className="acct__store">
            <div>{STORE.retail.name}</div>
            <div>{STORE.retail.address}</div>
            <div>{hoursLabel}</div>
            {holiday ? <div>{holiday}</div> : null}
            <div>Pay in store - cash or card</div>
          </div>
          <a
            className="btn btn--ghost"
            href={retailMapsDirectionsUrl()}
            target="_blank"
            rel="noopener noreferrer"
          >
            Get directions
          </a>
        </section>

        <button type="button" className="btn btn--ghost" onClick={() => logout()}>
          Sign out
        </button>
      </aside>
    </div>
  )
}
