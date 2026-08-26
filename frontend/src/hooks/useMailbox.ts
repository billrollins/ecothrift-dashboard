import { useQuery } from '@tanstack/react-query';
import { getMailboxMessages } from '../api/mailbox.api';

const UNREAD_PARAMS = {
  classification: 'general',
  is_read: false,
  page_size: 1,
} as const;

/** Unread retail@ mail. Reads the paginated `count`, not page-one rows. */
export function useRetailInboxUnreadCount(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: ['retailMailbox', 'unreadCount'],
    queryFn: async () => {
      const { data } = await getMailboxMessages({ ...UNREAD_PARAMS });
      return data;
    },
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  return query.data?.count ?? 0;
}
