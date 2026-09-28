import { Box, Tab, Tabs, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import CardBatchesTab from './CardBatchesTab';
import MembersTab from './MembersTab';
import RewardsTab from './RewardsTab';

const TABS = ['members', 'cards', 'rewards'] as const;
type TabKey = (typeof TABS)[number];

/**
 * Thrift+ in Dash: member service (find, sign up, verify, cards, second adult, revoke) and
 * blank-card batches (Phase 1); the reward engine's dry run (Phase 2). Superuser-only in the
 * nav until launch (10-20).
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
      </Tabs>
      {tab === 'members' ? <MembersTab /> : null}
      {tab === 'cards' ? <CardBatchesTab /> : null}
      {tab === 'rewards' ? <RewardsTab /> : null}
    </Box>
  );
}
