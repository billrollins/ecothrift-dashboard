import { Link } from 'react-router-dom'
import type { HoldSummary } from '../../api'
import { HoldShell, ItemCard } from './shared'

export default function HoldPickedUpScreen({ hold }: { hold: HoldSummary }) {
  return (
    <HoldShell hold={hold}>
      <h1 className="holdflow__h1">{hold.headline}</h1>
      <p className="holdflow__next">{hold.next_step}</p>
      <ItemCard hold={hold} />
      <Link className="btn btn--primary btn--xl" to="/shop">
        Shop again
      </Link>
    </HoldShell>
  )
}
