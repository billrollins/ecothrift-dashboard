import { Box, Tab, Tabs } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { AssumptionsPanel } from './settings/AssumptionsPanel';
import { PermissionsPanel } from './settings/PermissionsPanel';
import { PrintingPanel } from './settings/PrintingPanel';
import { RetailQaPanel } from './settings/RetailQaPanel';
import { parseSettingsTab, type SettingsTab } from './settings/settingsRegistry';
import { StorePanel } from './settings/StorePanel';
import { SystemPanel } from './settings/SystemPanel';

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseSettingsTab(searchParams.get('tab'), isAdmin);

  const setTab = (next: SettingsTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'system') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <Box>
      <PageHeader title="Settings" subtitle="Store configuration" />
      <Tabs
        value={tab}
        onChange={(_e, next: SettingsTab) => setTab(next)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="system" label="System" />
        <Tab value="printing" label="Printing" />
        <Tab value="store" label="Store" />
        <Tab value="assumptions" label="Assumptions" />
        <Tab value="retail-qa" label="Retail QA" />
        {isAdmin ? <Tab value="permissions" label="Permissions" /> : null}
      </Tabs>
      {tab === 'assumptions' ? <AssumptionsPanel /> : null}
      {tab === 'retail-qa' ? <RetailQaPanel /> : null}
      {tab === 'store' ? <StorePanel /> : null}
      {tab === 'printing' ? <PrintingPanel /> : null}
      {tab === 'permissions' && isAdmin ? <PermissionsPanel /> : null}
      {tab === 'system' ? <SystemPanel /> : null}
    </Box>
  );
}
