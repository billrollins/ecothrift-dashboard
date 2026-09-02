import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { isStaffRole } from './auth/roles';
import { useAuth } from './contexts/AuthContext';
import { LoadingScreen } from './components/feedback/LoadingScreen';
import MainLayout from './components/layout/MainLayout';
import { ConsigneeLayout } from './components/layout/ConsigneeLayout';

// Standalone full-screen page (its own window, outside MainLayout). Lazy-loaded so the
// TipTap editor bundle never lands in the main staff chunk.
const BlogStudioPage = lazy(() => import('./pages/blog/BlogStudioPage'));
const RetailInboxPage = lazy(() => import('./pages/mailbox/RetailInboxPage'));

// Full-screen floorplan editor - lazy so the SVG editor bundle stays out of the main chunk.
const FloorplanEditorPage = lazy(() => import('./pages/floorplan/FloorplanEditorPage'));
// Legacy fullscreen TARS Studio — parked off the sidebar, still out of the main chunk.
const TarsPage = lazy(() => import('./pages/restoration/tars/TarsPage'));
import FloorplanListPage from './pages/floorplan/FloorplanListPage';

// Pages
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import RoutinesPage from './pages/routines/RoutinesPage';
import TimeClockPage from './pages/hr/TimeClockPage';
import TimePayrollPage from './pages/admin/TimePayrollPage';
import EnhancementRequestsPage from './pages/admin/EnhancementRequestsPage';
import AdminRoutinesPage from './pages/admin/routines/AdminRoutinesPage';
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
import TerminalPage from './pages/pos/TerminalPage';
import DrawerListPage from './pages/pos/DrawerListPage';
import CashManagementPage from './pages/pos/CashManagementPage';
import TransactionListPage from './pages/pos/TransactionListPage';
import PosPrintablesPage from './pages/pos/PosPrintablesPage';
import DeliveriesEntryRedirect, {
  LegacyDeliveryDayRedirect,
} from './pages/pos/deliveries/DeliveriesEntryRedirect';
import DeliveryExperienceLayout from './pages/pos/deliveries/DeliveryExperienceLayout';
import DeskDaysPage from './pages/pos/deliveries/desk/DeskDaysPage';
import DeskDayDetailPage from './pages/pos/deliveries/desk/DeskDayDetailPage';
import DeskTotalDeliveriesPage from './pages/pos/deliveries/desk/DeskTotalDeliveriesPage';
import FieldDaysLandingPage from './pages/pos/deliveries/field/FieldDaysLandingPage';
import FieldDayDetailPage from './pages/pos/deliveries/field/FieldDayDetailPage';
import FieldTotalDeliveriesPage from './pages/pos/deliveries/field/FieldTotalDeliveriesPage';
import PosStoreSetupPage from './pages/admin/PosStoreSetupPage';
import ConsignmentAccountsPage from './pages/consignment/AccountsPage';
import ConsigneeDetailPage from './pages/consignment/ConsigneeDetailPage';
import ConsignmentItemsPage from './pages/consignment/ItemsPage';
import ConsignmentPayoutsPage from './pages/consignment/PayoutsPage';
import ConsigneeItemsPage from './pages/consignee/MyItemsPage';
import ConsigneePayoutsPage from './pages/consignee/MyPayoutsPage';
import ConsigneeSummaryPage from './pages/consignee/SummaryPage';
import UsersPage from './pages/admin/users/UsersPage';
import SettingsPage from './pages/admin/SettingsPage';
import LabelStudioPage from './pages/admin/labelStudio/LabelStudioPage';
import LabelDesignerPage from './pages/admin/labelStudio/LabelDesignerPage';
import AuctionListPage from './pages/buying/AuctionListPage';
import AuctionDetailPage from './pages/buying/AuctionDetailPage';
import WatchlistPage from './pages/buying/WatchlistPage';
import PartsCommandCenterPage from './pages/restoration/parts/PartsCommandCenterPage';
import RestorationQueuePage from './pages/restoration/queue/RestorationQueuePage';
import RestorationBenchPage from './pages/restoration/RestorationBenchPage';
import RestorationLayout from './pages/restoration/RestorationLayout';
import TarsStudioRedirect from './pages/restoration/TarsStudioRedirect';
import OnlineSalesListingsPage from './pages/online-sales/OnlineSalesListingsPage';
import ListingStudioPage from './pages/online-sales/ListingStudioPage';
import OnlineSalesHoldsPage from './pages/online-sales/OnlineSalesHoldsPage';
import OnlineSalesMessagesPage from './pages/online-sales/OnlineSalesMessagesPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen message="Loading..." />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function StaffRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'Consignee') return <Navigate to="/consignee" replace />;
  if (isStaffRole(user?.role)) return <>{children}</>;
  return <Navigate to="/login" replace />;
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

/** Old Online Sales Customers/Inbox URLs. Keeps the thread someone was looking at. */
function MessagesRedirect() {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams();
  const q = searchParams.get('q');
  const thread = searchParams.get('thread');
  if (q) next.set('q', q);
  if (thread) next.set('thread', thread);
  const search = next.toString();
  return <Navigate to={`/online-sales/messages${search ? `?${search}` : ''}`} replace />;
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
      <Route path="/reset-password" element={<ResetPasswordPage />} />

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
        <Route path="/routines" element={<RoutinesPage />} />
        <Route path="/routines/catalog" element={<RoutinesPage />} />
        <Route path="/routines/new" element={<SuperAdminRoute><RoutinesPage /></SuperAdminRoute>} />
        <Route path="/routines/:id/edit" element={<SuperAdminRoute><RoutinesPage /></SuperAdminRoute>} />
        <Route path="/routines/run/:id" element={<RoutinesPage />} />
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
        {/* Legacy Search items - kept for code reference until Find item ships */}
        <Route path="/inventory/items" element={<ItemListPage />} />
        <Route path="/inventory/items/:id" element={<ItemDetailPage />} />
        <Route path="/inventory/inbound" element={<Navigate to="/inventory/processing" replace />} />
        <Route path="/inventory/quick-reprice" element={<QuickRepricePage />} />
        <Route path="/floor-ops/floorplans" element={<FloorplanListPage />} />
        <Route path="/inventory/inbound/receiving" element={<Navigate to="/inventory/receiving" replace />} />
        <Route path="/inventory/inbound/finalization" element={<Navigate to="/inventory/processing" replace />} />
        <Route path="/inventory/inbound/disputes" element={<Navigate to="/inventory/processing" replace />} />
        <Route path="/pos/terminal" element={<TerminalPage />} />
        <Route path="/pos/drawers" element={<DrawerListPage />} />
        <Route path="/pos/cash" element={<CashManagementPage />} />
        <Route path="/pos/transactions" element={<TransactionListPage />} />
        <Route path="/pos/printables" element={<PosPrintablesPage />} />
        <Route path="/pos/deliveries" element={<DeliveriesEntryRedirect />} />
        <Route path="/pos/deliveries/schedule" element={<DeliveriesEntryRedirect page="schedule" />} />
        <Route path="/pos/deliveries/table" element={<DeliveriesEntryRedirect page="table" />} />
        <Route path="/pos/deliveries/legacy" element={<Navigate to="/pos/deliveries" replace />} />
        <Route path="/pos/deliveries/desk" element={<DeliveryExperienceLayout experience="desk" />}>
          <Route path="schedule" element={<DeskDaysPage />} />
          <Route path="schedule/:dayId" element={<DeskDayDetailPage />} />
          <Route path="table" element={<DeskTotalDeliveriesPage />} />
          <Route path="days" element={<Navigate to="/pos/deliveries/desk/schedule" replace />} />
          <Route path="days/:dayId" element={<LegacyDeliveryDayRedirect experience="desk" />} />
          <Route path="total" element={<Navigate to="/pos/deliveries/desk/table" replace />} />
        </Route>
        <Route path="/pos/deliveries/field" element={<DeliveryExperienceLayout experience="field" />}>
          <Route path="schedule" element={<FieldDaysLandingPage />} />
          <Route path="schedule/:dayId" element={<FieldDayDetailPage />} />
          <Route path="table" element={<FieldTotalDeliveriesPage />} />
          <Route path="days" element={<Navigate to="/pos/deliveries/field/schedule" replace />} />
          <Route path="days/:dayId" element={<LegacyDeliveryDayRedirect experience="field" />} />
          <Route path="total" element={<Navigate to="/pos/deliveries/field/table" replace />} />
        </Route>
        <Route path="/buying/auctions" element={<AuctionListPage />} />
        <Route path="/buying/auctions/:id" element={<AuctionDetailPage />} />
        <Route path="/buying/watchlist" element={<WatchlistPage />} />
        <Route path="/restoration" element={<RestorationLayout />}>
          <Route index element={<Navigate to="/restoration/overview" replace />} />
          <Route path="overview" element={<RestorationQueuePage />} />
          <Route path="queue" element={<Navigate to="/restoration/overview" replace />} />
          <Route path="bench" element={<RestorationBenchPage />} />
          <Route path="tars-2" element={<Navigate to="/restoration/tars-legacy" replace />} />
          <Route path="parts-requests" element={<PartsCommandCenterPage />} />
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
          element={<ManagerRoute><UsersPage /></ManagerRoute>}
        />
        <Route
          path="/admin/customers"
          element={<Navigate to="/admin/users" replace />}
        />
        <Route
          path="/admin/retail-inbox"
          element={
            <AdminRoute>
              <Suspense fallback={<LoadingScreen message="Loading retail inbox…" />}>
                <RetailInboxPage />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route path="/online-sales" element={<Navigate to="/online-sales/listings" replace />} />
        <Route
          path="/online-sales/listings"
          element={<ManagerRoute><OnlineSalesListingsPage /></ManagerRoute>}
        />
        <Route
          path="/online-sales/listings/:id"
          element={<ManagerRoute><ListingStudioPage /></ManagerRoute>}
        />
        <Route
          path="/online-sales/holds"
          element={<ManagerRoute><OnlineSalesHoldsPage /></ManagerRoute>}
        />
        <Route
          path="/online-sales/messages"
          element={<ManagerRoute><OnlineSalesMessagesPage /></ManagerRoute>}
        />
        {/* The Directory tab moved to Admin > Users; bookmarks land on the inbox. */}
        <Route path="/online-sales/customers" element={<MessagesRedirect />} />
        <Route path="/online-sales/inbox" element={<MessagesRedirect />} />
        <Route
          path="/online-sales/sales"
          element={<Navigate to="/online-sales/holds?tab=completed" replace />}
        />
        <Route path="/online-sales/marketing" element={<Navigate to="/online-sales/listings" replace />} />
        <Route path="/admin/web-store" element={<Navigate to="/online-sales/listings" replace />} />
        <Route path="/admin/web-orders" element={<Navigate to="/online-sales/holds" replace />} />
        <Route
          path="/admin/permissions"
          element={<Navigate to="/admin/settings?tab=permissions" replace />}
        />
        <Route
          path="/admin/time-payroll"
          element={
            <SuperAdminRoute>
              <TimePayrollPage />
            </SuperAdminRoute>
          }
        />
        <Route
          path="/admin/enhancement-requests"
          element={
            <SuperAdminRoute>
              <EnhancementRequestsPage />
            </SuperAdminRoute>
          }
        />
        <Route
          path="/admin/routines"
          element={
            <SuperAdminRoute>
              <AdminRoutinesPage />
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
          element={<Navigate to="/admin/settings?tab=assumptions" replace />}
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

      {/* Blog Studio - standalone full-screen (Super Admin only), outside MainLayout so it
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

      {/* Floorplan editor - full-screen (no dashboard chrome) so the canvas owns the window */}
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

      {/* Old TARS Studio bookmarks: job/bench → in-dashboard bench, else Overview. */}
      <Route
        path="/restoration/tars"
        element={
          <ProtectedRoute>
            <StaffRoute>
              <TarsStudioRedirect />
            </StaffRoute>
          </ProtectedRoute>
        }
      />

      {/* Legacy fullscreen studio — no sidebar link; delete once the floor has moved. */}
      <Route
        path="/restoration/tars-legacy"
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
