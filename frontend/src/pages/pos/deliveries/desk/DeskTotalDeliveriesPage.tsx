import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Chip,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useDeliveriesSearch, useDeliveryMutations } from '../../../../hooks/useDelivery';
import { useIncludeTestPreference } from '../../../../hooks/useIncludeTestPreference';
import type { DeliveryJob } from '../../../../types/pos.types';
import {
  deskTotalStateToApiParams,
  deskTotalStateToParams,
  parseDeskTotalUrlState,
} from './totalDeliveriesUrlState';

export default function DeskTotalDeliveriesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [includeTest, setIncludeTest] = useIncludeTestPreference();
  const state = useMemo(() => parseDeskTotalUrlState(searchParams), [searchParams]);
  const merged = useMemo(() => ({ ...state, includeTest }), [state, includeTest]);
  const { data, isLoading } = useDeliveriesSearch(deskTotalStateToApiParams(merged));
  const { archive, restore } = useDeliveryMutations();
  const [selected, setSelected] = useState<DeliveryJob | null>(null);
  const rows = data?.results ?? [];

  const patchState = (patch: Partial<typeof state>) => {
    setSearchParams(deskTotalStateToParams({ ...merged, ...patch, page: patch.page ?? 1 }), {
      replace: true,
    });
  };

  useEffect(() => {
    if (state.includeTest && !includeTest) setIncludeTest(true);
  }, [state.includeTest, includeTest, setIncludeTest]);

  useEffect(() => {
    if (state.includeTest === includeTest) return;
    setSearchParams(deskTotalStateToParams({ ...state, includeTest }), { replace: true });
  }, [includeTest, state, setSearchParams]);

  const columns: GridColDef<DeliveryJob>[] = [
    { field: 'customer_name', headerName: 'Customer', flex: 1, minWidth: 140 },
    { field: 'phone', headerName: 'Phone', width: 130 },
    {
      field: 'delivery_address',
      headerName: 'Address',
      flex: 1.2,
      minWidth: 180,
      valueGetter: (_v, row) => row.delivery_address || row.address,
    },
    { field: 'scheduled_date', headerName: 'Date', width: 110 },
    { field: 'status', headerName: 'Status', width: 130 },
    { field: 'item_count', headerName: 'Items', width: 80 },
    {
      field: 'is_test',
      headerName: 'Flags',
      width: 100,
      renderCell: (params) =>
        params.row.is_test ? <Chip size="small" color="warning" label="TEST" /> : null,
    },
  ];

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Search customer / phone / address / SKU / receipt"
          value={state.search}
          onChange={(e) => patchState({ search: e.target.value })}
          sx={{ minWidth: 320, flex: 1 }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={state.status}
          onChange={(e) => patchState({ status: e.target.value })}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="needs_scheduling">Needs scheduling</MenuItem>
          <MenuItem value="scheduled">Scheduled</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
          <MenuItem value="failed">Failed</MenuItem>
        </TextField>
        <FormControlLabel
          control={
            <Switch
              checked={state.includeArchived}
              onChange={(e) => patchState({ includeArchived: e.target.checked })}
            />
          }
          label="Archived"
        />
      </Stack>

      <Box sx={{ height: 520, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={isLoading}
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50]}
          paginationMode="server"
          rowCount={data?.count ?? 0}
          paginationModel={{ page: state.page - 1, pageSize: 50 }}
          onPaginationModelChange={(model) => patchState({ page: model.page + 1 })}
          onRowClick={(params) => setSelected(params.row)}
        />
      </Box>

      <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(null)}>
        <Box sx={{ width: { xs: 320, sm: 420 }, p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h6">Delivery detail</Typography>
            <IconButton onClick={() => setSelected(null)}>
              <CloseIcon />
            </IconButton>
          </Stack>
          {selected && (
            <Stack spacing={1.25}>
              <Typography fontWeight={700}>{selected.customer_name}</Typography>
              <Typography variant="body2">{selected.phone}</Typography>
              <Typography variant="body2">
                {selected.delivery_address || selected.address}
              </Typography>
              <Typography variant="body2">
                {selected.scheduled_date || 'Unscheduled'} · {selected.status}
              </Typography>
              <Typography variant="body2">
                Items ({selected.item_count}): {selected.items_delivered}
              </Typography>
              {(selected.items || []).map((it) => (
                <Chip
                  key={it.id}
                  size="small"
                  label={`${it.quantity}× ${it.description}${it.sku ? ` [${it.sku}]` : ''}`}
                />
              ))}
              <Stack direction="row" spacing={1} sx={{ pt: 1 }}>
                {!selected.is_archived ? (
                  <Chip
                    clickable
                    color="warning"
                    label="Archive / cancel"
                    onClick={async () => {
                      await archive.mutateAsync({ id: selected.id, reason: 'desk cancel' });
                      setSelected(null);
                    }}
                  />
                ) : (
                  <Chip
                    clickable
                    color="success"
                    label="Restore"
                    onClick={async () => {
                      const restored = await restore.mutateAsync({
                        id: selected.id,
                        reason: 'desk restore',
                      });
                      setSelected(restored);
                    }}
                  />
                )}
              </Stack>
            </Stack>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}
