/**
 * Reports (owner 2026-10-13 and 10-14): the owner's page, one tab each. The morning brief first (the AI supervisor's
 * daily report, data_platform Phase 2; /brief opens here), then sales tax (he files the Nebraska return himself).
 * More monthly reports join as tabs.
 */
import { Box, Tab, Tabs, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import BriefPage from '../brief/BriefPage';
import SalesTaxTab from './SalesTaxTab';

const TABS = ['brief', 'sales-tax'] as const;
type TabKey = (typeof TABS)[number];

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') as TabKey | null;
  const tab: TabKey = asked && TABS.includes(asked) ? asked : 'brief';
  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>Reports</Typography>
      <Tabs value={tab} onChange={(_, v: TabKey) => setParams(v === 'brief' ? {} : { tab: v })} sx={{ mb: 2 }}>
        <Tab value="brief" label="Brief" sx={{ textTransform: 'none' }} />
        <Tab value="sales-tax" label="Sales tax" sx={{ textTransform: 'none' }} />
      </Tabs>
      {tab === 'brief' ? <BriefPage embedded /> : null}
      {tab === 'sales-tax' ? <SalesTaxTab /> : null}
    </Box>
  );
}
