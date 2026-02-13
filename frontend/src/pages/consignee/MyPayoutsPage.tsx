import { Box } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useMyPayouts } from '../../hooks/useConsignment';
import type { ConsignmentPayout } from '../../types/consignment.types';
import { format } from 'date-fns';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

export default function MyPayoutsPage() {
  const { data, isLoading } = useMyPayouts();
  const payouts = data ?? [];

  const columns: GridColDef[] = [
    { field: 'payout_number', headerName: 'Payout #', width: 120 },
    {
      field: 'period',
      headerName: 'Period',
      width: 200,
      valueGetter: (_, row) =>
        row.period_start && row.period_end
          ? `${format(new Date(row.period_start), 'MM/dd/yyyy')} - ${format(
              new Date(row.period_end),
              'MM/dd/yyyy'
            )}`
          : '—',
    },
    { field: 'items_sold', headerName: 'Items Sold', width: 100 },
    {
      field: 'payout_amount',
      headerName: 'Payout Amount',
      width: 120,
      valueFormatter: (value) => formatCurrency(value ?? 0),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 100,
      renderCell: ({ value }) => <StatusBadge status={value ?? ''} size="small" />,
    },
    {
      field: 'paid_at',
      headerName: 'Paid Date',
      width: 120,
      valueFormatter: (value) =>
        value ? format(new Date(value as string), 'MM/dd/yyyy') : '—',
    },
  ];

  if (isLoading && payouts.length === 0) return <LoadingScreen message="Loading payouts..." />;

  return (
    <Box>
      <PageHeader title="My Payouts" subtitle="Your payout history" />

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={payouts}
          columns={columns}
          loading={isLoading}
          getRowId={(row: ConsignmentPayout) => row.id}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{ border: 'none' }}
        />
      </Box>
    </Box>
  );
}
