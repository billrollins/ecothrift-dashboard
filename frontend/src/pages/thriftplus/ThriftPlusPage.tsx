import { Box, Tab, Tabs, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import CalculatorTab from './CalculatorTab';
import FamiliesTab from './FamiliesTab';
import FloorStockTab from './FloorStockTab';
import MembersTab from './MembersTab';
import OverviewTab from './OverviewTab';
import RegisterTab from './RegisterTab';
import RewardsTab from './RewardsTab';

const TABS = ['members', 'rewards', 'families', 'calculator', 'floor', 'register', 'overview'] as const;
type TabKey = (typeof TABS)[number];

/**
 * Thrift+ in Dash: member service (find, sign up, verify, member codes, second adult, revoke; Phase 1); the
 * reward engine's dry run (Phase 2); 18+ products and member returns (Phase 3). No physical card since
 * 2026-10-14 (owner): members show the member QR in the app or give their phone, so the card batches tab is gone.
 * Superuser-only in the nav until launch (10-20).
 */
export default function ThriftPlusPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') as TabKey | null;
  const tab: TabKey = asked && TABS.includes(asked) ? asked : 'members';
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 800, flex: 1 }}>Thrift+</Typography>
      </Box>
      <Tabs value={tab} onChange={(_, v: TabKey) => setParams(v === 'members' ? {} : { tab: v })} sx={{ mb: 2 }}>
        <Tab value="members" label="Members" sx={{ textTransform: 'none' }} />
        <Tab value="rewards" label="ThriftBucks" sx={{ textTransform: 'none' }} />
        <Tab value="families" label="Families" sx={{ textTransform: 'none' }} />
        <Tab value="calculator" label="Calculator" sx={{ textTransform: 'none' }} />
        <Tab value="floor" label="Floor stock" sx={{ textTransform: 'none' }} />
        <Tab value="register" label="Register" sx={{ textTransform: 'none' }} />
        <Tab value="overview" label="Overview" sx={{ textTransform: 'none' }} />
      </Tabs>
      {tab === 'members' ? <MembersTab /> : null}
      {tab === 'rewards' ? <RewardsTab /> : null}
      {tab === 'families' ? <FamiliesTab /> : null}
      {tab === 'calculator' ? <CalculatorTab /> : null}
      {tab === 'floor' ? <FloorStockTab /> : null}
      {tab === 'register' ? <RegisterTab /> : null}
      {tab === 'overview' ? <OverviewTab /> : null}
    </Box>
  );
}
