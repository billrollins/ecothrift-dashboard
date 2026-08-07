import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  fetchHold,
  rememberMyRequest,
  type HoldSummary,
  type PublicThread,
} from '../api'
import { useSeo } from '../useSeo'
import HoldConfirmedScreen from './hold/HoldConfirmedScreen'
import HoldPickedUpScreen from './hold/HoldPickedUpScreen'
import HoldReadyScreen from './hold/HoldReadyScreen'
import HoldReleasedScreen from './hold/HoldReleasedScreen'
import HoldRequestedScreen from './hold/HoldRequestedScreen'

export default function HoldStatusPage() {
  useSeo({ title: 'Hold status', noindex: true })
  const { token = '' } = useParams()
  const [params] = useSearchParams()
  const relinked = params.get('relinked') === '1'
  const linkExpired = params.get('link') === 'expired'
  const arrivedConfirmed = params.get('confirmed') === '1'
  const [hold, setHold] = useState<HoldSummary | null>(null)
  const [thread, setThread] = useState<PublicThread | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    let active = true
    setHold(null)
    setThread(null)
    setError(null)
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
        if (
          arrivedConfirmed &&
          data.status !== 'pending_verification' &&
          data.expires_label
        ) {
          setAnnouncement(`Confirmed. We're holding it until ${data.expires_label}.`)
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Hold not found')
      })
    return () => {
      active = false
    }
  }, [token, arrivedConfirmed])

  const handleConfirmed = (next: HoldSummary, message: string) => {
    setHold(next)
    setThread(next.thread ?? null)
    setAnnouncement(message)
  }

  if (error) {
    return (
      <div className="wrap holdflow">
        <h1 className="holdflow__h1">Hold not found</h1>
        <p className="holdflow__next">{error}</p>
        <Link className="btn btn--primary btn--xl" to="/shop">
          Shop
        </Link>
      </div>
    )
  }

  if (!hold) {
    return (
      <div className="wrap holdflow">
        <div className="rail" aria-label="Hold progress">
          <ol className="rail__steps">
            {['Requested', 'Confirmed', 'Ready', 'Picked up'].map((label) => (
              <li key={label} className="rail__step rail__step--upcoming">
                <span className="rail__dot" aria-hidden="true" />
                <span className="rail__label">{label}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="skline" style={{ width: 280, height: 28 }} />
      </div>
    )
  }

  return (
    <>
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
      {hold.status === 'pending_verification' ? (
        <HoldRequestedScreen
          hold={hold}
          relinked={relinked}
          linkExpired={linkExpired}
          onHoldUpdate={(next) => {
            setHold(next)
            setThread(next.thread ?? null)
          }}
          onConfirmed={handleConfirmed}
        />
      ) : hold.status === 'completed' ? (
        <HoldPickedUpScreen hold={hold} />
      ) : ['declined', 'cancelled', 'expired'].includes(hold.status) ? (
        <HoldReleasedScreen hold={hold} />
      ) : hold.status === 'ready_for_pickup' ? (
        <HoldReadyScreen
          hold={hold}
          thread={thread}
          onThreadUpdate={setThread}
        />
      ) : (
        <HoldConfirmedScreen hold={hold} />
      )}
    </>
  )
}
