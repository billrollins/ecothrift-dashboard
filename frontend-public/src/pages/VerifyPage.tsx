import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { useSeo } from '../useSeo'

export default function VerifyPage() {
  useSeo({ title: 'Confirm email', noindex: true })
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
        // ALREADY_VERIFIED / LINK_REFRESHED resolve forward - never a dead page.
        const dest = result.redirect_to || '/account'
        if (result.code === 'ALREADY_VERIFIED' || result.code === 'LINK_REFRESHED') {
          navigate(dest, { replace: true })
          return
        }
        const sep = dest.includes('?') ? '&' : '?'
        const withPrompt = result.needs_password_prompt
          ? `${dest}${sep}set_password=1`
          : dest
        navigate(withPrompt, { replace: true })
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Link invalid or expired')
      })
    return () => {
      active = false
    }
  }, [token, consumeToken, navigate])

  useEffect(() => {
    if (error && user) navigate('/account', { replace: true })
  }, [error, user, navigate])

  if (error) {
    return (
      <div className="wrap">
        <div className="pagehead">
          <div className="eyebrow">Account</div>
          <h1>Could not confirm</h1>
        </div>
        <p className="lead" style={{ color: '#c0392b' }}>
          {error}
        </p>
        <Link className="btn btn--primary" to="/account/sign-in">
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="wrap">
      <div className="pagehead">
        <div className="eyebrow">Account</div>
        <h1>Confirming…</h1>
      </div>
      <p className="lead">One moment while we verify your email.</p>
    </div>
  )
}
