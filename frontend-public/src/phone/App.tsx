/**
 * The phone site's routes (PLAN.md "Paths the phone site owns"). Home is in the entry; every other page is lazy().
 * A page a later piece builds points at pages/_Soon until then: swap its import, nothing else.
 * Since the owner's "go 100%" (11-19): every customer path is here. Only the online store's own pages (/shop, /hold;
 * switched off) stay on the current site: link to those with a plain <a href>, never a <Link>.
 */
import { lazy, Suspense, useEffect, useLayoutEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import Home from './pages/Home'
import { loadStockSoon } from './lib/stock'
import { BottomBar } from './shell/BottomBar'
import { Prompts } from './shell/Prompts'
import { TopBar } from './shell/TopBar'

const Store = lazy(() => import('./pages/Store'))
const Item = lazy(() => import('./pages/Item'))
const Categories = lazy(() => import('./pages/Categories'))
const ThriftPlus = lazy(() => import('./pages/ThriftPlus'))
const About = lazy(() => import('./pages/About'))
const Questions = lazy(() => import('./pages/Questions'))
const Returns = lazy(() => import('./pages/Returns'))
const Careers = lazy(() => import('./pages/Careers'))
const CareerRole = lazy(() => import('./pages/CareerRole'))
const CareersApply = lazy(() => import('./pages/CareersApply'))
const CareersInterview = lazy(() => import('./pages/CareersInterview'))
const CareersOffer = lazy(() => import('./pages/CareersOffer'))
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Blog = lazy(() => import('./pages/Blog'))
const BlogPost = lazy(() => import('./pages/BlogPost'))
const SignIn = lazy(() => import('./pages/SignIn'))
const Verify = lazy(() => import('./pages/Verify'))
const Account = lazy(() => import('./pages/Account'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Menu = lazy(() => import('./pages/Menu'))
const ScanApp = lazy(() => import('./scan/ScanApp'))

/** A new page opens at its top; `#id` (and /visit) opens home at that block; Back keeps the browser's own place. */
function Scroll() {
  const { pathname, hash } = useLocation()
  const how = useNavigationType()
  useLayoutEffect(() => {
    const id = hash ? decodeURIComponent(hash.slice(1)) : pathname.replace(/\/$/, '') === '/visit' ? 'visit' : ''
    if (id) {
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ block: 'start' })
        return
      }
    }
    if (how !== 'POP') window.scrollTo(0, 0)
  }, [pathname, hash, how])
  return null
}

export default function App() {
  // The searchable stock loads once, in the background, after the first paint (lib/stock.ts); never while the scanner
  // starts (it never uses it, and in the store a phone is on cellular: Dash Update #185). Leaving /scan starts it then;
  // a page that needs it (the list, an item, the categories) asks for it itself.
  const onScan = useLocation().pathname.replace(/\/$/, '') === '/scan'
  useEffect(() => {
    if (!onScan) loadStockSoon()
  }, [onScan])
  return (
    <div className="ph">
      <Scroll />
      <TopBar />
      <main>
        <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/visit" element={<Home />} />
            <Route path="/store" element={<Store />} />
            <Route path="/store/item/:id" element={<Item />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/thriftplus" element={<ThriftPlus />} />
            <Route path="/thriftplus/warranty" element={<Navigate to="/terms#s8" replace />} />
            <Route path="/thriftplus/*" element={<Navigate to="/terms" replace />} />
            <Route path="/about" element={<About />} />
            <Route path="/questions" element={<Questions />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/careers/apply" element={<CareersApply />} />
            <Route path="/careers/interview" element={<CareersInterview />} />
            <Route path="/careers/offer" element={<CareersOffer />} />
            <Route path="/careers/:slug" element={<CareerRole />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/account/sign-in" element={<SignIn />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/account/*" element={<Account />} />
            <Route path="/scan" element={<ScanApp />} />
            <Route path="/menu" element={<Menu />} />
            <Route path="/sell" element={<Navigate to="/" replace />} />
            <Route path="/order/:number" element={<Navigate to="/visit" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <BottomBar />
      <Prompts />
    </div>
  )
}
