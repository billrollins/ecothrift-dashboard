/** The home page: the mockup's blocks in their order (round3/blocks/NN-*.html), one file each in pages/home/.
 *  Sections: #top #finds #categories #coming #visit. One ThriftBucks explainer only (owner 2026-11-20: "we have 3 thrift+
 *  bucks explainers... NO do not do that. I think the top tile card is best"): the first card and its Example window;
 *  the Thrift+ band and How it works are gone. A member's balance is in the top bar. */
import { useDay } from '../lib/day'
import Coming from './home/Coming'
import Finds from './home/Finds'
import Footer from './home/Footer'
import ShopByCategory from './home/ShopByCategory'
import Specials from './home/Specials'
import Visit from './home/Visit'

/** Black Friday (owner 2026-11-24, Dash Update #228: "No in store tab Just Home Scan Thrift+"): the home offers no way
 *  into the shop's lists that day: no Shop by category, no On the truck, no "See all" (Finds). The day is known at the
 *  first paint (the stamped feed), so nothing appears or goes later. */
export default function Home() {
  const bf = useDay() === 'bf'
  return (
    <>
      <Specials />
      <Finds />
      {bf ? null : <ShopByCategory />}
      {bf ? null : <Coming />}
      <Visit />
      <Footer />
    </>
  )
}
