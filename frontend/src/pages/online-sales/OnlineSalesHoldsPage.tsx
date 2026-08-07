import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Tab, Tabs } from '@mui/material';
import { PageHeader } from '../../components/common/PageHeader';
import HoldDetailDrawer from './HoldDetailDrawer';
import NeedsActionPanel from './holds/NeedsActionPanel';
import ReadyTodayPanel from './holds/ReadyTodayPanel';
import CompletedPanel from './holds/CompletedPanel';
import ReleasedPanel from './holds/ReleasedPanel';
import { useOnlineSalesMobile } from './useOnlineSalesMobile';

type HoldsTab = 'needs' | 'ready' | 'completed' | 'released';

const TAB_FROM_PARAM: Record<string, HoldsTab | 'messages'> = {
  needs: 'needs',
  ready: 'ready',
  completed: 'completed',
  released: 'released',
  messages: 'messages',
  pickup: 'ready',
  holds: 'needs',
};

export default function OnlineSalesHoldsPage() {
  const isMobile = useOnlineSalesMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || 'needs';
  const mapped = TAB_FROM_PARAM[tabParam] || 'needs';

  // Messages moved to Customers - keep old bookmarks working.
  useEffect(() => {
    if (mapped === 'messages') {
      navigate('/online-sales/customers?tab=messages', { replace: true });
    }
  }, [mapped, navigate]);

  const tab: HoldsTab = mapped === 'messages' ? 'needs' : mapped;
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const setTab = (next: HoldsTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'needs') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setSearchParams(nextParams, { replace: true });
  };

  const drawerOpen = selectedId != null;

  if (mapped === 'messages') {
    return null;
  }

  return (
    <Box>
      <PageHeader
        title="Holds"
        dense={isMobile}
        subtitle={
          isMobile
            ? 'Pull, ready, complete at pickup.'
            : 'Pull holds, mark them Ready, and complete at pickup. Payment happens at the POS.'
        }
      />
      <Tabs
        value={tab}
        onChange={(_, v: HoldsTab) => setTab(v)}
        variant={isMobile ? 'scrollable' : 'standard'}
        scrollButtons={isMobile ? 'auto' : false}
        allowScrollButtonsMobile
        sx={{
          mb: 2,
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 48,
          '& .MuiTab-root': {
            minHeight: 48,
            minWidth: isMobile ? 'auto' : undefined,
            px: isMobile ? 1.25 : undefined,
          },
        }}
      >
        <Tab
          value="needs"
          label={isMobile ? 'Needs' : 'Needs action'}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        />
        <Tab
          value="ready"
          label={isMobile ? 'Ready' : 'Ready today'}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        />
        <Tab value="completed" label="Completed" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab value="released" label="Released" sx={{ textTransform: 'none', fontWeight: 600 }} />
      </Tabs>
      {tab === 'needs' && <NeedsActionPanel onSelect={setSelectedId} />}
      {tab === 'ready' && <ReadyTodayPanel onSelect={setSelectedId} />}
      {tab === 'completed' && <CompletedPanel onSelect={setSelectedId} />}
      {tab === 'released' && <ReleasedPanel onSelect={setSelectedId} />}
      <HoldDetailDrawer
        reservationId={selectedId}
        open={drawerOpen}
        onClose={() => setSelectedId(null)}
        onReleased={() => setTab('released')}
        onReopened={() => setTab('needs')}
      />
    </Box>
  );
}
