/**
 * The desktop site's routes (Dash Update #211): the SAME addresses as the phone site (phone/App.tsx), so a link works on
 * any screen. Home is in the entry; every other page is lazy(). Differences, all because a computer is not a phone:
 * /visit is its own page (on a phone it is home at its Visit block); /scan is the tag-number page (no camera here);
 * /account/sign-in is the desktop sign-in (on a phone it is the scanner's); /menu goes home (the header has it all).
 * Only the online store's own pages (/shop, /hold; switched off) stay on the current site: a plain <a href> to those.
 */
import { lazy, Suspense, useEffect, useLayoutEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import Home from './pages/Home'
import { useDeskDay } from './lib/day'
import { loadStockSoon } from '../phone/lib/stock'
import { Footer } from './shell/Footer'
import { Header } from './shell/Header'

const Store = lazy(() => import('./pages/Store'))
const Item = lazy(() => import('./pages/Item'))
const Categories = lazy(() => import('./pages/Categories'))
const ThriftPlus = lazy(() => import('./pages/ThriftPlus'))
const About = lazy(() => import('./pages/About'))
const Visit = lazy(() => import('./pages/Visit'))
const Questions = lazy(() => import('./pages/Questions'))
const Returns = lazy(() => import('./pages/Returns'))
const Careers = lazy(() => import('./pages/Careers'))
const CareerRole = lazy(() => import('./pages/CareerRole'))
const CareersFlow = lazy(() => import('./pages/CareersFlow'))
const Terms = lazy(() => import('./pages/Docs').then((m) => ({ default: m.TermsPage })))
const Privacy = lazy(() => import('./pages/Docs').then((m) => ({ default: m.PrivacyPage })))
const Blog = lazy(() => import('./pages/Blog'))
const BlogPost = lazy(() => import('./pages/BlogPost'))
const SignIn = lazy(() => import('./pages/SignIn'))
const Verify = lazy(() => import('./pages/Verify'))
const Scan = lazy(() => import('./pages/Scan'))
const NotFound = lazy(() => import('./pages/NotFound'))

/** A new page opens at its top; `#id` opens at that block; Back keeps the browser's own place. */
function Scroll() {
  const { pathname, hash } = useLocation()
  const how = useNavigationType()
  useLayoutEffect(() => {
    const id = hash ? decodeURIComponent(hash.slice(1)) : ''
    if (id) {
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView?.({ block: 'start' })
        return
      }
    }
    if (how !== 'POP') window.scrollTo(0, 0)
  }, [pathname, hash, how])
  return null
}

export default function App() {
  useDeskDay()
  // The searchable stock loads once, in the background, after the first paint (phone/lib/stock.ts).
  useEffect(() => {
    loadStockSoon()
  }, [])
  return (
    <div className="dk">
      <Scroll />
      <Header />
      <main className="dk-main">
        <Suspense fallback={<div style={{ minHeight: '70vh' }} />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/visit" element={<Visit />} />
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
            <Route path="/careers/apply" element={<CareersFlow step="apply" />} />
            <Route path="/careers/interview" element={<CareersFlow step="interview" />} />
            <Route path="/careers/offer" element={<CareersFlow step="offer" />} />
            <Route path="/careers/:slug" element={<CareerRole />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/account/sign-in" element={<SignIn />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/account/*" element={<Navigate to="/thriftplus" replace />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/menu" element={<Navigate to="/" replace />} />
            <Route path="/sell" element={<Navigate to="/" replace />} />
            <Route path="/order/:number" element={<Navigate to="/visit" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}
