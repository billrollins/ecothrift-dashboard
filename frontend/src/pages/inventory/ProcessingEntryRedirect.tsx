import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Typography } from '@mui/material';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { usePurchaseOrders } from '../../hooks/useInventory';

/**
 * `/inventory/processing` → `/inventory/processing/:id` using `?order=` or queue + last-used id.
 */
export default function ProcessingEntryRedirect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderQ = searchParams.get('order');
  const legacyOrderParam = Boolean(orderQ && /^\d+$/.test(orderQ));

  useEffect(() => {
    if (!legacyOrderParam) return;
    navigate(`/inventory/processing/${orderQ}`, { replace: true });
  }, [legacyOrderParam, orderQ, navigate]);

  const { data, isLoading } = usePurchaseOrders(
    { status__in: 'delivered,processing,complete', ordering: '-ordered_date', page_size: 100 },
    !legacyOrderParam,
  );

  useEffect(() => {
    if (legacyOrderParam) return;
    if (isLoading) return;
    const rows = data?.results ?? [];
    if (!rows.length) return;
    const lastRaw = localStorage.getItem('lastProcessingOrderId');
    const lastId = lastRaw ? Number.parseInt(lastRaw, 10) : NaN;
    const pick =
      Number.isFinite(lastId) && rows.some((o) => o.id === lastId) ? lastId : rows[0].id;
    navigate(`/inventory/processing/${pick}`, { replace: true });
  }, [legacyOrderParam, isLoading, data?.results, navigate]);

  if (legacyOrderParam) {
    return <LoadingScreen message="Opening processor…" />;
  }

  if (isLoading) {
    return <LoadingScreen message="Loading orders…" />;
  }

  if (!data?.results?.length) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          <Typography variant="body2">
            No delivered, processing, or complete purchase orders found. Create or receive an order first, then open it
            from the order detail page.
          </Typography>
        </Alert>
      </Box>
    );
  }

  return <LoadingScreen message="Choosing workspace…" />;
}
