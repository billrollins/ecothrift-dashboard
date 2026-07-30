import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useReservationAction, useReservations } from '../../hooks/useWebStore';
import type { Reservation } from '../../api/webstore.api';

export default function OnlineSalesInboxPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const { data, isLoading, isError } = useReservations({
    search: search || undefined,
    status: status || undefined,
    ordering: '-created_at',
  });
  const action = useReservationAction();

  const run = async (id: number, act: 'confirm' | 'stage' | 'decline' | 'cancel' | 'expire' | 'complete') => {
    try {
      await action.mutateAsync({ id, action: act });
      enqueueSnackbar(`${act} ok`, { variant: 'success' });
    } catch {
      enqueueSnackbar(`Could not ${act}`, { variant: 'error' });
    }
  };

  const columns: GridColDef<Reservation>[] = [
    { field: 'created_at', headerName: 'Requested', width: 150,
      valueFormatter: (v) => (v ? new Date(String(v)).toLocaleString() : '') },
    { field: 'listing_title', headerName: 'Listing', flex: 1, minWidth: 160 },
    { field: 'customer_name', headerName: 'Customer', width: 140 },
    { field: 'email', headerName: 'Email', width: 180 },
    { field: 'quantity', headerName: 'Qty', width: 70 },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: ({ row }) => <Chip size="small" label={row.status_display || row.status} />,
    },
    {
      field: 'expires_at',
      headerName: 'Expires',
      width: 150,
      valueFormatter: (v) => (v ? new Date(String(v)).toLocaleString() : '—'),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 360,
      sortable: false,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5}>
          {row.status === 'requested' && (
            <Button size="small" onClick={() => run(row.id, 'confirm')}>Confirm</Button>
          )}
          {['requested', 'confirmed'].includes(row.status) && (
            <Button size="small" onClick={() => run(row.id, 'stage')}>Stage</Button>
          )}
          {['requested', 'confirmed', 'ready_for_pickup'].includes(row.status) && (
            <>
              <Button size="small" onClick={() => run(row.id, 'complete')}>Complete</Button>
              <Button size="small" color="warning" onClick={() => run(row.id, 'expire')}>Expire</Button>
              <Button size="small" color="inherit" onClick={() => run(row.id, 'cancel')}>Cancel</Button>
              <Button size="small" color="error" onClick={() => run(row.id, 'decline')}>Decline</Button>
            </>
          )}
        </Stack>
      ),
    },
  ];

  if (isLoading && !data) return <LoadingScreen />;
  if (isError) {
    return (
      <Box>
        <PageHeader
          title="Inbox & Holds"
          subtitle="Verify, stage, confirm, and expire pickup holds. Pay at POS — no online payment."
        />
        <Alert severity="error">Could not load holds.</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Inbox & Holds"
        subtitle="Verify, stage, confirm, and expire pickup holds. Pay at POS — no online payment."
      />
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          placeholder="Search customer or listing"
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
        <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All</MenuItem>
          {['requested', 'confirmed', 'ready_for_pickup', 'completed', 'declined', 'expired', 'cancelled'].map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
      </Stack>
      <Box sx={{ height: 560 }}>
        <DataGrid
          rows={data?.results || []}
          columns={columns}
          getRowId={(r) => r.id}
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Customer status links use unguessable tokens (not ETW order numbers).
      </Typography>
    </Box>
  );
}
