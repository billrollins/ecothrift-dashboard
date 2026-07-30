import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useCreateWebListing, useWebListings } from '../../hooks/useWebStore';
import type { WebListing } from '../../api/webstore.api';

const STATUS_COLOR: Record<string, 'default' | 'success' | 'warning' | 'info' | 'error'> = {
  draft: 'default',
  ready: 'info',
  published: 'success',
  paused: 'warning',
  sold: 'error',
  archived: 'default',
};

export default function OnlineSalesListingsPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const createListing = useCreateWebListing();
  const { data, isLoading, isError } = useWebListings({
    search: search || undefined,
    status: status || undefined,
    ordering: '-updated_at',
  });

  const columns = useMemo<GridColDef<WebListing>[]>(
    () => [
      { field: 'title', headerName: 'Title', flex: 1.4, minWidth: 180 },
      { field: 'sku', headerName: 'SKU', width: 110 },
      {
        field: 'status',
        headerName: 'Status',
        width: 120,
        renderCell: ({ row }) => (
          <Chip size="small" label={row.status_display || row.status} color={STATUS_COLOR[row.status] || 'default'} />
        ),
      },
      {
        field: 'price',
        headerName: 'Price',
        width: 90,
        valueFormatter: (value) => (value != null ? `$${value}` : ''),
      },
      {
        field: 'available',
        headerName: 'Avail',
        width: 80,
        valueGetter: (_v, row) => `${row.available}/${row.on_hand}`,
      },
      { field: 'image_count', headerName: 'Photos', width: 80 },
      {
        field: 'updated_at',
        headerName: 'Updated',
        width: 160,
        valueFormatter: (value) => (value ? new Date(String(value)).toLocaleString() : ''),
      },
    ],
    [],
  );

  const onCreate = async () => {
    try {
      const listing = await createListing.mutateAsync({
        title: 'New listing',
        status: 'draft',
        on_hand: 1,
        price: '0.00',
        return_policy: 'final_sale',
      });
      navigate(`/online-sales/listings/${listing.id}`);
    } catch {
      enqueueSnackbar('Could not create listing', { variant: 'error' });
    }
  };

  if (isLoading && !data) return <LoadingScreen />;
  if (isError) {
    return (
      <Box>
        <PageHeader title="Listings" subtitle="Online Sales catalog — open Listing Studio to edit and publish" />
        <Alert severity="error">Could not load listings.</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Listings"
        subtitle="Online Sales catalog — open Listing Studio to edit and publish"
        action={
          <Button variant="contained" startIcon={<Add />} onClick={onCreate}>
            New listing
          </Button>
        }
      />
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search title or SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 240 }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All</MenuItem>
          {['draft', 'ready', 'published', 'paused', 'sold', 'archived'].map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Box sx={{ height: 560 }}>
        <DataGrid
          rows={data?.results || []}
          columns={columns}
          getRowId={(r) => r.id}
          disableRowSelectionOnClick
          onRowClick={(params) => navigate(`/online-sales/listings/${params.row.id}`)}
          pageSizeOptions={[25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Click a row to open Listing Studio.
      </Typography>
    </Box>
  );
}
