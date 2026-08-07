import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import { useOnlineSalesConfig } from './onlineSalesConfig'

// Code-split the less-frequent routes so the landing page ships a small bundle.
const BlogPage = lazy(() => import('./pages/BlogPage'))
const BlogPostPage = lazy(() => import('./pages/BlogPostPage'))
const VisitPage = lazy(() => import('./pages/VisitPage'))
const SellPage = lazy(() => import('./pages/SellPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const ShopPage = lazy(() => import('./pages/ShopPage'))
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'))
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'))
const HoldStatusPage = lazy(() => import('./pages/HoldStatusPage'))
const HoldLinkExpiredPage = lazy(() => import('./pages/HoldLinkExpiredPage'))
const SignInPage = lazy(() => import('./pages/SignInPage'))
const VerifyPage = lazy(() => import('./pages/VerifyPage'))
const AccountLayout = lazy(() => import('./pages/account/AccountLayout'))
const AccountOverviewPage = lazy(() => import('./pages/account/AccountOverviewPage'))
const AccountHistoryPage = lazy(() => import('./pages/account/AccountHistoryPage'))
const AccountMessagesPage = lazy(() => import('./pages/account/AccountMessagesPage'))

function RouteFallback() {
  return (
    <div className="wrap" aria-busy="true">
      <div className="pagehead">
        <span className="skline" style={{ width: 220 }} />
      </div>
    </div>
  )
}

function ShopRoute({ children }: { children: React.ReactNode }) {
  const { config, loading } = useOnlineSalesConfig()
  if (loading) return <RouteFallback />
  if (!config.online_sales_enabled) return <Navigate to="/visit" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route
          path="shop"
          element={
            <ShopRoute>
              <Suspense fallback={<RouteFallback />}>
                <ShopPage />
              </Suspense>
            </ShopRoute>
          }
        />
        <Route
          path="shop/:slug"
          element={
            <ShopRoute>
              <Suspense fallback={<RouteFallback />}>
                <ProductDetailPage />
              </Suspense>
            </ShopRoute>
          }
        />
        <Route
          path="checkout"
          element={
            <ShopRoute>
              <Suspense fallback={<RouteFallback />}>
                <CheckoutPage />
              </Suspense>
            </ShopRoute>
          }
        />
        <Route
          path="hold/:token"
          element={
            <Suspense fallback={<RouteFallback />}>
              <HoldStatusPage />
            </Suspense>
          }
        />
        <Route
          path="hold-link-expired"
          element={
            <Suspense fallback={<RouteFallback />}>
              <HoldLinkExpiredPage />
            </Suspense>
          }
        />
        <Route
          path="account/sign-in"
          element={
            <Suspense fallback={<RouteFallback />}>
              <SignInPage />
            </Suspense>
          }
        />
        <Route
          path="verify"
          element={
            <Suspense fallback={<RouteFallback />}>
              <VerifyPage />
            </Suspense>
          }
        />
        <Route
          path="account"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AccountLayout />
            </Suspense>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<RouteFallback />}>
                <AccountOverviewPage />
              </Suspense>
            }
          />
          <Route
            path="history"
            element={
              <Suspense fallback={<RouteFallback />}>
                <AccountHistoryPage />
              </Suspense>
            }
          />
          <Route
            path="messages"
            element={
              <Suspense fallback={<RouteFallback />}>
                <AccountMessagesPage />
              </Suspense>
            }
          />
        </Route>
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
