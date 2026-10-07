import { Box, Tab, Tabs, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import CalculatorTab from './CalculatorTab';
import CardBatchesTab from './CardBatchesTab';
import FloorStockTab from './FloorStockTab';
import MembersTab from './MembersTab';
import OverviewTab from './OverviewTab';
import RegisterTab from './RegisterTab';
import RewardsTab from './RewardsTab';

const TABS = ['members', 'cards', 'rewards', 'calculator', 'floor', 'register', 'overview'] as const;
type TabKey = (typeof TABS)[number];

/**
 * Thrift+ in Dash: member service (find, sign up, verify, cards, second adult, revoke) and
 * blank-card batches (Phase 1); the reward engine's dry run (Phase 2); 18+ products and member
 * returns (Phase 3). Superuser-only in the nav until launch (10-20).
 */
export default function ThriftPlusPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') as TabKey | null;
  const tab: TabKey = asked && TABS.includes(asked) ? asked : 'members';
  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>Thrift+</Typography>
      <Tabs value={tab} onChange={(_, v: TabKey) => setParams(v === 'members' ? {} : { tab: v })} sx={{ mb: 2 }}>
        <Tab value="members" label="Members" sx={{ textTransform: 'none' }} />
        <Tab value="cards" label="Card batches" sx={{ textTransform: 'none' }} />
        <Tab value="rewards" label="Rewards" sx={{ textTransform: 'none' }} />
        <Tab value="calculator" label="Calculator" sx={{ textTransform: 'none' }} />
        <Tab value="floor" label="Floor stock" sx={{ textTransform: 'none' }} />
        <Tab value="register" label="Register" sx={{ textTransform: 'none' }} />
        <Tab value="overview" label="Overview" sx={{ textTransform: 'none' }} />
      </Tabs>
      {tab === 'members' ? <MembersTab /> : null}
      {tab === 'cards' ? <CardBatchesTab /> : null}
      {tab === 'rewards' ? <RewardsTab /> : null}
      {tab === 'calculator' ? <CalculatorTab /> : null}
      {tab === 'floor' ? <FloorStockTab /> : null}
      {tab === 'register' ? <RegisterTab /> : null}
      {tab === 'overview' ? <OverviewTab /> : null}
    </Box>
  );
}
