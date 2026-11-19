/**
 * /verify on the phone site: the emailed sign-in (or confirm) link lands here with ?token=. It does what the current
 * site's pages/VerifyPage.tsx does with src/auth.tsx (spend the token once through `consumeToken`), then sends the
 * visitor to /thriftplus. The one exception: a link whose server answer points at a page the phone site does not own
 * (the online hold and the switched-off online store) goes there with a full page load, so a hold confirmation still lands on its hold.
 * The phone entry has no AuthProvider, so this page brings its own.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from '../../auth'
import { useSeo } from '../../useSeo'
import './legal/legal.css'

/** Paths that stay on the current site (App.tsx: link to them with a plain <a href>). */
const CURRENT_SITE = /^\/(hold|hold-link-expired|shop|checkout)(\/|\?|$)/ // POLICY_COPY_OK: route names, not copy

/** Where a spent token sends the visitor: [path, full page load?]. */
export function landingFor(redirectTo: string | undefined | null): [string, boolean] {
  const dest = String(redirectTo || '')
  if (dest.startsWith('/') && !dest.startsWith('//') && CURRENT_SITE.test(dest)) return [dest, true]
  return ['/thriftplus', false]
}

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

  // Already signed in on this phone: a spent or old link is no dead end.
  useEffect(() => {
    if (error && user) navigate('/thriftplus', { replace: true })
  }, [error, user, navigate])

  if (error) {
    return (
      <div className="lg">
        <header className="lg-hd">
          <p className="lbl">Sign in</p>
          <h1 className="disp">Could not confirm</h1>
        </header>
        <div className="lg-one">
          <p className="lg-err">{error}</p>
          <Link className="btn btn-ink" to="/scan">
            Sign in
          </Link>
          <Link className="btn btn-line" to="/">
            Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="lg" aria-busy="true">
      <header className="lg-hd">
        <p className="lbl">Sign in</p>
        <h1 className="disp">Confirming…</h1>
      </header>
      <div className="lg-one">
        <p>One moment while we verify your email.</p>
      </div>
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
