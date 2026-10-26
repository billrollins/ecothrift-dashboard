import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { isStaffRole } from './auth/roles';
import { useAuth } from './contexts/AuthContext';
import { LoadingScreen } from './components/feedback/LoadingScreen';
import MainLayout from './components/layout/MainLayout';
import { ConsigneeLayout } from './components/layout/ConsigneeLayout';

// Standalone full-screen page (its own window, outside MainLayout). Lazy-loaded so the
// TipTap editor bundle never lands in the main staff chunk.
const BlogStudioPage = lazy(() => import('./pages/blog/BlogStudioPage'));
const AnnouncementEditorPage = lazy(() => import('./pages/announcements/AnnouncementEditorPage'));

// Full-screen floorplan editor - lazy so the SVG editor bundle stays out of the main chunk.
const FloorplanEditorPage = lazy(() => import('./pages/floorplan/FloorplanEditorPage'));
// Time kiosk: hosted (/kiosk, staff JWT) and public (/clock, no login). Both own the window.
const KioskPage = lazy(() => import('./pages/kiosk/KioskPage'));
const ClockPage = lazy(() => import('./pages/kiosk/ClockPage'));
// Thrift+ price scanner: the customer web app (mock). Public, its own sign-in, owns the window.
const ThriftPlusScannerPage = lazy(() => import('./pages/thriftplus/scanner/ThriftPlusScannerPage'));
// Thrift+ Staff (owner 2026-10-16): the store phones' app at /staff (Finalize, Members, Scan, Join QR).
const StaffApp = lazy(() => import('./pages/thriftplus/staff/StaffApp'));
// Social Studio (owner 2026-10-22): the phone app at /social (Post, Photos, Scan, Schedule, Me).
const SocialApp = lazy(() => import('./pages/studios/social/SocialApp'));
const BstockLoginHandoffPage = lazy(() => import('./pages/routines/BstockLoginHandoffPage'));
const CountPage = lazy(() => import('./pages/inventory/count/CountPage'));
const InventoriesPage = lazy(() => import('./pages/inventory/count/InventoriesPage'));
const InventoryPage = lazy(() => import('./pages/inventory/count/InventoryPage'));
const PrFixitPage = lazy(() => import('./pages/inventory/count/PrFixitPage'));
const TagErrorsPage = lazy(() => import('./pages/inventory/tagErrors/TagErrorsPage'));
const ApplicantsPage = lazy(() => import('./pages/people/ApplicantsPage'));
const JobsPage = lazy(() => import('./pages/people/JobsPage'));
const InterviewsPage = lazy(() => import('./pages/people/InterviewsPage'));
const EmailsPage = lazy(() => import('./pages/people/EmailsPage'));
const OnboardingPage = lazy(() => import('./pages/people/OnboardingPage'));
const MyOnboardingPage = lazy(() => import('./pages/people/MyOnboardingPage'));
const PayrollDeductionsPage = lazy(() => import('./pages/people/PayrollDeductionsPage'));
const CheckInsPage = lazy(() => import('./pages/people/CheckInsPage'));
const SchedulePage = lazy(() => import('./pages/people/SchedulePage'));
const MyCheckInsPage = lazy(() => import('./pages/people/MyCheckInsPage'));
const MePage = lazy(() => import('./pages/me/MePage'));
const MessagesPage = lazy(() => import('./pages/messages/MessagesPage'));
const FloorplanListPage = lazy(() => import('./pages/floorplan/FloorplanListPage'));

// Pages
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const RoutinesPage = lazy(() => import('./pages/routines/RoutinesPage'));
import { PendingBstockLoginNotice } from './pages/routines/runners/PendingBstockLoginNotice';
const TodayPage = lazy(() => import('./pages/routines/TodayPage'));
const TimePayrollPage = lazy(() => import('./pages/admin/TimePayrollPage'));
const EnhancementRequestsPage = lazy(() => import('./pages/admin/EnhancementRequestsPage'));
const IconsPage = lazy(() => import('./pages/admin/IconsPage'));
const KeysPage = lazy(() => import('./pages/admin/keys/KeysPage'));
const AdminRoutinesPage = lazy(() => import('./pages/admin/routines/AdminRoutinesPage'));
const RetailQaPage = lazy(() => import('./pages/admin/retailqa/RetailQaPage'));
const ShiftsPage = lazy(() => import('./pages/admin/ShiftsPage'));
const DepartmentsPage = lazy(() => import('./pages/admin/departments/DepartmentsPage'));
const DepartmentDetailPage = lazy(() => import('./pages/admin/departments/DepartmentDetailPage'));
const VendorListPage = lazy(() => import('./pages/inventory/VendorListPage'));
const VendorDetailPage = lazy(() => import('./pages/inventory/VendorDetailPage'));
const OrderListPage = lazy(() => import('./pages/inventory/OrderListPage'));
const ReceivingEntryRedirect = lazy(() => import('./pages/inventory/ReceivingEntryRedirect'));
const ReceivingOrderPage = lazy(() => import('./pages/inventory/ReceivingOrderPage'));
const PreprocessingPage = lazy(() => import('./pages/inventory/PreprocessingPage'));
const ProcessingEntryRedirect = lazy(() => import('./pages/inventory/ProcessingEntryRedirect'));
const ProcessingWorkspacePage = lazy(() => import('./pages/inventory/processing/ProcessingWorkspacePage'));
const TruckFinalizePage = lazy(() => import('./pages/inventory/truck/TruckFinalizePage'));
const RestorationsPage = lazy(() => import('./pages/inventory/restorations/RestorationsPage'));
const InventorySearchPage = lazy(() => import('./pages/inventory/InventorySearchPage'));
const InventoryReviewPage = lazy(() => import('./pages/inventory/InventoryReviewPage'));
const LegacyWorkbenchRedirect = lazy(() =>
  import('./pages/inventory/InventorySearchPage').then((m) => ({ default: m.LegacyWorkbenchRedirect })),
);
const ProductPage = lazy(() => import('./pages/inventory/ProductPage'));
import { landingPath } from './utils/landing';
const TerminalPage = lazy(() => import('./pages/pos/TerminalPage'));
const TestTerminalPage = lazy(() => import('./pages/pos/TestTerminalPage'));
const DrawerListPage = lazy(() => import('./pages/pos/DrawerListPage'));
const ReturnsPage = lazy(() => import('./pages/pos/ReturnsPage'));
const CashManagementPage = lazy(() => import('./pages/pos/CashManagementPage'));
const TransactionListPage = lazy(() => import('./pages/pos/TransactionListPage'));
const PosPrintablesPage = lazy(() => import('./pages/pos/PosPrintablesPage'));
const MembersLookupPage = lazy(() => import('./pages/pos/MembersLookupPage'));
const DeliveriesEntryRedirect = lazy(() => import('./pages/pos/deliveries/DeliveriesEntryRedirect'));
const DeliveryExperienceLayout = lazy(() => import('./pages/pos/deliveries/DeliveryExperienceLayout'));
const DeskDaysPage = lazy(() => import('./pages/pos/deliveries/desk/DeskDaysPage'));
const DeskDayDetailPage = lazy(() => import('./pages/pos/deliveries/desk/DeskDayDetailPage'));
const DeskTotalDeliveriesPage = lazy(() => import('./pages/pos/deliveries/desk/DeskTotalDeliveriesPage'));
const FieldDaysLandingPage = lazy(() => import('./pages/pos/deliveries/field/FieldDaysLandingPage'));
const FieldDayDetailPage = lazy(() => import('./pages/pos/deliveries/field/FieldDayDetailPage'));
const FieldTotalDeliveriesPage = lazy(() => import('./pages/pos/deliveries/field/FieldTotalDeliveriesPage'));
const PosStoreSetupPage = lazy(() => import('./pages/admin/PosStoreSetupPage'));
const ConsignmentAccountsPage = lazy(() => import('./pages/consignment/AccountsPage'));
const ConsigneeDetailPage = lazy(() => import('./pages/consignment/ConsigneeDetailPage'));
const ConsignmentItemsPage = lazy(() => import('./pages/consignment/ItemsPage'));
const ConsignmentPayoutsPage = lazy(() => import('./pages/consignment/PayoutsPage'));
const ConsigneeItemsPage = lazy(() => import('./pages/consignee/MyItemsPage'));
const ConsigneePayoutsPage = lazy(() => import('./pages/consignee/MyPayoutsPage'));
const ConsigneeSummaryPage = lazy(() => import('./pages/consignee/SummaryPage'));
const UsersPage = lazy(() => import('./pages/admin/users/UsersPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const LabelStudioPage = lazy(() => import('./pages/admin/labelStudio/LabelStudioPage'));
const LabelDesignerPage = lazy(() => import('./pages/admin/labelStudio/LabelDesignerPage'));
const AuctionListPage = lazy(() => import('./pages/buying/AuctionListPage'));
const AuctionDetailPage = lazy(() => import('./pages/buying/AuctionDetailPage'));
const WatchlistPage = lazy(() => import('./pages/buying/WatchlistPage'));
const WishListPage = lazy(() => import('./pages/buying/WishListPage'));
const ReportCardsPage = lazy(() => import('./pages/buying/ReportCardsPage'));
const RequestsPage = lazy(() => import('./pages/admin/RequestsPage'));
const QAPage = lazy(() => import('./pages/admin/QAPage'));
const ThriftPlusPage = lazy(() => import('./pages/thriftplus/ThriftPlusPage'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const OwnerPage = lazy(() => import('./pages/owner/OwnerPage'));
const PartsCommandCenterPage = lazy(() => import('./pages/restoration/parts/PartsCommandCenterPage'));
const RestorationQueuePage = lazy(() => import('./pages/restoration/queue/RestorationQueuePage'));
const RestorationBenchPage = lazy(() => import('./pages/restoration/RestorationBenchPage'));
const RestorationTrackingPage = lazy(() => import('./pages/restoration/tracking/RestorationTrackingPage'));
const RestorationLayout = lazy(() => import('./pages/restoration/RestorationLayout'));
const TarsStudioRedirect = lazy(() => import('./pages/restoration/TarsStudioRedirect'));
const OnlineSalesListingsPage = lazy(() => import('./pages/online-sales/OnlineSalesListingsPage'));
const ListingStudioPage = lazy(() => import('./pages/online-sales/ListingStudioPage'));
const OnlineSalesHoldsPage = lazy(() => import('./pages/online-sales/OnlineSalesHoldsPage'));
const OnlineSalesMessagesPage = lazy(() => import('./pages/online-sales/OnlineSalesMessagesPage'));
const AnnouncementsPage = lazy(() => import('./pages/announcements/AnnouncementsPage'));
const SocialStudioPage = lazy(() => import('./pages/studios/social/SocialStudioPage'));
const SocialPhotosPage = lazy(() => import('./pages/studios/social/SocialPhotosPage'));
const SocialNumbersPage = lazy(() => import('./pages/studios/social/SocialNumbersPage'));
const SocialPostEditorPage = lazy(() => import('./pages/studios/social/SocialPostEditorPage'));

function ProtectedRoute({ children, next, version }: { children: React.ReactNode; next?: string; version?: boolean }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen message="Loading..." version={version} />;
  if (!isAuthenticated) return <Navigate to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} replace />;
  return <>{children}</>;
}

function StaffRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'Consignee') return <Navigate to="/consignee" replace />;
  if (isStaffRole(user?.role)) return <>{children}</>;
  return <Navigate to="/login" replace />;
}

/** Thrift+ Staff behind the staff sign-in; signing in comes back to the tab that was opened. */
function StaffAppGate() {
  const location = useLocation();
  return (
    <ProtectedRoute next={`${location.pathname}${location.search}`}>
      <StaffRoute>
        <Suspense fallback={<LoadingScreen message="Loading…" />}>
          <StaffApp />
        </Suspense>
      </StaffRoute>
    </ProtectedRoute>
  );
}

/** Social Studio's phone app behind the staff sign-in; signing in comes back to the tab that was opened. */
function SocialAppGate() {
  const location = useLocation();
  return (
    <ProtectedRoute next={`${location.pathname}${location.search}`}>
      <StaffRoute>
        <Suspense fallback={<LoadingScreen message="Loading…" />}>
          <SocialApp />
        </Suspense>
      </StaffRoute>
    </ProtectedRoute>
  );
}

/** `/` and unknown URLs: a cashier on a register goes to the Terminal, everyone else to the Dashboard. */
function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={landingPath(user)} replace />;
}

function ManagerRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.role || !['Admin', 'Manager'].includes(user.role))
    return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** Old count links (Sessions, Report, Not found) open the inventory's page on the matching tab (2026-10-06). */
function LegacyCountRedirect({ tab }: { tab?: string }) {
  const { id } = useParams();
  if (!id) return <Navigate to="/inventory/inventories" replace />;
  return <Navigate to={`/inventory/inventories/${id}${tab ? `?tab=${tab}` : ''}`} replace />;
}

function LegacyQuickRepriceRedirect() {
  const [params] = useSearchParams();
  const sku = params.get('sku');
  return <Navigate to={`/inventory/pr-fixit?tab=reprice${sku ? `&sku=${encodeURIComponent(sku)}` : ''}`} replace />;
}

/** The owner (superuser) or an Admin. */
function OwnerOrAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.is_superuser && user?.role !== 'Admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.is_superuser) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* Public clock: the door tablet. No login, no sidebar, card is the only identity. */}
      <Route
        path="/clock"
        element={
          <Suspense fallback={<LoadingScreen message="Loading…" />}>
            <ClockPage />
          </Suspense>
        }
      />

      {/* Thrift+ price scanner (customer app, mock). /scan is the address on signs. */}
      <Route
        path="/scan"
        element={
          <Suspense fallback={<LoadingScreen message="Loading…" version />}>
            <ThriftPlusScannerPage />
          </Suspense>
        }
      />

      {/* Staff routes */}
      <Route
        element={
          <ProtectedRoute>
            <StaffRoute>
              <MainLayout />
              <PendingBstockLoginNotice />
            </StaffRoute>
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/today" element={<TodayPage />} />
        {/* Staff messages (owner 2026-10-21): the envelope in the top bar opens these. */}
        {['/messages', '/messages/:id'].map((path) => (
          <Route
            key={path}
            path={path}
            element={
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <MessagesPage />
              </Suspense>
            }
          />
        ))}
        <Route
          path="/me"
          element={
            <Suspense fallback={<LoadingScreen message="Loading…" />}>
              <MePage />
            </Suspense>
          }
        />
        <Route
          path="/check-ins"
          element={
            <Suspense fallback={<LoadingScreen message="Loading…" />}>
              <MyCheckInsPage />
            </Suspense>
          }
        />
        <Route
          path="/onboarding"
          element={
            <Suspense fallback={<LoadingScreen message="Loading…" />}>
              <MyOnboardingPage />
            </Suspense>
          }
        />
        <Route path="/routines" element={<RoutinesPage />} />
        <Route path="/routines/catalog" element={<RoutinesPage />} />
        <Route path="/routines/new" element={<SuperAdminRoute><RoutinesPage /></SuperAdminRoute>} />
        <Route path="/routines/:id/edit" element={<SuperAdminRoute><RoutinesPage /></SuperAdminRoute>} />
        <Route path="/routines/run/:id" element={<RoutinesPage />} />
        <Route
          path="/routines/bstock-login"
          element={
            // Not SuperAdminRoute: the page itself tells a non-owner staff user why, and drops the token.
            <Suspense fallback={<LoadingScreen message="Loading…" />}>
              <BstockLoginHandoffPage />
            </Suspense>
          }
        />
        {/* Hours & pay live on Today; /pay opens it expanded. */}
        <Route path="/pay" element={<Navigate to="/today?hours=1" replace />} />
        <Route path="/hr/sick-leave" element={<Navigate to="/dashboard" replace />} />
        <Route path="/inventory/vendors" element={<VendorListPage />} />
        <Route path="/inventory/vendors/:id" element={<VendorDetailPage />} />
        <Route path="/inventory/orders" element={<OrderListPage />} />
        {/* An order opens as a modal over the list (intake_updates Phase 2). */}
        <Route path="/inventory/orders/:id" element={<OrderListPage />} />
        <Route path="/inventory/orders/:id/truck" element={<TruckFinalizePage />} />
        <Route path="/inventory/receiving" element={<ReceivingEntryRedirect />} />
        <Route path="/inventory/receiving/:id" element={<ReceivingOrderPage />} />
        <Route path="/inventory/preprocessing" element={<PreprocessingPage />} />
        <Route path="/inventory/preprocessing/:id" element={<PreprocessingPage />} />
        <Route path="/inventory/processing" element={<ProcessingEntryRedirect />} />
        <Route path="/inventory/processing/:id" element={<ProcessingWorkspacePage />} />
        <Route path="/inventory/restorations" element={<RestorationsPage />} />
        <Route path="/inventory/search" element={<InventorySearchPage />} />
        <Route path="/inventory/review" element={<InventoryReviewPage />} />
        <Route path="/inventory/products/:id" element={<ProductPage />} />
        {/* The old Catalog page: its links land on Inventory search with the same thing open. */}
        <Route path="/inventory/workbench" element={<LegacyWorkbenchRedirect />} />
        {/* Quick reprice lives in PR Fix-it (2026-10-02); old links land on its tab. */}
        <Route path="/inventory/quick-reprice" element={<LegacyQuickRepriceRedirect />} />
        {/* The review queue is closed (2026-10-02): products get the standard at intake and from the pipeline. */}
        <Route path="/inventory/product-review" element={<Navigate to="/inventory/search" replace />} />
        <Route
          path="/inventory/count"
          element={
            <Suspense fallback={<LoadingScreen message="Loading…" />}>
              <CountPage />
            </Suspense>
          }
        />
        <Route
          path="/inventory/inventories"
          element={
            <ManagerRoute>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <InventoriesPage />
              </Suspense>
            </ManagerRoute>
          }
        />
        <Route
          path="/inventory/inventories/:id"
          element={
            <ManagerRoute>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <InventoryPage />
              </Suspense>
            </ManagerRoute>
          }
        />
        <Route path="/inventory/count/days" element={<LegacyCountRedirect />} />
        <Route path="/inventory/count/days/:id" element={<LegacyCountRedirect tab="sessions" />} />
        <Route
          path="/inventory/pr-fixit"
          element={
            <Suspense fallback={<LoadingScreen message="Loading…" />}>
              <PrFixitPage />
            </Suspense>
          }
        />
        <Route
          path="/inventory/tag-errors"
          element={
            <Suspense fallback={<LoadingScreen message="Loading…" />}>
              <TagErrorsPage />
            </Suspense>
          }
        />
        <Route path="/inventory/count/:id/shrink" element={<LegacyCountRedirect tab="shrinkage" />} />
        <Route path="/inventory/count/:id/report" element={<LegacyCountRedirect />} />
        <Route path="/floor-ops/floorplans" element={<FloorplanListPage />} />
        <Route path="/pos/terminal" element={<TerminalPage />} />
        <Route path="/pos/test" element={<TestTerminalPage />} />
        <Route path="/pos/drawers" element={<DrawerListPage />} />
        <Route path="/pos/cash" element={<CashManagementPage />} />
        <Route path="/pos/transactions" element={<TransactionListPage />} />
        <Route path="/pos/members" element={<MembersLookupPage />} />
        <Route path="/pos/returns" element={<ReturnsPage />} />
        <Route path="/pos/printables" element={<PosPrintablesPage />} />
        <Route path="/pos/deliveries" element={<DeliveriesEntryRedirect />} />
        <Route path="/pos/deliveries/schedule" element={<DeliveriesEntryRedirect page="schedule" />} />
        <Route path="/pos/deliveries/table" element={<DeliveriesEntryRedirect page="table" />} />
        <Route path="/pos/deliveries/desk" element={<DeliveryExperienceLayout experience="desk" />}>
          <Route path="schedule" element={<DeskDaysPage />} />
          <Route path="schedule/:dayId" element={<DeskDayDetailPage />} />
          <Route path="table" element={<DeskTotalDeliveriesPage />} />
        </Route>
        <Route path="/pos/deliveries/field" element={<DeliveryExperienceLayout experience="field" />}>
          <Route path="schedule" element={<FieldDaysLandingPage />} />
          <Route path="schedule/:dayId" element={<FieldDayDetailPage />} />
          <Route path="table" element={<FieldTotalDeliveriesPage />} />
        </Route>
        <Route path="/buying/auctions" element={<AuctionListPage />} />
        <Route path="/buying/auctions/:id" element={<AuctionDetailPage />} />
        <Route path="/buying/watchlist" element={<WatchlistPage />} />
        <Route path="/buying/wishlist" element={<WishListPage />} />
        <Route path="/buying/report-cards" element={<ReportCardsPage />} />
        <Route path="/restoration" element={<RestorationLayout />}>
          <Route index element={<Navigate to="/restoration/overview" replace />} />
          <Route path="overview" element={<RestorationQueuePage />} />
          <Route path="queue" element={<Navigate to="/restoration/overview" replace />} />
          <Route path="bench" element={<RestorationBenchPage />} />
          <Route path="parts-requests" element={<PartsCommandCenterPage />} />
          <Route path="tracking" element={<RestorationTrackingPage />} />
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
        <Route
          path="/admin/permissions"
          element={<Navigate to="/admin/settings?tab=people&section=permissions" replace />}
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
          path="/brief"
          element={
            <SuperAdminRoute>
              <Navigate to="/owner" replace />
            </SuperAdminRoute>
          }
        />
        <Route
          path="/owner"
          element={
            <SuperAdminRoute>
              <OwnerPage />
            </SuperAdminRoute>
          }
        />
        <Route
          path="/thrift-plus"
          element={
            <SuperAdminRoute>
              <ThriftPlusPage />
            </SuperAdminRoute>
          }
        />
        <Route
          path="/admin/requests"
          element={
            <SuperAdminRoute>
              <RequestsPage />
            </SuperAdminRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <SuperAdminRoute>
              <ReportsPage />
            </SuperAdminRoute>
          }
        />
        <Route
          path="/admin/qa"
          element={
            <SuperAdminRoute>
              <QAPage />
            </SuperAdminRoute>
          }
        />
        <Route
          path="/admin/keys"
          element={
            <OwnerOrAdminRoute>
              <KeysPage />
            </OwnerOrAdminRoute>
          }
        />
        <Route
          path="/admin/icons"
          element={
            <SuperAdminRoute>
              <IconsPage />
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
        <Route
          path="/admin/retail-qa"
          element={
            <ManagerRoute>
              <RetailQaPage />
            </ManagerRoute>
          }
        />
        <Route
          path="/people/applicants"
          element={
            <ManagerRoute>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <ApplicantsPage />
              </Suspense>
            </ManagerRoute>
          }
        />
        <Route
          path="/people/jobs"
          element={
            <ManagerRoute>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <JobsPage />
              </Suspense>
            </ManagerRoute>
          }
        />
        <Route
          path="/people/interviews"
          element={
            <ManagerRoute>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <InterviewsPage />
              </Suspense>
            </ManagerRoute>
          }
        />
        <Route
          path="/people/onboarding"
          element={
            <ManagerRoute>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <OnboardingPage />
              </Suspense>
            </ManagerRoute>
          }
        />
        <Route
          path="/people/schedule"
          element={
            <ManagerRoute>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <SchedulePage />
              </Suspense>
            </ManagerRoute>
          }
        />
        <Route
          path="/people/checkins"
          element={
            <ManagerRoute>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <CheckInsPage />
              </Suspense>
            </ManagerRoute>
          }
        />
        <Route
          path="/people/payroll-deductions"
          element={
            <ManagerRoute>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <PayrollDeductionsPage />
              </Suspense>
            </ManagerRoute>
          }
        />
        <Route
          path="/people/emails"
          element={
            <ManagerRoute>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <EmailsPage />
              </Suspense>
            </ManagerRoute>
          }
        />
        <Route path="/people" element={<Navigate to="/people/applicants" replace />} />
        <Route
          path="/admin/departments"
          element={
            <ManagerRoute>
              <DepartmentsPage />
            </ManagerRoute>
          }
        />
        <Route
          path="/admin/departments/:slug"
          element={
            <ManagerRoute>
              <DepartmentDetailPage />
            </ManagerRoute>
          }
        />
        <Route
          path="/admin/shifts"
          element={
            <ManagerRoute>
              <ShiftsPage />
            </ManagerRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <ManagerRoute>
              <SettingsPage />
            </ManagerRoute>
          }
        />
        {/* Social Studio (Lane F Phase 2): every staff login; the rating inside is the owner's. */}
        <Route
          path="/studios/social"
          element={
            <Suspense fallback={<LoadingScreen message="Loading…" />}>
              <SocialStudioPage />
            </Suspense>
          }
        />
        <Route
          path="/studios/social/photos"
          element={
            <Suspense fallback={<LoadingScreen message="Loading…" />}>
              <SocialPhotosPage />
            </Suspense>
          }
        />
        <Route
          path="/studios/social/numbers"
          element={
            <Suspense fallback={<LoadingScreen message="Loading…" />}>
              <SocialNumbersPage />
            </Suspense>
          }
        />
        <Route
          path="/studios/social/post/:id"
          element={
            <Suspense fallback={<LoadingScreen message="Loading…" />}>
              <SocialPostEditorPage />
            </Suspense>
          }
        />
        <Route
          path="/announcements"
          element={
            <ManagerRoute>
              <AnnouncementsPage />
            </ManagerRoute>
          }
        />
        <Route
          path="/announcements/:id"
          element={
            <ManagerRoute>
              <Suspense fallback={<LoadingScreen message="Loading announcement…" />}>
                <AnnouncementEditorPage />
              </Suspense>
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
          element={<Navigate to="/admin/settings?tab=buying" replace />}
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

      {/* Thrift+ Staff on the store phones (owner 2026-10-16): staff, Employee and up. Full screen, outside MainLayout, so
          it installs as its own home-screen app (scope /staff/) and a customer holding the phone can't wander into Dash.
          Finalize, Members, Scan and Join QR on its bottom bar. The old Finalize address lands in it. */}
      <Route path="/staff/*" element={<StaffAppGate />} />
      <Route path="/thriftplus/finalize" element={<Navigate to="/staff/find" replace />} />

      {/* Social Studio on a phone (owner 2026-10-22): staff, Employee and up. Full screen, outside MainLayout, so it
          installs as its own home-screen app (scope /social/). Post, Photos, Scan, Schedule and Me on its bottom bar. */}
      <Route path="/social/*" element={<SocialAppGate />} />

      {/* Hosted time kiosk - full-bleed, keeps the host's staff JWT, outside MainLayout. */}
      <Route
        path="/kiosk"
        element={
          <ProtectedRoute>
            <StaffRoute>
              <Suspense fallback={<LoadingScreen message="Loading kiosk…" />}>
                <KioskPage />
              </Suspense>
            </StaffRoute>
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


      {/* Redirects */}
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export default function App() {
  // Pages load on demand; this catches any route that suspends outside a layout's own Suspense.
  return (
    <Suspense fallback={<LoadingScreen message="Loading…" />}>
      <AppRoutes />
    </Suspense>
  );
}
