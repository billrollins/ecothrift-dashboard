/**
 * Reports (owner 2026-10-13): the owner's standard reports for a period, one tab each. The sales tax report first
 * (he files the Nebraska return himself); more monthly reports join as tabs.
 */
import { Box, Tab, Tabs, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import SalesTaxTab from './SalesTaxTab';

const TABS = ['sales-tax'] as const;
type TabKey = (typeof TABS)[number];

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') as TabKey | null;
  const tab: TabKey = asked && TABS.includes(asked) ? asked : 'sales-tax';
  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>Reports</Typography>
      <Tabs value={tab} onChange={(_, v: TabKey) => setParams(v === 'sales-tax' ? {} : { tab: v })} sx={{ mb: 2 }}>
        <Tab value="sales-tax" label="Sales tax" sx={{ textTransform: 'none' }} />
      </Tabs>
      {tab === 'sales-tax' ? <SalesTaxTab /> : null}
    </Box>
  );
}
