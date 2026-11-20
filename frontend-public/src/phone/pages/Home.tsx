/** The home page: the mockup's blocks in their order (round3/blocks/NN-*.html), one file each in pages/home/.
 *  Sections: #top #finds #categories #coming #visit. One ThriftBucks explainer only (owner 2026-11-20: "we have 3 thrift+
 *  bucks explainers... NO do not do that. I think the top tile card is best"): the first card and its Example window;
 *  the Thrift+ band and How it works are gone. A member's balance is in the top bar. */
import Coming from './home/Coming'
import Finds from './home/Finds'
import Footer from './home/Footer'
import ShopByCategory from './home/ShopByCategory'
import Specials from './home/Specials'
import Visit from './home/Visit'

export default function Home() {
  return (
    <>
      <Specials />
      <Finds />
      <ShopByCategory />
      <Coming />
      <Visit />
      <Footer />
    </>
  )
}
