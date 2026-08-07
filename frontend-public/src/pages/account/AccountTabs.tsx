import { NavLink } from 'react-router-dom'
import { useAccountData } from './accountData'

export default function AccountTabs() {
  const { unreadTotal, needsYouCount, currentPastHolds } = useAccountData()
  // Count what History actually shows, so the badge and the list agree.
  const pastHolds = currentPastHolds

  return (
    <nav className="acct__tabs" aria-label="Account sections">
      <NavLink
        to="/account"
        end
        className={({ isActive }) => `tabpill${isActive ? ' tabpill--on' : ''}`}
        aria-label={
          needsYouCount > 0
            ? `Account, ${needsYouCount} need${needsYouCount === 1 ? 's' : ''} your attention`
            : 'Account'
        }
      >
        Account
        {needsYouCount > 0 ? (
          <span className="tabpill__dot" aria-hidden="true" />
        ) : null}
      </NavLink>
      <NavLink
        to="/account/history"
        className={({ isActive }) => `tabpill${isActive ? ' tabpill--on' : ''}`}
        aria-label={
          pastHolds.length > 0
            ? `History, ${pastHolds.length} past hold${pastHolds.length === 1 ? '' : 's'}`
            : 'History'
        }
      >
        History
        {pastHolds.length > 0 ? (
          <span className="tabpill__badge tabpill__badge--muted" aria-hidden="true">
            {pastHolds.length}
          </span>
        ) : null}
      </NavLink>
      <NavLink
        to="/account/messages"
        className={({ isActive }) => `tabpill${isActive ? ' tabpill--on' : ''}`}
        aria-label={
          unreadTotal > 0
            ? `Messages, ${unreadTotal} unread`
            : 'Messages'
        }
      >
        Messages
        {unreadTotal > 0 ? (
          <span className="tabpill__badge" aria-hidden="true">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        ) : null}
      </NavLink>
    </nav>
  )
}
