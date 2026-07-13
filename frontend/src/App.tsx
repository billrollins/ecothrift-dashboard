import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { LoadingScreen } from './components/feedback/LoadingScreen';
import MainLayout from './components/layout/MainLayout';
import { ConsigneeLayout } from './components/layout/ConsigneeLayout';

// Standalone full-screen page (its own window, outside MainLayout). Lazy-loaded so the
// TipTap editor bundle never lands in the main staff chunk.
const BlogStudioPage = lazy(() => import('./pages/blog/BlogStudioPage'));

// Full-screen floorplan editor — lazy so the SVG editor bundle stays out of the main chunk.
const FloorplanEditorPage = lazy(() => import('./pages/floorplan/FloorplanEditorPage'));
// TARS Studio owns its browser tab and stays out of the dashboard bundle/chrome.
const TarsPage = lazy(() => import('./pages/restoration/tars/TarsPage'));
import FloorplanListPage from './pages/floorplan/FloorplanListPage';

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
import RestorationsPage from './pages/inventory/restorations/RestorationsPage';
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
import PosPrintablesPage from './pages/pos/PosPrintablesPage';
import DeliveriesPage from './pages/pos/DeliveriesPage';
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
import OnlineSalesWorkQueuePage from './pages/online-sales/OnlineSalesWorkQueuePage';
import OnlineSalesListingsPage from './pages/online-sales/OnlineSalesListingsPage';
import ListingStudioPage from './pages/online-sales/ListingStudioPage';
import OnlineSalesInboxPage from './pages/online-sales/OnlineSalesInboxPage';
import OnlineSalesMarketingPage from './pages/online-sales/OnlineSalesMarketingPage';
import OnlineSalesSalesPage from './pages/online-sales/OnlineSalesSalesPage';
import PermissionsPage from './pages/admin/PermissionsPage';
import SettingsPage from './pages/admin/SettingsPage';
import LabelStudioPage from './pages/admin/labelStudio/LabelStudioPage';
import LabelDesignerPage from './pages/admin/labelStudio/LabelDesignerPage';
import AssumptionsPage from './pages/admin/AssumptionsPage';
import QualityAuditHubPage from './pages/admin/QualityAuditHubPage';
import QualityAuditWizardPage from './pages/admin/QualityAuditWizardPage';
import QualityAuditFormEditorPage from './pages/admin/QualityAuditFormEditorPage';
import QualityAuditFormListPage from './pages/admin/QualityAuditFormListPage';
import AuctionListPage from './pages/buying/AuctionListPage';
import AuctionDetailPage from './pages/buying/AuctionDetailPage';
import WatchlistPage from './pages/buying/WatchlistPage';
import TarsPartsRequestsPage from './pages/restoration/TarsPartsRequestsPage';
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
        <Route path="/inventory/restorations" element={<RestorationsPage />} />
        <Route
          path="/inventory/restoration-returns"
          element={<Navigate to="/inventory/restorations?lane=from" replace />}
        />
        <Route path="/inventory/workbench" element={<InventoryWorkbenchPage />} />
        <Route path="/inventory/manage-products" element={<LegacyManageProductsRedirect />} />
        <Route path="/inventory/manage-items" element={<LegacyManageItemsRedirect />} />
        {/* Legacy Search items — kept for code reference until Find item ships */}
        <Route path="/inventory/items" element={<ItemListPage />} />
        <Route path="/inventory/items/:id" element={<ItemDetailPage />} />
        <Route path="/inventory/inbound" element={<InboundFulfillmentPlaceholderPage />} />
        <Route path="/inventory/quick-reprice" element={<QuickRepricePage />} />
        <Route path="/floor-ops/floorplans" element={<FloorplanListPage />} />
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
        <Route path="/pos/printables" element={<PosPrintablesPage />} />
        <Route path="/pos/deliveries" element={<DeliveriesPage />} />
        <Route path="/buying/auctions" element={<AuctionListPage />} />
        <Route path="/buying/auctions/:id" element={<AuctionDetailPage />} />
        <Route path="/buying/watchlist" element={<WatchlistPage />} />
        <Route path="/restoration" element={<RestorationLayout />}>
          <Route index element={<Navigate to="/restoration/tars" replace />} />
          <Route path="queue" element={<Navigate to="/restoration/tars" replace />} />
          <Route path="tars-2" element={<Navigate to="/restoration/tars" replace />} />
          <Route path="parts-requests" element={<TarsPartsRequestsPage />} />
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
          path="/online-sales"
          element={<ManagerRoute><OnlineSalesWorkQueuePage /></ManagerRoute>}
        />
        <Route
          path="/online-sales/listings"
          element={<ManagerRoute><OnlineSalesListingsPage /></ManagerRoute>}
        />
        <Route
          path="/online-sales/listings/:id"
          element={<ManagerRoute><ListingStudioPage /></ManagerRoute>}
        />
        <Route
          path="/online-sales/inbox"
          element={<ManagerRoute><OnlineSalesInboxPage /></ManagerRoute>}
        />
        <Route
          path="/online-sales/marketing"
          element={<ManagerRoute><OnlineSalesMarketingPage /></ManagerRoute>}
        />
        <Route
          path="/online-sales/sales"
          element={<ManagerRoute><OnlineSalesSalesPage /></ManagerRoute>}
        />
        <Route path="/admin/web-store" element={<Navigate to="/online-sales/listings" replace />} />
        <Route path="/admin/web-orders" element={<Navigate to="/online-sales/inbox" replace />} />
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
          path="/admin/label-studio"
          element={
            <ManagerRoute>
              <LabelStudioPage />
            </ManagerRoute>
          }
        />
        <Route
          path="/admin/label-studio/:id"
          element={
            <ManagerRoute>
              <LabelDesignerPage />
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
        <Route
          path="/admin/quality-audit"
          element={
            <ManagerRoute>
              <QualityAuditHubPage />
            </ManagerRoute>
          }
        />
        <Route
          path="/admin/quality-audit/run/:formSlug/:auditId"
          element={
            <ManagerRoute>
              <QualityAuditWizardPage />
            </ManagerRoute>
          }
        />
        <Route
          path="/admin/quality-audit/forms"
          element={
            <SuperAdminRoute>
              <QualityAuditFormListPage />
            </SuperAdminRoute>
          }
        />
        <Route
          path="/admin/quality-audit/forms/new"
          element={
            <SuperAdminRoute>
              <QualityAuditFormEditorPage />
            </SuperAdminRoute>
          }
        />
        <Route
          path="/admin/quality-audit/forms/:formId"
          element={
            <SuperAdminRoute>
              <QualityAuditFormEditorPage />
            </SuperAdminRoute>
          }
        />
        <Route
          path="/admin/quality-audit/retail/:auditId"
          element={<Navigate to="/admin/quality-audit" replace />}
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

      {/* Floorplan editor — full-screen (no dashboard chrome) so the canvas owns the window */}
      <Route
        path="/floor-ops/floorplans/:id/edit"
        element={
          <ProtectedRoute>
            <StaffRoute>
              <Suspense fallback={<LoadingScreen message="Loading floorplan editor…" />}>
                <FloorplanEditorPage />
              </Suspense>
            </StaffRoute>
          </ProtectedRoute>
        }
      />

      {/* TARS Studio — full-screen staff work app in its own tab. */}
      <Route
        path="/restoration/tars"
        element={
          <ProtectedRoute>
            <StaffRoute>
              <Suspense fallback={<LoadingScreen message="Loading TARS Studio…" />}>
                <TarsPage />
              </Suspense>
            </StaffRoute>
          </ProtectedRoute>
        }
      />

      {/* Redirects */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
