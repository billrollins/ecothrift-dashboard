import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { LoadingScreen } from './components/feedback/LoadingScreen';
import MainLayout from './components/layout/MainLayout';
import { ConsigneeLayout } from './components/layout/ConsigneeLayout';

// Pages
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import TimeClockPage from './pages/hr/TimeClockPage';
import TimeHistoryPage from './pages/hr/TimeHistoryPage';
import EmployeeListPage from './pages/hr/EmployeeListPage';
import EmployeeDetailPage from './pages/hr/EmployeeDetailPage';
import SickLeavePage from './pages/hr/SickLeavePage';
import VendorListPage from './pages/inventory/VendorListPage';
import VendorDetailPage from './pages/inventory/VendorDetailPage';
import OrderListPage from './pages/inventory/OrderListPage';
import OrderDetailPage from './pages/inventory/OrderDetailPage';
import ProcessingPage from './pages/inventory/ProcessingPage';
import ProductListPage from './pages/inventory/ProductListPage';
import ItemListPage from './pages/inventory/ItemListPage';
import ItemDetailPage from './pages/inventory/ItemDetailPage';
import TerminalPage from './pages/pos/TerminalPage';
import DrawerListPage from './pages/pos/DrawerListPage';
import CashManagementPage from './pages/pos/CashManagementPage';
import TransactionListPage from './pages/pos/TransactionListPage';
import ConsignmentAccountsPage from './pages/consignment/AccountsPage';
import ConsigneeDetailPage from './pages/consignment/ConsigneeDetailPage';
import ConsignmentItemsPage from './pages/consignment/ItemsPage';
import ConsignmentPayoutsPage from './pages/consignment/PayoutsPage';
import ConsigneeItemsPage from './pages/consignee/MyItemsPage';
import ConsigneePayoutsPage from './pages/consignee/MyPayoutsPage';
import ConsigneeSummaryPage from './pages/consignee/SummaryPage';
import UserListPage from './pages/admin/UserListPage';
import CustomerListPage from './pages/admin/CustomerListPage';
import PermissionsPage from './pages/admin/PermissionsPage';
import SettingsPage from './pages/admin/SettingsPage';
import PublicItemLookupPage from './pages/PublicItemLookupPage';

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

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/pricing/:sku?" element={<PublicItemLookupPage />} />
      <Route path="/pricing" element={<PublicItemLookupPage />} />

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
        <Route path="/hr/time-history" element={<TimeHistoryPage />} />
        <Route path="/hr/employees" element={<EmployeeListPage />} />
        <Route path="/hr/employees/:id" element={<EmployeeDetailPage />} />
        <Route path="/hr/sick-leave" element={<SickLeavePage />} />
        <Route path="/inventory/vendors" element={<VendorListPage />} />
        <Route path="/inventory/vendors/:id" element={<VendorDetailPage />} />
        <Route path="/inventory/orders" element={<OrderListPage />} />
        <Route path="/inventory/orders/:id" element={<OrderDetailPage />} />
        <Route path="/inventory/processing" element={<ProcessingPage />} />
        <Route path="/inventory/products" element={<ProductListPage />} />
        <Route path="/inventory/items" element={<ItemListPage />} />
        <Route path="/inventory/items/:id" element={<ItemDetailPage />} />
        <Route path="/pos/terminal" element={<TerminalPage />} />
        <Route path="/pos/drawers" element={<DrawerListPage />} />
        <Route path="/pos/cash" element={<CashManagementPage />} />
        <Route path="/pos/transactions" element={<TransactionListPage />} />
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
          path="/admin/permissions"
          element={<AdminRoute><PermissionsPage /></AdminRoute>}
        />
        <Route
          path="/admin/settings"
          element={<AdminRoute><SettingsPage /></AdminRoute>}
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

      {/* Redirects */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
