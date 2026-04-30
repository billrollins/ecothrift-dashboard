import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

const VIEW_TITLES: Record<string, string> = {
  orders: 'Orders',
  manifest: 'Preprocessing',
  receiving: 'Receiving',
  processing: 'Processing',
  finalization: 'Finalization',
  disputes: 'Disputes',
};

/** Unified placeholder for all Inbound fulfillment sidebar targets until real flows ship. */
export default function InboundFulfillmentPlaceholderPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const view = searchParams.get('view') ?? '';
  if (view === 'orders') {
    return <Navigate to="/inventory/orders" replace />;
  }
  if (view === 'receiving') {
    return <Navigate to="/inventory/receiving" replace />;
  }
  const title =
    view && VIEW_TITLES[view] ? VIEW_TITLES[view] : 'Inbound fulfillment';

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        This step is not wired yet. Previous workflows are available only from the legacy hub.
      </Typography>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="body2">
            Open legacy inventory tools (orders, preprocessing, processing, settings) from one place:
          </Typography>
          <Button sx={{ mt: 2 }} variant="contained" size="small" onClick={() => navigate('/inventory/legacy')}>
            Legacy inventory pages
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
