/**
 * Everyone with an account, in one place.
 *
 * Members and Employees are different people with different facts, so they
 * get their own tab rather than one merged list. Employees is first and the
 * default for an Admin. Managers only see Members (owner 2026-10-16: the tab was
 * Customers; ?tab=customers still opens it). That gate is fixed for
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
import EmployeesPanel from './EmployeesPanel';
import MembersPanel, { useMembers } from './MembersPanel';
import { EmployeeStatsStrip, MemberStatsStrip } from './UsersStatsStrip';
import { PAGE_FILL_SX } from '../../../components/common/gridChrome';

type UsersTab = 'members' | 'employees';

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
    deepLinkedCustomer || tabParam === 'members' || tabParam === 'customers' || !canSeeEmployees
      ? 'members'
      : 'employees';
  const tab: UsersTab = requestedTab;

  const [customerId, setCustomerId] = useState<number | null>(deepLinkedCustomer);
  const [employeeId, setEmployeeId] = useState<number | null>(null);

  const customerStats = useCustomerStats();
  const members = useMembers();
  const employeeStats = useEmployeeStats({ enabled: canSeeEmployees });

  const setTab = (next: UsersTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'employees') nextParams.delete('tab');
    else nextParams.set('tab', 'members');
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
        dense
        subtitle={isMobile ? undefined : 'Members and staff. Open a row for the whole record.'}
      />

      {/* Fixed slot - the numbers arrive without moving the tabs or the table. */}
      <Box sx={{ mb: 1, flexShrink: 0 }}>
        {tab === 'members' ? (
          <MemberStatsStrip rows={members.data} needsReply={customerStats.data?.needs_reply} />
        ) : (
          <EmployeeStatsStrip stats={employeeStats.data} />
        )}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v: UsersTab) => setTab(v)}
        sx={{
          mb: 1,
          minHeight: 40,
          flexShrink: 0,
          borderBottom: 1,
          borderColor: 'divider',
          overflow: 'visible',
          '& .MuiTabs-scroller': { overflow: 'visible !important' },
          '& .MuiTab-root': { overflow: 'visible', minHeight: 40, py: 0.75 },
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
          value="members"
          sx={{ textTransform: 'none', fontWeight: 600 }}
          label={
            <Badge
              color="error"
              badgeContent={customerStats.data?.needs_reply ?? 0}
              invisible={!customerStats.data?.needs_reply}
              sx={{ '& .MuiBadge-badge': { right: -10, top: -2, fontWeight: 700 } }}
            >
              <Box component="span" sx={{ pr: customerStats.data?.needs_reply ? 1.5 : 0 }}>
                Members
              </Box>
            </Badge>
          }
        />
      </Tabs>

      {tab === 'members' ? (
        <MembersPanel />
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
