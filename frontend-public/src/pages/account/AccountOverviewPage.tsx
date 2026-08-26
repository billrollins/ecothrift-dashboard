import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  clearPasswordPrompt,
  peekPasswordPrompt,
  useAuth,
} from '../../auth'
import { STORE, retailMapsDirectionsUrl } from '../../data/content'
import { useStoreHoursLabel } from '../../lib/storeHours'
import { useAccountData } from './accountData'
import HoldCard from './HoldCard'

export default function AccountOverviewPage() {
  const {
    user,
    logout,
    hasPassword,
    emailVerified,
    setPassword,
    resendVerification,
  } = useAuth()
  const hoursLabel = useStoreHoursLabel()
  const { activeHolds, archivedHolds, unarchiveHold } = useAccountData()
  const [params] = useSearchParams()

  const [password, setPasswordValue] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [showPasswordCard, setShowPasswordCard] = useState(false)

  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)
  const [archiveBusy, setArchiveBusy] = useState<string | null>(null)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasPassword || params.get('set_password') === '1' || peekPasswordPrompt()) {
      setShowPasswordCard(true)
    }
  }, [params, hasPassword])

  if (!user) return null

  const onSavePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPasswordBusy(true)
    setPasswordError(null)
    setPasswordMsg(null)
    try {
      await setPassword({ password })
      setPasswordMsg('Password saved.')
      setPasswordValue('')
      setShowPasswordCard(false)
      clearPasswordPrompt()
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not save password')
    } finally {
      setPasswordBusy(false)
    }
  }

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

        {showPasswordCard && (
          <section className="acctcard">
            <h2>{hasPassword ? 'Update password' : 'Add a password'}</h2>
            <p className="acct__hint">
              {hasPassword
                ? 'Optional - set a new password, or skip.'
                : 'Optional. Keep using email links, or save a password for next time.'}
            </p>
            <form className="checkout-form" onSubmit={onSavePassword}>
              <label className="field">
                <span>{hasPassword ? 'New password' : 'Password'}</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  disabled={passwordBusy}
                />
              </label>
              {passwordError && <div className="formerror">{passwordError}</div>}
              {passwordMsg && <p className="acct__hint">{passwordMsg}</p>}
              <div className="hbtns">
                <button className="btn btn--primary" type="submit" disabled={passwordBusy}>
                  {passwordBusy ? 'Saving…' : hasPassword ? 'Update password' : 'Save password'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setShowPasswordCard(false)
                    clearPasswordPrompt()
                  }}
                >
                  Not now
                </button>
              </div>
            </form>
          </section>
        )}

        {!showPasswordCard && hasPassword && (
          <section className="acctcard">
            <button
              type="button"
              className="txt"
              onClick={() => setShowPasswordCard(true)}
            >
              Change password
            </button>
          </section>
        )}

        <section className="acctcard">
          <h2>Pickup</h2>
          <div className="acct__store">
            <div>{STORE.retail.name}</div>
            <div>{STORE.retail.address}</div>
            <div>{hoursLabel}</div>
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
