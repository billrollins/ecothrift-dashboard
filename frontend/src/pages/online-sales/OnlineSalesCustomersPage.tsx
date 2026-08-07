import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Box, Tab, Tabs } from '@mui/material';
import { PageHeader } from '../../components/common/PageHeader';
import { useNeedsReplyCount } from '../../hooks/useWebStore';
import HoldDetailDrawer from './HoldDetailDrawer';
import CustomerDetailDrawer from './customers/CustomerDetailDrawer';
import DirectoryPanel from './customers/DirectoryPanel';
import MessagesPanel from './customers/MessagesPanel';
import { useOnlineSalesMobile } from './useOnlineSalesMobile';

type CustomersTab = 'directory' | 'messages';

const TAB_FROM_PARAM: Record<string, CustomersTab> = {
  directory: 'directory',
  people: 'directory',
  messages: 'messages',
};

export default function OnlineSalesCustomersPage() {
  const isMobile = useOnlineSalesMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || 'directory';
  const tab: CustomersTab = TAB_FROM_PARAM[tabParam] || 'directory';
  const messageSearch = searchParams.get('q') || '';
  const threadParam = Number(searchParams.get('thread') || '');
  const initialThreadId = Number.isFinite(threadParam) && threadParam > 0 ? threadParam : null;

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [holdId, setHoldId] = useState<number | null>(null);

  const unreadCount = useNeedsReplyCount();

  const setTab = (next: CustomersTab, extras?: { q?: string; thread?: number | null }) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'directory') nextParams.delete('tab');
    else nextParams.set('tab', next);
    if (extras && 'q' in extras) {
      if (extras.q) nextParams.set('q', extras.q);
      else nextParams.delete('q');
    } else if (next !== 'messages') {
      nextParams.delete('q');
    }
    if (extras && 'thread' in extras) {
      if (extras.thread) nextParams.set('thread', String(extras.thread));
      else nextParams.delete('thread');
    } else if (next !== 'messages') {
      nextParams.delete('thread');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const openMessagesForEmail = (email: string) => {
    setCustomerId(null);
    setTab('messages', { q: email, thread: null });
  };

  return (
    <Box>
      <PageHeader
        title="Customers"
        dense={isMobile}
        subtitle={
          isMobile
            ? 'Directory, messages, and account help.'
            : 'Directory and inbox. The red badge is your next action - threads waiting on Eco-Thrift.'
        }
      />
      <Tabs
        value={tab}
        onChange={(_, v: CustomersTab) => setTab(v)}
        variant={isMobile ? 'scrollable' : 'standard'}
        scrollButtons={isMobile ? 'auto' : false}
        allowScrollButtonsMobile
        sx={{
          mb: 2,
          borderBottom: 1,
          borderColor: 'divider',
          overflow: 'visible',
          '& .MuiTabs-scroller': { overflow: 'visible !important' },
          '& .MuiTabs-flexContainer': { overflow: 'visible' },
          '& .MuiTab-root': {
            overflow: 'visible',
            minHeight: 48,
            minWidth: isMobile ? 'auto' : undefined,
            px: isMobile ? 1.25 : undefined,
            pt: 1.25,
          },
        }}
      >
        <Tab
          value="directory"
          label={isMobile ? 'Directory' : 'Directory'}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        />
        <Tab
          value="messages"
          sx={{ textTransform: 'none', fontWeight: 600 }}
          label={
            <Badge
              color="error"
              badgeContent={unreadCount}
              invisible={!unreadCount}
              sx={{
                '& .MuiBadge-badge': {
                  right: -10,
                  top: -2,
                  fontWeight: 700,
                },
              }}
            >
              <Box component="span" sx={{ pr: unreadCount ? 1.5 : 0 }}>
                Messages
              </Box>
            </Badge>
          }
        />
      </Tabs>

      {tab === 'directory' && <DirectoryPanel onSelect={setCustomerId} />}
      {tab === 'messages' && (
        <MessagesPanel
          initialSearch={messageSearch}
          initialThreadId={initialThreadId}
          onOpenHold={(id) => setHoldId(id)}
          onThreadChange={(id) => {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.set('tab', 'messages');
            if (id) nextParams.set('thread', String(id));
            else nextParams.delete('thread');
            setSearchParams(nextParams, { replace: true });
          }}
        />
      )}

      <CustomerDetailDrawer
        customerId={customerId}
        open={customerId != null}
        onClose={() => setCustomerId(null)}
        onOpenHold={(id) => {
          setCustomerId(null);
          setHoldId(id);
        }}
        onOpenMessages={openMessagesForEmail}
      />

      <HoldDetailDrawer
        reservationId={holdId}
        open={holdId != null}
        onClose={() => setHoldId(null)}
        onReleased={() => setHoldId(null)}
        onReopened={() => setHoldId(null)}
      />
    </Box>
  );
}
