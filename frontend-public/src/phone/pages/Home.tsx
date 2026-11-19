/** The home page: the mockup's blocks in their order (round3/blocks/NN-*.html), one file each in pages/home/.
 *  Sections: #top #finds #categories #thriftplus #coming #how #visit. */
import Coming from './home/Coming'
import Finds from './home/Finds'
import Footer from './home/Footer'
import HowItWorks from './home/HowItWorks'
import ShopByCategory from './home/ShopByCategory'
import Specials from './home/Specials'
import ThriftPlusBand from './home/ThriftPlusBand'
import Visit from './home/Visit'

export default function Home() {
  return (
    <>
      <Specials />
      <Finds />
      <ShopByCategory />
      <ThriftPlusBand />
      <Coming />
      <HowItWorks />
      <Visit />
      <Footer />
    </>
  )
}
