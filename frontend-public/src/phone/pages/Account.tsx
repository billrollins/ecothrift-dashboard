/** /account (and /account/history, /account/messages) on the phone site: the member's place is /thriftplus. */
import { Navigate } from 'react-router-dom'

export default function Account() {
  return <Navigate to="/thriftplus" replace />
}
