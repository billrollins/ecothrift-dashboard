/**
 * /verify on a computer (Dash Update #211): the emailed sign-in (or confirm) link lands here with ?token=. The same
 * steps as the phone's page (phone/pages/Verify.tsx): spend the token once through src/auth.tsx, then /thriftplus, or
 * the current site's page the server points at (`landingFor`: the online hold) with a full page load.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from '../../auth'
import { landingFor } from '../../phone/pages/Verify'
import { useSeo } from '../../useSeo'
import './info.css'

function VerifyInner() {
  const { consumeToken, user } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('Missing confirmation token.')
      return
    }
    let active = true
    consumeToken(token)
      .then((result) => {
        if (!active) return
        const [dest, fullLoad] = landingFor(result.redirect_to)
        if (fullLoad) window.location.replace(dest)
        else navigate(dest, { replace: true })
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Link invalid or expired')
      })
    return () => {
      active = false
    }
  }, [token, consumeToken, navigate])

  useEffect(() => {
    if (error && user) navigate('/thriftplus', { replace: true })
  }, [error, user, navigate])

  return (
    <div className="dk-w dk-nf" aria-busy={error ? undefined : true}>
      <p className="dk-kick">Sign in</p>
      <h1 className="disp">{error ? 'Could not confirm' : 'Confirming…'}</h1>
      <p style={{ fontSize: 18 }}>{error || 'One moment while we verify your email.'}</p>
      {error ? (
        <div style={{ display: 'flex', gap: 12 }}>
          <Link className="btn btn-ink" to="/account/sign-in">
            Sign in
          </Link>
          <Link className="btn btn-line" to="/">
            Home
          </Link>
        </div>
      ) : null}
    </div>
  )
}

export default function Verify() {
  useSeo({ title: 'Confirm email', noindex: true })
  return (
    <AuthProvider>
      <VerifyInner />
    </AuthProvider>
  )
}
