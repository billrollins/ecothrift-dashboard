import { Box, Card, CardContent, Typography } from '@mui/material';
import { Navigate, useSearchParams } from 'react-router-dom';

const VIEW_TITLES: Record<string, string> = {
  orders: 'Orders',
  manifest: 'Preprocessing',
  receiving: 'Receiving',
  processing: 'Processing',
  finalization: 'Finalization',
  disputes: 'Disputes',
};

const VIEW_HINTS: Record<string, string> = {
  finalization:
    'Finalization is not wired yet. Use Orders → Preprocessing → Processing for intake today.',
  disputes:
    'A dedicated disputes inbox is not wired yet. File and resolve disputes from Item Processor (Processing) on the relevant purchase order.',
};

/** Unified placeholder for inbound sidebar targets that are not yet dedicated pages. */
export default function InboundFulfillmentPlaceholderPage() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view') ?? '';
  if (view === 'orders') {
    return <Navigate to="/inventory/orders" replace />;
  }
  if (view === 'receiving') {
    return <Navigate to="/inventory/receiving" replace />;
  }
  const title =
    view && VIEW_TITLES[view] ? VIEW_TITLES[view] : 'Inbound fulfillment';
  const hint =
    (view && VIEW_HINTS[view]) ||
    'This step is not wired yet. Use Inbound fulfillment → Orders, Preprocessing, Receiving, or Processing.';

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {hint}
      </Typography>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            This page is a placeholder until a dedicated workflow ships.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
