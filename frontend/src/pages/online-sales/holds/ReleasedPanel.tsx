import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { useReservations } from '../../../hooks/useWebStore';
import type { Reservation } from '../../../api/webstore.api';
import {
  GRID_HEIGHT,
  GRID_PAGE_PROPS,
  GRID_SX,
  holdStatusLabel,
  noRowsSlot,
  pickupCodeColumn,
  releasedAtColumn,
  statusColumn,
  unreadColumn,
} from '../presentation';
import { useOnlineSalesMobile } from '../useOnlineSalesMobile';
import HoldMobileList from './HoldMobileList';

const RELEASED = ['cancelled', 'declined', 'expired'] as const;

type Props = {
  onSelect: (id: number) => void;
};

export default function ReleasedPanel({ onSelect }: Props) {
  const isMobile = useOnlineSalesMobile();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError } = useReservations({
    search: search || undefined,
    status__in: status || RELEASED.join(','),
    ordering: '-updated_at',
    // Searching spans both tiers so an old hold is still findable by code.
    archived: search ? undefined : showArchived ? '1' : '0',
  });

  const columns: GridColDef<Reservation>[] = [
    unreadColumn,
    pickupCodeColumn,
    releasedAtColumn,
    { field: 'listing_title', headerName: 'Listing', flex: 1.3, minWidth: 180 },
    { field: 'customer_name', headerName: 'Customer', width: 150 },
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 180 },
    statusColumn,
    {
      field: 'release_reason',
      headerName: 'Reason',
      flex: 1.2,
      minWidth: 170,
      valueFormatter: (v) => (v ? String(v) : '-'),
    },
  ];

  if (isLoading && !data) return <LoadingScreen />;
  if (isError) return <Alert severity="error">Could not load released holds.</Alert>;

  const rows = data?.results || [];
  const emptyTitle = showArchived ? 'Nothing archived yet' : 'No released holds';
  const emptyHint = showArchived
    ? undefined
    : 'Cancelled, declined, and expired holds land here.';

  return (
    <>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ mb: isMobile ? 1.5 : 0.5 }}
        flexWrap="wrap"
        useFlexGap
        alignItems={{ sm: 'center' }}
      >
        <TextField
          size="small"
          placeholder="Search customer or listing"
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
          sx={{ minWidth: isMobile ? 0 : 260, flex: isMobile ? undefined : '1 1 220px' }}
        />
        <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap">
          <TextField
            select
            size="small"
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            sx={{ minWidth: 160, flex: isMobile ? 1 : undefined }}
          >
            <MenuItem value="">All released</MenuItem>
            {RELEASED.map((s) => (
              <MenuItem key={s} value={s}>
                {holdStatusLabel(s)}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            sx={{ ml: { sm: 'auto' }, mr: 0 }}
            control={
              <Switch
                size="small"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
            }
            label="Archived"
          />
        </Stack>
      </Stack>
      {!isMobile && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Holds archive themselves 30 days after release. Open a row to reopen it while
          the item is still available, or to archive it now.
        </Typography>
      )}
      {isMobile ? (
        <HoldMobileList
          rows={rows}
          onSelect={onSelect}
          emptyTitle={emptyTitle}
          emptyHint={emptyHint}
          emphasis="released"
        />
      ) : (
        <Box sx={{ height: GRID_HEIGHT }}>
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={(r) => r.id}
            disableRowSelectionOnClick
            onRowClick={(params) => onSelect(params.row.id)}
            slots={noRowsSlot(emptyTitle, emptyHint)}
            sx={GRID_SX}
            {...GRID_PAGE_PROPS}
          />
        </Box>
      )}
    </>
  );
}
