import { Box, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useSalesLog } from '../../hooks/useWebStore';
import type { Reservation } from '../../api/webstore.api';

export default function OnlineSalesSalesPage() {
  const { data, isLoading } = useSalesLog();

  if (isLoading) return <LoadingScreen />;

  const cols: GridColDef<Reservation>[] = [
    {
      field: 'completed_at',
      headerName: 'Completed',
      width: 160,
      valueFormatter: (v) => (v ? new Date(String(v)).toLocaleString() : ''),
    },
    { field: 'listing_title', headerName: 'Listing', flex: 1, minWidth: 160 },
    { field: 'customer_name', headerName: 'Customer', width: 140 },
    { field: 'quantity', headerName: 'Qty', width: 70 },
    { field: 'line_total', headerName: 'Gross', width: 100 },
    { field: 'cost_snapshot', headerName: 'Cost', width: 100 },
    { field: 'fee_amount', headerName: 'Fees', width: 90 },
    { field: 'contribution', headerName: 'Contribution', width: 120 },
    { field: 'pos_cart', headerName: 'POS cart', width: 100 },
  ];

  return (
    <Box>
      <PageHeader
        title="Sales"
        subtitle="Completed hold → pickup sales (POS-linked when available). Tax excluded."
      />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Contribution ≈ gross − cost snapshot − fees − direct expense. POS revenue is not double-counted.
      </Typography>
      <Box sx={{ height: 560 }}>
        <DataGrid
          rows={data || []}
          columns={cols}
          getRowId={(r) => r.id}
          disableRowSelectionOnClick
        />
      </Box>
    </Box>
  );
}
