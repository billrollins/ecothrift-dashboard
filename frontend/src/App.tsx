import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { isStaffRole } from './auth/roles';
import { useAuth } from './contexts/AuthContext';
import { canAccess, type AccessNeed } from './auth/access';
import { LoadingScreen } from './components/feedback/LoadingScreen';
import MainLayout from './components/layout/MainLayout';
import { ConsigneeLayout } from './components/layout/ConsigneeLayout';

// Standalone full-screen page (its own window, outside MainLayout). Lazy-loaded so the
// TipTap editor bundle never lands in the main staff chunk.
const BlogStudioPage = lazy(() => import('./pages/blog/BlogStudioPage'));
const AnnouncementEditorPage = lazy(() => import('./pages/announcements/AnnouncementEditorPage'));

// Full-screen floorplan editor - lazy so the SVG editor bundle stays out of the main chunk.
const FloorplanEditorPage = lazy(() => import('./pages/floorplan/FloorplanEditorPage'));
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
const PermissionsPage = lazy(() => import('./pages/people/permissions/PermissionsPage'));
const CheckInsPage = lazy(() => import('./pages/people/CheckInsPage'));
const SchedulePage = lazy(() => import('./pages/people/SchedulePage'));
const MyCheckInsPage = lazy(() => import('./pages/people/MyCheckInsPage'));
const MePage = lazy(() => import('./pages/me/MePage'));
const HrPage = lazy(() => import('./pages/hr/HrPage'));
// E-sign (apps/esign from {master}/packages/esign, D22): contractor agreements (#21, owner only), HR documents (#62),
// and the signing screens (a single-use link with no login, or a signed-in signer).
const ContractorsPage = lazy(() => import('./pages/esign/ContractorsPage'));
const EsignTemplateEditor = lazy(() => import('./pages/esign/TemplateEditorPage'));
const EsignBoxEditor = lazy(() => import('./pages/esign/PdfBoxEditor'));
const LinkSignPage = lazy(() => import('./pages/esign/SignPages').then((m) => ({ default: m.LinkSignPage })));
const InAppSignPage = lazy(() => import('./pages/esign/SignPages').then((m) => ({ default: m.InAppSignPage })));
const MessagesPage = lazy(() => import('./pages/messages/MessagesPage'));
const FloorplanListPage = lazy(() => import('./pages/floorplan/FloorplanListPage'));

// Pages
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const RoutinesPage = lazy(() => import('./pages/routines/RoutinesPage'));
import { PendingBstockLoginNotice } from './pages/routines/runners/PendingBstockLoginNotice';
const TimePayrollPage = lazy(() => import('./pages/admin/TimePayrollPage'));
const DashFixesPage = lazy(() => import('./pages/dashFixes/DashFixesPage'));
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
const SuppliesPage = lazy(() => import('./pages/supplies/SuppliesPage'));
const SupplyListPage = lazy(() => import('./pages/supplies/SupplyListPage'));
const SupplyCountPage = lazy(() => import('./pages/supplies/SupplyCountPage'));
const SupplyOrderPage = lazy(() => import('./pages/supplies/SupplyOrderPage'));
const SupplyReceivePage = lazy(() => import('./pages/supplies/SupplyReceivePage'));
const SupplyRequestsPage = lazy(() => import('./pages/supplies/SupplyRequestsPage'));
const LegacyWorkbenchRedirect = lazy(() =>
  import('./pages/inventory/InventorySearchPage').then((m) => ({ default: m.LegacyWorkbenchRedirect })),
);
const ProductPage = lazy(() => import('./pages/inventory/ProductPage'));
import { landingPath } from './utils/landing';
import { EsignOwnerRoute } from './pages/esign/OwnerRoute';
import { CONTRACTOR_SCOPE, HR_SCOPE } from './pages/esign/scope';
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
const EstimateProfitPage = lazy(() => import('./pages/buying/EstimateProfitPage'));
const QAPage = lazy(() => import('./pages/admin/QAPage'));
const ThriftPlusPage = lazy(() => import('./pages/thriftplus/ThriftPlusPage'));
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

/** `/today` is the Dashboard's My day tab now; every query (a routine to run, the hours panel) comes along. */
function TodayRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set('tab', 'myday');
  return <Navigate to={`/dashboard?${next.toString()}`} replace />;
}

/** `/` and unknown URLs: a cashier on a register goes to the Terminal, everyone else to the Dashboard. */
function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={landingPath(user)} replace />;
}

/** A page that needs `need` on People → Permissions (#53): its item(s) and its dial step. */
function AccessRoute({ need, children }: { need: AccessNeed; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!canAccess(user, need)) return <Navigate to="/dashboard" replace />;
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

/** A moved page: same query string (e.g. Reports' ?tab=), new address. */
function KeepSearchRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* The time kiosk was removed (Dash Update #64); old links land on the dashboard. */}
      <Route path="/clock/*" element={<Navigate to="/dashboard" replace />} />
      <Route path="/kiosk/*" element={<Navigate to="/dashboard" replace />} />

      {/* Thrift+ price scanner (customer app, mock). /scan is the address on signs. */}
      <Route
        path="/scan"
        element={
          <Suspense fallback={<LoadingScreen message="Loading…" version />}>
            <ThriftPlusScannerPage />
          </Suspense>
        }
      />

      {/* E-sign: the signer's single-use link (a contractor, anyone outside Dash). No login, no sidebar. */}
      <Route
        path="/sign"
        element={
          <Suspense fallback={<LoadingScreen message="Loading…" />}>
            <LinkSignPage />
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
        <Route path="/today" element={<TodayRedirect />} />
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
        {/* HR (Bill, Dash Updates #56): one HR app on the avatar menu; each tab keeps its page's own access. */}
        <Route
          path="/hr/*"
          element={
            <Suspense fallback={<LoadingScreen message="Loading…" />}>
              <HrPage />
            </Suspense>
          }
        />
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
        <Route path="/routines/new" element={<AccessRoute need={['routines:write', 'admin:full']}><RoutinesPage /></AccessRoute>} />
        <Route path="/routines/:id/edit" element={<AccessRoute need={['routines:write', 'admin:full']}><RoutinesPage /></AccessRoute>} />
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
        <Route path="/pay" element={<Navigate to="/dashboard?tab=myday&hours=1" replace />} />
        <Route path="/hr/sick-leave" element={<Navigate to="/dashboard" replace />} />
        {/* E-sign: a signed-in signer (HR > Requests), and the owner's pages. Contractors stay off the staff side. */}
        <Route path="/hr/sign/:partyId" element={<Suspense fallback={<LoadingScreen message="Loading…" />}><InAppSignPage /></Suspense>} />
        {([['/admin/contractors', <ContractorsPage />],
          ['/admin/contractors/templates/:id', <EsignTemplateEditor scope={CONTRACTOR_SCOPE} />],
          ['/admin/contractors/:id/boxes', <EsignBoxEditor scope={CONTRACTOR_SCOPE} />],
          ['/admin/documents/templates/:id', <EsignTemplateEditor scope={HR_SCOPE} />],
          ['/admin/documents/:id/boxes', <EsignBoxEditor scope={HR_SCOPE} />],
        ] as const).map(([path, page]) => (
          <Route key={path} path={path} element={<EsignOwnerRoute><Suspense fallback={<LoadingScreen message="Loading…" />}>{page}</Suspense></EsignOwnerRoute>} />
        ))}
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
        {/* Supplies (owner, 2026-10-26): lists and the weekly count for everyone; the order is the owner's. */}
        <Route path="/supplies" element={<SuppliesPage />} />
        <Route path="/supplies/count" element={<Navigate to="/supplies" replace />} />
        <Route path="/supplies/lists/:id" element={<SupplyListPage />} />
        <Route path="/supplies/count/:id" element={<SupplyCountPage />} />
        <Route path="/supplies/order" element={<AccessRoute need={['supplies:order', 'admin:full']}><SupplyOrderPage /></AccessRoute>} />
        {/* Received and "We need ___" (owner, 2026-10-28): everyone; managers answer requests. */}
        <Route path="/supplies/receive" element={<SupplyReceivePage />} />
        <Route path="/supplies/requests" element={<SupplyRequestsPage />} />
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
            <AccessRoute need={['inventory.inventories:manage', 'inventory:manage']}>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <InventoriesPage />
              </Suspense>
            </AccessRoute>
          }
        />
        <Route
          path="/inventory/inventories/:id"
          element={
            <AccessRoute need={['inventory.inventories:manage', 'inventory:manage']}>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <InventoryPage />
              </Suspense>
            </AccessRoute>
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
        {/* Managers and the owner (Retail 5, #49): a cashier would only meet refusals here. */}
        <Route path="/pos/cash" element={<AccessRoute need={['pos.cash:manage', 'cashier:manage']}><CashManagementPage /></AccessRoute>} />
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
        <Route path="/buying/estimate" element={<EstimateProfitPage />} />
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
            <AccessRoute need={['pos.setup:write', 'cashier:manage']}>
              <PosStoreSetupPage />
            </AccessRoute>
          }
        />
        <Route
          path="/consignment/accounts"
          element={<AccessRoute need={['consignment:manage', 'admin:manage']}><ConsignmentAccountsPage /></AccessRoute>}
        />
        <Route
          path="/consignment/accounts/:id"
          element={<AccessRoute need={['consignment:manage', 'admin:manage']}><ConsigneeDetailPage /></AccessRoute>}
        />
        <Route
          path="/consignment/items"
          element={<AccessRoute need={['consignment:manage', 'admin:manage']}><ConsignmentItemsPage /></AccessRoute>}
        />
        <Route
          path="/consignment/payouts"
          element={<AccessRoute need={['consignment:manage', 'admin:manage']}><ConsignmentPayoutsPage /></AccessRoute>}
        />
        <Route
          path="/admin/users"
          element={<AccessRoute need={['users.staff:manage', 'users.customers:manage', 'people:manage']}><UsersPage /></AccessRoute>}
        />
        <Route path="/online-sales" element={<Navigate to="/online-sales/listings" replace />} />
        <Route
          path="/online-sales/listings"
          element={<AccessRoute need={['online_sales.listings:manage', 'online_sales:manage']}><OnlineSalesListingsPage /></AccessRoute>}
        />
        <Route
          path="/online-sales/listings/:id"
          element={<AccessRoute need={['online_sales.listings:manage', 'online_sales:manage']}><ListingStudioPage /></AccessRoute>}
        />
        <Route
          path="/online-sales/holds"
          element={<AccessRoute need={['online_sales.listings:manage', 'online_sales:manage']}><OnlineSalesHoldsPage /></AccessRoute>}
        />
        <Route
          path="/online-sales/messages"
          element={<AccessRoute need={['online_sales.listings:manage', 'online_sales:manage']}><OnlineSalesMessagesPage /></AccessRoute>}
        />
        <Route
          path="/admin/permissions"
          element={<Navigate to="/people/permissions" replace />}
        />
        <Route
          path="/people/permissions"
          element={
            <AccessRoute need={['people.permissions:read', 'people:manage']}>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <PermissionsPage />
              </Suspense>
            </AccessRoute>
          }
        />
        <Route
          path="/admin/time-payroll"
          element={
            <AccessRoute need={['hr.payroll:read', 'hr.mod_requests:triage', 'admin:full']}>
              <TimePayrollPage />
            </AccessRoute>
          }
        />
        <Route
          path="/brief"
          element={
            <AccessRoute need={['owner.page', 'admin:full']}>
              <Navigate to="/owner" replace />
            </AccessRoute>
          }
        />
        <Route
          path="/owner/*"
          element={
            <AccessRoute need={['owner.page', 'admin:full']}>
              <OwnerPage />
            </AccessRoute>
          }
        />
        <Route
          path="/thrift-plus"
          element={
            <AccessRoute need={['thriftplus:owner', 'cashier:full']}>
              <ThriftPlusPage />
            </AccessRoute>
          }
        />
        {/* Reports and Requests are Owner page tabs since Dash Updates #5; the old addresses keep working. */}
        <Route path="/admin/requests" element={<KeepSearchRedirect to="/owner/approvals" />} />
        <Route path="/reports" element={<KeepSearchRedirect to="/owner/reports" />} />
        <Route
          path="/admin/qa"
          element={
            <AccessRoute need={['owner.page', 'admin:full']}>
              <QAPage />
            </AccessRoute>
          }
        />
        <Route
          path="/admin/keys"
          element={
            <AccessRoute need={['keys:manage', 'admin:full']}>
              <KeysPage />
            </AccessRoute>
          }
        />
        <Route
          path="/admin/icons"
          element={
            <AccessRoute need={['admin:full']}>
              <IconsPage />
            </AccessRoute>
          }
        />
        <Route path="/dash-updates" element={<DashFixesPage />} />
        <Route path="/dash-fixes" element={<Navigate to="/dash-updates" replace />} />
        <Route path="/admin/enhancement-requests" element={<Navigate to="/dash-updates" replace />} />
        <Route
          path="/admin/routines"
          element={
            <AccessRoute need={['routines:write', 'admin:full']}>
              <AdminRoutinesPage />
            </AccessRoute>
          }
        />
        <Route
          path="/admin/retail-qa"
          element={
            <AccessRoute need={['retail_qa:manage', 'admin:manage']}>
              <RetailQaPage />
            </AccessRoute>
          }
        />
        <Route
          path="/people/applicants"
          element={
            <AccessRoute need={['hiring:manage', 'people:manage']}>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <ApplicantsPage />
              </Suspense>
            </AccessRoute>
          }
        />
        <Route
          path="/people/jobs"
          element={
            <AccessRoute need={['hiring:manage', 'people:manage']}>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <JobsPage />
              </Suspense>
            </AccessRoute>
          }
        />
        <Route
          path="/people/interviews"
          element={
            <AccessRoute need={['hiring:manage', 'people:manage']}>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <InterviewsPage />
              </Suspense>
            </AccessRoute>
          }
        />
        <Route
          path="/people/onboarding"
          element={
            <AccessRoute need={['hiring:manage', 'people:manage']}>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <OnboardingPage />
              </Suspense>
            </AccessRoute>
          }
        />
        <Route
          path="/people/schedule"
          element={
            // Everyone sees the week (Dash Updates #6); only managers change it (the API says can_edit).
            <Suspense fallback={<LoadingScreen message="Loading…" />}>
              <SchedulePage />
            </Suspense>
          }
        />
        <Route
          path="/people/checkins"
          element={
            <AccessRoute need={['hiring:manage', 'people:manage']}>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <CheckInsPage />
              </Suspense>
            </AccessRoute>
          }
        />
        <Route
          path="/people/payroll-deductions"
          element={
            <AccessRoute need={['people.pay:read', 'people:manage']}>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <PayrollDeductionsPage />
              </Suspense>
            </AccessRoute>
          }
        />
        <Route
          path="/people/emails"
          element={
            <AccessRoute need={['hiring:manage', 'people:manage']}>
              <Suspense fallback={<LoadingScreen message="Loading…" />}>
                <EmailsPage />
              </Suspense>
            </AccessRoute>
          }
        />
        <Route path="/people" element={<Navigate to="/people/applicants" replace />} />
        <Route
          path="/admin/departments"
          element={
            <AccessRoute need={['hr.department:write', 'admin:manage']}>
              <DepartmentsPage />
            </AccessRoute>
          }
        />
        <Route
          path="/admin/departments/:slug"
          element={
            <AccessRoute need={['hr.department:write', 'admin:manage']}>
              <DepartmentDetailPage />
            </AccessRoute>
          }
        />
        <Route
          path="/admin/shifts"
          element={
            <AccessRoute need={['hr.shifts:write', 'admin:manage']}>
              <ShiftsPage />
            </AccessRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <AccessRoute need={['settings:write', 'admin:manage']}>
              <SettingsPage />
            </AccessRoute>
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
            <AccessRoute need={['announcements:manage', 'studios:manage']}>
              <AnnouncementsPage />
            </AccessRoute>
          }
        />
        <Route
          path="/announcements/:id"
          element={
            <AccessRoute need={['announcements:manage', 'studios:manage']}>
              <Suspense fallback={<LoadingScreen message="Loading announcement…" />}>
                <AnnouncementEditorPage />
              </Suspense>
            </AccessRoute>
          }
        />
        <Route
          path="/admin/label-studio"
          element={
            <AccessRoute need={['labels:write', 'studios:manage']}>
              <LabelStudioPage />
            </AccessRoute>
          }
        />
        <Route
          path="/admin/label-studio/:id"
          element={
            <AccessRoute need={['labels:write', 'studios:manage']}>
              <LabelDesignerPage />
            </AccessRoute>
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
            <AccessRoute need={['blog:write', 'studios:full']}>
              <Suspense fallback={<LoadingScreen message="Loading Blog Studio…" />}>
                <BlogStudioPage />
              </Suspense>
            </AccessRoute>
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
