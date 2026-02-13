import { Box } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useMyItems } from '../../hooks/useConsignment';
import type { ConsignmentItem } from '../../types/consignment.types';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

export default function MyItemsPage() {
  const { data, isLoading } = useMyItems();
  const items = data ?? [];

  const columns: GridColDef[] = [
    { field: 'item_sku', headerName: 'SKU', width: 120 },
    { field: 'item_title', headerName: 'Title', flex: 1, minWidth: 180 },
    {
      field: 'listed_price',
      headerName: 'Price',
      width: 100,
      valueFormatter: (value) => formatCurrency(value ?? 0),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: ({ value }) => <StatusBadge status={value ?? ''} size="small" />,
    },
    {
      field: 'sale_amount',
      headerName: 'Sale Amount',
      width: 110,
      valueFormatter: (value) => (value ? formatCurrency(value) : '—'),
    },
    {
      field: 'consignee_earnings',
      headerName: 'My Earnings',
      width: 110,
      valueFormatter: (value) => (value ? formatCurrency(value) : '—'),
    },
  ];

  if (isLoading && items.length === 0) return <LoadingScreen message="Loading items..." />;

  return (
    <Box>
      <PageHeader title="My Items" subtitle="Your consignment items" />

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={items}
          columns={columns}
          loading={isLoading}
          getRowId={(row: ConsignmentItem) => row.id}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{ border: 'none' }}
        />
      </Box>
    </Box>
  );
}
