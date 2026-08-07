import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth'
import { useSeo } from '../../useSeo'
import { AccountDataProvider, useAccountData } from './accountData'
import AccountTabs from './AccountTabs'

function NeedsYouStrip() {
  const { needsYouCount, activeHolds, unreadTotal } = useAccountData()
  if (needsYouCount === 0 && unreadTotal === 0) return null

  const pending = activeHolds.filter((h) => h.status === 'pending_verification').length
  const ready = activeHolds.filter((h) => h.status === 'ready_for_pickup').length
  const parts: string[] = []
  if (pending) parts.push(`${pending} waiting on your email`)
  if (ready) parts.push(`${ready} ready for pickup`)
  if (unreadTotal) parts.push(`${unreadTotal} unread message${unreadTotal === 1 ? '' : 's'}`)

  return (
    <div className="acct__needs" role="status">
      <strong>Needs you</strong>
      <span>{parts.join(' · ')}</span>
    </div>
  )
}

function AccountShell() {
  const { user, isLoading } = useAuth()
  const { loading, error } = useAccountData()

  useSeo({ title: 'My account', noindex: true })

  if (isLoading) {
    return (
      <div className="wrap acct">
        <div className="pagehead">
          <span className="skline" style={{ width: 180 }} />
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/account/sign-in" replace />

  return (
    <div className="wrap acct">
      <div className="pagehead">
        <div className="eyebrow">Account</div>
        <h1>Hi {user.first_name || 'there'}</h1>
        <p className="lead">{user.email}</p>
      </div>
      <NeedsYouStrip />
      <AccountTabs />
      {error ? <div className="formerror" style={{ marginTop: 12 }}>{error}</div> : null}
      {loading ? (
        <div className="acct__loading" aria-busy="true">
          <span className="skline" style={{ width: 240, height: 14 }} />
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  )
}

export default function AccountLayout() {
  return (
    <AccountDataProvider>
      <AccountShell />
    </AccountDataProvider>
  )
}
