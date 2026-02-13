import { useState, useMemo } from 'react';
import {
  Box,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useConsignmentItems } from '../../hooks/useConsignment';
import type { ConsignmentItem } from '../../types/consignment.types';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

export default function ItemsPage() {
  const [consigneeFilter, setConsigneeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (consigneeFilter) p.consignee = consigneeFilter;
    if (statusFilter) p.status = statusFilter;
    return p;
  }, [consigneeFilter, statusFilter]);

  const { data, isLoading } = useConsignmentItems(params);
  const items = data?.results ?? [];

  const columns: GridColDef[] = [
    { field: 'item_sku', headerName: 'SKU', width: 120 },
    { field: 'item_title', headerName: 'Title', flex: 1, minWidth: 180 },
    { field: 'consignee_name', headerName: 'Consignee', width: 130 },
    {
      field: 'asking_price',
      headerName: 'Asking Price',
      width: 110,
      valueFormatter: (value) => formatCurrency(value ?? 0),
    },
    {
      field: 'listed_price',
      headerName: 'Listed Price',
      width: 110,
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
  ];

  if (isLoading && items.length === 0) return <LoadingScreen message="Loading items..." />;

  return (
    <Box>
      <PageHeader title="Consignment Items" subtitle="Manage consignment inventory" />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            size="small"
            label="Consignee"
            value={consigneeFilter}
            onChange={(e) => setConsigneeFilter(e.target.value)}
            placeholder="Filter by consignee..."
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="pending_intake">Pending Intake</MenuItem>
              <MenuItem value="listed">Listed</MenuItem>
              <MenuItem value="sold">Sold</MenuItem>
              <MenuItem value="expired">Expired</MenuItem>
              <MenuItem value="returned">Returned</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>

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
