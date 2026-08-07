import { useMemo } from 'react';
import { useNeedsReplyCount } from './useWebStore';

/**
 * Counts to show on sidebar rows, keyed by nav item id.
 *
 * The sidebar stays generic: it renders whatever ids appear here, so a new
 * badge needs no navigation changes. Domain knowledge (which queue is worth
 * interrupting someone for) lives in this hook - Online Sales badges threads
 * where staff owes the next action (`needs_reply`), not unread mail.
 */
export function useNavBadgeCounts(options: { onlineSales: boolean }): Record<string, number> {
  const nextAction = useNeedsReplyCount({ enabled: options.onlineSales });

  return useMemo(() => {
    const counts: Record<string, number> = {};
    if (nextAction > 0) counts.onlineSalesCustomers = nextAction;
    return counts;
  }, [nextAction]);
}
