import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { useReservations } from '../../../hooks/useWebStore';
import type { Reservation } from '../../../api/webstore.api';
import {
  expiresAtColumn,
  GRID_HEIGHT,
  GRID_PAGE_PROPS,
  GRID_SX,
  holdStatusLabel,
  noRowsSlot,
  pickupCodeColumn,
  requestedAtColumn,
  statusColumn,
  unreadColumn,
  unreadRowClass,
} from '../presentation';
import { useOnlineSalesMobile } from '../useOnlineSalesMobile';
import HoldMobileList from './HoldMobileList';

/** Live work only. Sent to the server so finished holds can never crowd the
 *  first page and hide today's queue. */
const ACTIVE_STATUSES = 'pending_verification,requested,confirmed,ready_for_pickup';

/** Live work only - finished holds belong on Completed / Released (or search). */
const STATUS_OPTIONS = [
  'pending_verification',
  'requested',
  'confirmed',
  'ready_for_pickup',
];

type Props = {
  onSelect: (id: number) => void;
};

export default function NeedsActionPanel({ onSelect }: Props) {
  const isMobile = useOnlineSalesMobile();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError } = useReservations({
    search: search || undefined,
    status: status || undefined,
    // An explicit status pick overrides the active-only scope; search spans
    // everything so an old pickup code still finds its hold.
    status__in: status || search ? undefined : ACTIVE_STATUSES,
    ordering: '-created_at',
  });

  const columns: GridColDef<Reservation>[] = [
    unreadColumn,
    pickupCodeColumn,
    { field: 'listing_title', headerName: 'Listing', flex: 1.4, minWidth: 180 },
    { field: 'customer_name', headerName: 'Customer', width: 140 },
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 180 },
    {
      field: 'quantity',
      headerName: 'Qty',
      width: 70,
      align: 'right',
      headerAlign: 'right',
    },
    statusColumn,
    requestedAtColumn,
    expiresAtColumn,
  ];

  if (isLoading && !data) return <LoadingScreen />;
  if (isError) return <Alert severity="error">Could not load holds.</Alert>;

  const rows = data?.results || [];
  const emptyTitle = status || search ? 'No holds match this filter' : 'No holds need action';
  const emptyHint = status || search ? undefined : 'New requests land here as they come in.';

  return (
    <>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ mb: isMobile ? 1.5 : 0.5 }}
        flexWrap="wrap"
        useFlexGap
      >
        <TextField
          size="small"
          placeholder="Search code, name, phone, email"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          fullWidth={isMobile}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: isMobile ? 0 : 280, flex: isMobile ? undefined : '1 1 240px' }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          fullWidth={isMobile}
          sx={{ minWidth: isMobile ? 0 : 180 }}
        >
          <MenuItem value="">Live holds</MenuItem>
          {STATUS_OPTIONS.map((value) => (
            <MenuItem key={value} value={value}>
              {holdStatusLabel(value)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {!isMobile && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Awaiting email means the customer has not confirmed yet - stock is already
          reserved, and they can still walk in and pick up. Search covers finished and
          archived holds too.
        </Typography>
      )}
      {isMobile ? (
        <HoldMobileList
          rows={rows}
          onSelect={onSelect}
          emptyTitle={emptyTitle}
          emptyHint={emptyHint}
          emphasis="expires"
        />
      ) : (
        <Box sx={{ height: GRID_HEIGHT }}>
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={(r) => r.id}
            disableRowSelectionOnClick
            onRowClick={(params) => onSelect(params.row.id)}
            getRowClassName={({ row }) => unreadRowClass(row)}
            slots={noRowsSlot(emptyTitle, emptyHint)}
            sx={GRID_SX}
            {...GRID_PAGE_PROPS}
          />
        </Box>
      )}
    </>
  );
}
