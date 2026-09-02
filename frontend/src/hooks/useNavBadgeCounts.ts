import { useMemo } from 'react';
import { partsNavWaitingCount } from '../pages/restoration/parts/partsBoard';
import { useAuth } from './useAuth';
import { useRetailInboxUnreadCount } from './useMailbox';
import { useRestorationPartsOrders } from './useRestorationBench';
import { useNeedsReplyCount } from './useWebStore';
import { runsAtLeast } from '../pages/routines/runIsDue';
import { useMyRoutineRuns } from './useRoutines';

function useRestorationPartsWaitingCount(enabled: boolean): number {
  // Same live list the command center writes on approve / deny / file, so the
  // sidebar badge drops as soon as the last waiting order leaves that cache.
  const live = useRestorationPartsOrders({
    bucket: 'live',
    enabled,
    refetchInterval: 30_000,
  });
  return partsNavWaitingCount(live.data ?? []);
}

/**
 * Counts to show on sidebar rows, keyed by nav item id.
 *
 * The sidebar stays generic: it renders whatever ids appear here, so a new
 * badge needs no navigation changes. Domain knowledge (which queue is worth
 * interrupting someone for) lives in this hook - Online Sales badges threads
 * where staff owes the next action (`needs_reply`), not unread mail.
 */
export function useNavBadgeCounts(options: {
  onlineSales: boolean;
  retailInbox?: boolean;
}): Record<string, number> {
  const { user } = useAuth();
  const nextAction = useNeedsReplyCount({ enabled: options.onlineSales });
  const inboxUnread = useRetailInboxUnreadCount({
    enabled: Boolean(options.retailInbox) && user?.role === 'Admin',
  });
  const partsWaiting = useRestorationPartsWaitingCount(Boolean(user?.is_superuser));
  const routines = useMyRoutineRuns();
  // The badge is the soft nag: it turns on at remind time, well before the
  // app-bar alert. Quiet runs stay on the list without a number beside it.
  const routinesWaiting = runsAtLeast(routines.data?.open, 'soft').length;

  return useMemo(() => {
    const counts: Record<string, number> = {};
    if (nextAction > 0) counts.onlineSalesCustomers = nextAction;
    if (inboxUnread > 0) counts.retailInbox = inboxUnread;
    if (partsWaiting > 0) counts.restorationPartsRequests = partsWaiting;
    if (routinesWaiting > 0) counts.routines = routinesWaiting;
    return counts;
  }, [nextAction, inboxUnread, partsWaiting, routinesWaiting]);
}
