import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { LoadingScreen } from './components/feedback/LoadingScreen';
import MainLayout from './components/layout/MainLayout';
import { ConsigneeLayout } from './components/layout/ConsigneeLayout';

// Standalone full-screen page (its own window, outside MainLayout). Lazy-loaded so the
// TipTap editor bundle never lands in the main staff chunk.
const BlogStudioPage = lazy(() => import('./pages/blog/BlogStudioPage'));

// Pages
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import TimeClockPage from './pages/hr/TimeClockPage';
import TimePayrollPage from './pages/admin/TimePayrollPage';
import VendorListPage from './pages/inventory/VendorListPage';
import VendorDetailPage from './pages/inventory/VendorDetailPage';
import OrderListPage from './pages/inventory/OrderListPage';
import OrderDetailPage from './pages/inventory/OrderDetailPage';
import ReceivingEntryRedirect from './pages/inventory/ReceivingEntryRedirect';
import ReceivingOrderPage from './pages/inventory/ReceivingOrderPage';
import PreprocessingPage from './pages/inventory/PreprocessingPage';
import ProcessingEntryRedirect from './pages/inventory/ProcessingEntryRedirect';
import ProcessingWorkspacePage from './pages/inventory/processing/ProcessingWorkspacePage';
import InventoryWorkbenchPage from './pages/inventory/InventoryWorkbenchPage';
import { inventoryWorkbenchUrl, legacyItemParamsToRichSearch } from './utils/richInventorySearch';
import ItemListPage from './pages/inventory/ItemListPage';
import ItemDetailPage from './pages/inventory/ItemDetailPage';
import QuickRepricePage from './pages/inventory/QuickRepricePage';
import InboundFulfillmentPlaceholderPage from './pages/inventory/InboundFulfillmentPlaceholderPage';
import TerminalPage from './pages/pos/TerminalPage';
import DrawerListPage from './pages/pos/DrawerListPage';
import CashManagementPage from './pages/pos/CashManagementPage';
import TransactionListPage from './pages/pos/TransactionListPage';
import PosStoreSetupPage from './pages/admin/PosStoreSetupPage';
import ConsignmentAccountsPage from './pages/consignment/AccountsPage';
import ConsigneeDetailPage from './pages/consignment/ConsigneeDetailPage';
import ConsignmentItemsPage from './pages/consignment/ItemsPage';
import ConsignmentPayoutsPage from './pages/consignment/PayoutsPage';
import ConsigneeItemsPage from './pages/consignee/MyItemsPage';
import ConsigneePayoutsPage from './pages/consignee/MyPayoutsPage';
import ConsigneeSummaryPage from './pages/consignee/SummaryPage';
import UserListPage from './pages/admin/UserListPage';
import CustomerListPage from './pages/admin/CustomerListPage';
import WebStorePage from './pages/admin/WebStorePage';
import WebOrdersPage from './pages/admin/WebOrdersPage';
import PermissionsPage from './pages/admin/PermissionsPage';
import SettingsPage from './pages/admin/SettingsPage';
import AssumptionsPage from './pages/admin/AssumptionsPage';
import AuctionListPage from './pages/buying/AuctionListPage';
import AuctionDetailPage from './pages/buying/AuctionDetailPage';
import WatchlistPage from './pages/buying/WatchlistPage';
import TarsQueuePage from './pages/restoration/tars/TarsQueuePage';
import TarsPage from './pages/restoration/tars/TarsPage';
import RestorationLayout from './pages/restoration/RestorationLayout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen message="Loading..." />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function StaffRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'Consignee') return <Navigate to="/consignee" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'Admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function ManagerRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.role || !['Admin', 'Manager'].includes(user.role))
    return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function LegacyManageProductsRedirect() {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || searchParams.get('search') || '').trim() || undefined;
  return <Navigate to={inventoryWorkbenchUrl({ q })} replace />;
}

function LegacyManageItemsRedirect() {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || legacyItemParamsToRichSearch(searchParams) || '').trim() || undefined;
  return <Navigate to={inventoryWorkbenchUrl({ tab: 'items', q })} replace />;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.is_superuser) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Staff routes */}
      <Route
        element={
          <ProtectedRoute>
            <StaffRoute>
              <MainLayout />
            </StaffRoute>
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/hr/time-clock" element={<TimeClockPage />} />
        <Route path="/hr/modification-requests" element={<Navigate to="/admin/time-payroll" replace />} />
        <Route path="/hr/time-history" element={<Navigate to="/hr/time-clock" replace />} />
        <Route path="/hr/employees" element={<Navigate to="/admin/users" replace />} />
        <Route path="/hr/employees/:id" element={<Navigate to="/admin/users" replace />} />
        <Route path="/hr/sick-leave" element={<Navigate to="/dashboard" replace />} />
        <Route path="/inventory/vendors" element={<VendorListPage />} />
        <Route path="/inventory/vendors/:id" element={<VendorDetailPage />} />
        <Route path="/inventory/orders" element={<OrderListPage />} />
        <Route path="/inventory/orders/:id" element={<OrderDetailPage />} />
        <Route path="/inventory/receiving" element={<ReceivingEntryRedirect />} />
        <Route path="/inventory/receiving/:id" element={<ReceivingOrderPage />} />
        <Route path="/inventory/preprocessing" element={<PreprocessingPage />} />
        <Route path="/inventory/preprocessing/:id" element={<PreprocessingPage />} />
        <Route path="/inventory/processing" element={<ProcessingEntryRedirect />} />
        <Route path="/inventory/processing/:id" element={<ProcessingWorkspacePage />} />
        <Route path="/inventory/workbench" element={<InventoryWorkbenchPage />} />
        <Route path="/inventory/manage-products" element={<LegacyManageProductsRedirect />} />
        <Route path="/inventory/manage-items" element={<LegacyManageItemsRedirect />} />
        {/* Legacy Search items — kept for code reference until Find item ships */}
        <Route path="/inventory/items" element={<ItemListPage />} />
        <Route path="/inventory/items/:id" element={<ItemDetailPage />} />
        <Route path="/inventory/inbound" element={<InboundFulfillmentPlaceholderPage />} />
        <Route path="/inventory/quick-reprice" element={<QuickRepricePage />} />
        <Route path="/inventory/inbound/receiving" element={<Navigate to="/inventory/receiving" replace />} />
        <Route
          path="/inventory/inbound/finalization"
          element={<Navigate to="/inventory/inbound?view=finalization" replace />}
        />
        <Route path="/inventory/inbound/disputes" element={<Navigate to="/inventory/inbound?view=disputes" replace />} />
        <Route path="/pos/terminal" element={<TerminalPage />} />
        <Route path="/pos/drawers" element={<DrawerListPage />} />
        <Route path="/pos/cash" element={<CashManagementPage />} />
        <Route path="/pos/transactions" element={<TransactionListPage />} />
        <Route path="/buying/auctions" element={<AuctionListPage />} />
        <Route path="/buying/auctions/:id" element={<AuctionDetailPage />} />
        <Route path="/buying/watchlist" element={<WatchlistPage />} />
        <Route path="/restoration" element={<RestorationLayout />}>
          <Route index element={<Navigate to="/restoration/queue" replace />} />
          <Route path="queue" element={<TarsQueuePage />} />
          <Route path="tars" element={<TarsPage />} />
        </Route>
        <Route
          path="/admin/pos-setup"
          element={
            <ManagerRoute>
              <PosStoreSetupPage />
            </ManagerRoute>
          }
        />
        <Route
          path="/consignment/accounts"
          element={<ManagerRoute><ConsignmentAccountsPage /></ManagerRoute>}
        />
        <Route
          path="/consignment/accounts/:id"
          element={<ManagerRoute><ConsigneeDetailPage /></ManagerRoute>}
        />
        <Route
          path="/consignment/items"
          element={<ManagerRoute><ConsignmentItemsPage /></ManagerRoute>}
        />
        <Route
          path="/consignment/payouts"
          element={<ManagerRoute><ConsignmentPayoutsPage /></ManagerRoute>}
        />
        <Route
          path="/admin/users"
          element={<AdminRoute><UserListPage /></AdminRoute>}
        />
        <Route
          path="/admin/customers"
          element={<AdminRoute><CustomerListPage /></AdminRoute>}
        />
        <Route
          path="/admin/web-store"
          element={<ManagerRoute><WebStorePage /></ManagerRoute>}
        />
        <Route
          path="/admin/web-orders"
          element={<ManagerRoute><WebOrdersPage /></ManagerRoute>}
        />
        <Route
          path="/admin/permissions"
          element={<AdminRoute><PermissionsPage /></AdminRoute>}
        />
        <Route
          path="/admin/time-payroll"
          element={
            <SuperAdminRoute>
              <TimePayrollPage />
            </SuperAdminRoute>
          }
        />
        <Route path="/admin/payroll-hours" element={<Navigate to="/admin/time-payroll" replace />} />
        <Route
          path="/admin/settings"
          element={
            <ManagerRoute>
              <SettingsPage />
            </ManagerRoute>
          }
        />
        <Route
          path="/admin/assumptions"
          element={
            <ManagerRoute>
              <AssumptionsPage />
            </ManagerRoute>
          }
        />
      </Route>

      {/* Consignee portal routes */}
      <Route
        element={
          <ProtectedRoute>
            <ConsigneeLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/consignee" element={<ConsigneeSummaryPage />} />
        <Route path="/consignee/items" element={<ConsigneeItemsPage />} />
        <Route path="/consignee/payouts" element={<ConsigneePayoutsPage />} />
      </Route>

      {/* Blog Studio — standalone full-screen (Super Admin only), outside MainLayout so it
          owns the whole window with no dashboard chrome (matches the mockup). */}
      <Route
        path="/blog-studio"
        element={
          <ProtectedRoute>
            <SuperAdminRoute>
              <Suspense fallback={<LoadingScreen message="Loading Blog Studio…" />}>
                <BlogStudioPage />
              </Suspense>
            </SuperAdminRoute>
          </ProtectedRoute>
        }
      />

      {/* Redirects */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
