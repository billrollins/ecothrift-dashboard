/** /account/sign-in on the phone site: sign-in lives in the scanner, so go to /scan with the same query string. */
import { Navigate, useLocation } from 'react-router-dom'

export default function SignIn() {
  const { search } = useLocation()
  return <Navigate to={`/scan${search}`} replace />
}
