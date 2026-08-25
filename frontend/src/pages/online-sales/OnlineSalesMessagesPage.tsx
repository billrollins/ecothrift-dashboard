/**
 * The Online Sales inbox.
 *
 * The customer directory that used to sit beside this as a tab now lives in
 * Admin > Users, so this page is one thing: threads waiting on Eco-Thrift.
 * There is no tab bar to shift, and the thread pane cross-links to the person's
 * full record rather than duplicating it.
 */
import { useState } from 'react';
import { Box } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import HoldDetailDrawer from './HoldDetailDrawer';
import MessagesPanel from './customers/MessagesPanel';
import { useOnlineSalesMobile } from './useOnlineSalesMobile';
import { PAGE_FILL_SX } from '../../components/common/gridChrome';

export default function OnlineSalesMessagesPage() {
  const isMobile = useOnlineSalesMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const messageSearch = searchParams.get('q') || '';
  const threadParam = Number(searchParams.get('thread') || '');
  const initialThreadId = Number.isFinite(threadParam) && threadParam > 0 ? threadParam : null;

  const [holdId, setHoldId] = useState<number | null>(null);

  return (
    <Box sx={PAGE_FILL_SX}>
      <PageHeader
        title="Messages"
        dense={isMobile}
        subtitle={
          isMobile
            ? 'Threads with online shoppers.'
            : 'Threads with online shoppers. Needs reply means the customer is waiting on us.'
        }
      />

      <MessagesPanel
        initialSearch={messageSearch}
        initialThreadId={initialThreadId}
        onOpenHold={(id) => setHoldId(id)}
        onThreadChange={(id) => {
          const nextParams = new URLSearchParams(searchParams);
          if (id) nextParams.set('thread', String(id));
          else nextParams.delete('thread');
          setSearchParams(nextParams, { replace: true });
        }}
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
