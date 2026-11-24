/**
 * The desktop home (Dash Update #211): the phone home's blocks in the phone's order, laid out for a computer: the
 * specials, best finds, shop by category, on the truck, visit. On Black Friday the sale takes the first screen
 * (home/BlackFriday.tsx) and the rest follows below it.
 */
import { useSeo } from '../../useSeo'
import { useDeskDay } from '../lib/day'
import BlackFriday from './home/BlackFriday'
import { Coming, Finds, ShopByCategory, VisitBand } from './home/Blocks'
import Specials from './home/Specials'
import './home/home.css'

export default function Home() {
  useSeo({})
  const day = useDeskDay()
  return (
    <>
      {day === 'bf' ? <BlackFriday /> : <Specials />}
      <Finds />
      <ShopByCategory />
      <Coming />
      <VisitBand />
    </>
  )
}
