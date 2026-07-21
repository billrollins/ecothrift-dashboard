import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'

// Code-split the less-frequent routes so the landing page ships a small bundle.
// Shop / holds parked until Online Sales resumes (ONLINE_SALES_ENABLED).
const BlogPage = lazy(() => import('./pages/BlogPage'))
const BlogPostPage = lazy(() => import('./pages/BlogPostPage'))
const VisitPage = lazy(() => import('./pages/VisitPage'))
const SellPage = lazy(() => import('./pages/SellPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function RouteFallback() {
  return (
    <div className="wrap" aria-busy="true">
      <div className="pagehead">
        <span className="skline" style={{ width: 220 }} />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="shop" element={<Navigate to="/visit" replace />} />
        <Route path="shop/:slug" element={<Navigate to="/visit" replace />} />
        <Route path="checkout" element={<Navigate to="/visit" replace />} />
        <Route path="hold/:token" element={<Navigate to="/visit" replace />} />
        <Route path="order/:number" element={<Navigate to="/visit" replace />} />
        <Route
          path="blog"
          element={
            <Suspense fallback={<RouteFallback />}>
              <BlogPage />
            </Suspense>
          }
        />
        <Route
          path="blog/:slug"
          element={
            <Suspense fallback={<RouteFallback />}>
              <BlogPostPage />
            </Suspense>
          }
        />
        <Route
          path="visit"
          element={
            <Suspense fallback={<RouteFallback />}>
              <VisitPage />
            </Suspense>
          }
        />
        <Route
          path="sell"
          element={
            <Suspense fallback={<RouteFallback />}>
              <SellPage />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={
            <Suspense fallback={<RouteFallback />}>
              <NotFoundPage />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  )
}
