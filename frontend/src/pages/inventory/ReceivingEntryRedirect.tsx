import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { fetchOrdersForReceiving } from '../../api/inventory.api';

/**
 * /inventory/receiving redirects to the next eligible receiving order (for-receiving ordering),
 * or to orders when none are queued.
 */
export default function ReceivingEntryRedirect() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ordersForReceiving', 'landing', 1],
    queryFn: async () => {
      const { data: res } = await fetchOrdersForReceiving({ page: 1, page_size: 1 });
      return res;
    },
    staleTime: 0,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) {
    return <Navigate to="/inventory/orders" replace state={{ receiveError: true }} />;
  }

  const first = data?.results?.[0];
  if (first) {
    return <Navigate to={`/inventory/receiving/${first.id}`} replace />;
  }
  return <Navigate to="/inventory/orders" replace state={{ receiveEmpty: true }} />;
}
