import { Box, Card, CardContent, Grid, Typography } from '@mui/material';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useMySummary } from '../../hooks/useConsignment';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

export default function SummaryPage() {
  const { data, isLoading } = useMySummary();

  const summary = data as {
    total_items?: number;
    currently_listed?: number;
    sold?: number;
    total_earned?: string;
    pending_balance?: string;
  } | undefined;

  if (isLoading) return <LoadingScreen message="Loading summary..." />;

  return (
    <Box>
      <PageHeader title="Summary" subtitle="Your consignment overview" />

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Total Items
              </Typography>
              <Typography variant="h4" fontWeight={600}>
                {summary?.total_items ?? 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Currently Listed
              </Typography>
              <Typography variant="h4" fontWeight={600}>
                {summary?.currently_listed ?? 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Sold
              </Typography>
              <Typography variant="h4" fontWeight={600}>
                {summary?.sold ?? 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Total Earned
              </Typography>
              <Typography variant="h4" fontWeight={600} color="success.main">
                {formatCurrency(summary?.total_earned ?? '0')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Pending Balance
              </Typography>
              <Typography variant="h4" fontWeight={600} color="primary.main">
                {formatCurrency(summary?.pending_balance ?? '0')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
