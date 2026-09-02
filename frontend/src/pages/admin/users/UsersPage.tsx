/**
 * Everyone with an account, in one place.
 *
 * Customers and Employees are different people with different facts, so they
 * get their own tab rather than one merged list. Employees is first and the
 * default for an Admin. Managers only see Customers. That gate is fixed for
 * the session, so the tab bar never changes under anyone's hand.
 *
 * The stats strip is a fixed slot above the tabs. It swaps its numbers when the
 * tab changes but never its height, so the table below stays where it was.
 */
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Box, Tab, Tabs } from '@mui/material';
import { PageHeader } from '../../../components/common/PageHeader';
import CustomerDetailDrawer from '../../../components/users/CustomerDetailDrawer';
import EmployeeDetailDrawer from '../../../components/users/EmployeeDetailDrawer';
import { useAuth } from '../../../contexts/AuthContext';
import { useCustomerStats, useEmployeeStats } from '../../../hooks/useEmployees';
import { useIsMobileLayout } from '../../../hooks/useIsMobileLayout';
import CustomersPanel from './CustomersPanel';
import EmployeesPanel from './EmployeesPanel';
import { CustomerStatsStrip, EmployeeStatsStrip } from './UsersStatsStrip';
import { PAGE_FILL_SX } from '../../../components/common/gridChrome';

type UsersTab = 'customers' | 'employees';

export default function UsersPage() {
  const isMobile = useIsMobileLayout();
  const { user } = useAuth();
  const canSeeEmployees = user?.role === 'Admin';

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  const customerParam = Number(searchParams.get('customer') || '');
  const deepLinkedCustomer =
    Number.isFinite(customerParam) && customerParam > 0 ? customerParam : null;

  const requestedTab: UsersTab =
    deepLinkedCustomer || tabParam === 'customers' || !canSeeEmployees
      ? 'customers'
      : 'employees';
  const tab: UsersTab = requestedTab;

  const [customerId, setCustomerId] = useState<number | null>(deepLinkedCustomer);
  const [employeeId, setEmployeeId] = useState<number | null>(null);

  const customerStats = useCustomerStats();
  const employeeStats = useEmployeeStats({ enabled: canSeeEmployees });

  const setTab = (next: UsersTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'employees') nextParams.delete('tab');
    else nextParams.set('tab', 'customers');
    nextParams.delete('customer');
    setSearchParams(nextParams, { replace: true });
  };

  const closeCustomer = useCallback(() => {
    setCustomerId(null);
    if (searchParams.has('customer')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('customer');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <Box sx={PAGE_FILL_SX}>
      <PageHeader
        title="Users"
        dense={isMobile}
        subtitle={
          isMobile
            ? 'Customers and staff accounts.'
            : 'Everyone with an account. Open a row for the whole record and the actions that go with it.'
        }
      />

      {/* Fixed slot - the numbers arrive without moving the tabs or the table. */}
      <Box sx={{ mb: 2, flexShrink: 0 }}>
        {tab === 'customers' ? (
          <CustomerStatsStrip stats={customerStats.data} />
        ) : (
          <EmployeeStatsStrip stats={employeeStats.data} />
        )}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v: UsersTab) => setTab(v)}
        sx={{
          mb: 2,
          flexShrink: 0,
          borderBottom: 1,
          borderColor: 'divider',
          overflow: 'visible',
          '& .MuiTabs-scroller': { overflow: 'visible !important' },
          '& .MuiTab-root': { overflow: 'visible', minHeight: 48, pt: 1.25 },
        }}
      >
        {canSeeEmployees ? (
          <Tab
            value="employees"
            label="Employees"
            sx={{ textTransform: 'none', fontWeight: 600 }}
          />
        ) : null}
        <Tab
          value="customers"
          sx={{ textTransform: 'none', fontWeight: 600 }}
          label={
            <Badge
              color="error"
              badgeContent={customerStats.data?.needs_reply ?? 0}
              invisible={!customerStats.data?.needs_reply}
              sx={{ '& .MuiBadge-badge': { right: -10, top: -2, fontWeight: 700 } }}
            >
              <Box component="span" sx={{ pr: customerStats.data?.needs_reply ? 1.5 : 0 }}>
                Customers
              </Box>
            </Badge>
          }
        />
      </Tabs>

      {tab === 'customers' ? (
        <CustomersPanel onSelect={setCustomerId} />
      ) : (
        <EmployeesPanel onSelect={setEmployeeId} />
      )}

      <CustomerDetailDrawer
        customerId={customerId}
        open={customerId != null}
        onClose={closeCustomer}
      />

      <EmployeeDetailDrawer
        userId={employeeId}
        open={employeeId != null}
        onClose={() => setEmployeeId(null)}
      />
    </Box>
  );
}
