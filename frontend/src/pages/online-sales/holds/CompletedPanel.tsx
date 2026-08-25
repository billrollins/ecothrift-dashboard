import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { useSalesLog } from '../../../hooks/useWebStore';
import type { Reservation } from '../../../api/webstore.api';
import { formatCurrency } from '../../../utils/format';
import {
  completedAtColumn,
  GRID_FILL_SX,
  PAGE_FILL_SX,
  GRID_PAGE_PROPS,
  GRID_SX,
  noRowsSlot,
  pickupCodeColumn,
  unreadColumn,
} from '../presentation';
import { useOnlineSalesMobile } from '../useOnlineSalesMobile';
import HoldMobileList from './HoldMobileList';

type RangeKey = 'today' | '7' | '30' | 'all';

const RANGE_DAYS: Record<RangeKey, number | null> = {
  today: 0,
  '7': 7,
  '30': 30,
  all: null,
};

const RANGES: Array<[RangeKey, string]> = [
  ['today', 'Today'],
  ['7', '7 days'],
  ['30', '30 days'],
  ['all', 'All'],
];

function moneySum(rows: Reservation[], field: 'line_total' | 'contribution'): number {
  return rows.reduce((acc, row) => {
    const n = Number.parseFloat(String(row[field] ?? '0'));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

type Props = {
  onSelect: (id: number) => void;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function CompletedPanel({ onSelect }: Props) {
  const isMobile = useOnlineSalesMobile();
  const [range, setRange] = useState<RangeKey>('30');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const params = useMemo(
    () => ({
      days: RANGE_DAYS[range],
      search: search || undefined,
    }),
    [range, search],
  );

  const { data, isLoading, isError } = useSalesLog(params);
  const rows = data || [];

  const totals = useMemo(() => {
    const units = rows.reduce((acc, r) => acc + (r.quantity || 0), 0);
    return {
      sales: rows.length,
      units,
      gross: moneySum(rows, 'line_total'),
      contribution: moneySum(rows, 'contribution'),
    };
  }, [rows]);

  const cols: GridColDef<Reservation>[] = [
    unreadColumn,
    pickupCodeColumn,
    completedAtColumn,
    { field: 'listing_title', headerName: 'Listing', flex: 1.4, minWidth: 180 },
    {
      field: 'item_sku',
      headerName: 'SKU',
      width: 110,
      valueGetter: (_v, row) => row.item_sku || '-',
    },
    { field: 'customer_name', headerName: 'Customer', width: 150 },
    {
      field: 'quantity',
      headerName: 'Qty',
      width: 70,
      align: 'right',
      headerAlign: 'right',
    },
    {
      field: 'line_total',
      headerName: 'Gross',
      width: 110,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (v) => formatCurrency(v == null ? null : String(v)),
    },
    {
      field: 'contribution',
      headerName: 'Contribution',
      width: 125,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (v) => formatCurrency(v == null ? null : String(v)),
    },
    {
      field: 'pos_cart',
      headerName: 'POS',
      width: 100,
      renderCell: ({ row }) =>
        row.pos_cart ? (
          <Chip size="small" color="success" variant="outlined" label={`#${row.pos_cart}`} />
        ) : (
          <Typography variant="body2" color="text.disabled">
            -
          </Typography>
        ),
    },
  ];

  if (isLoading && !data) return <LoadingScreen />;
  if (isError) return <Alert severity="error">Could not load completed sales.</Alert>;

  return (
    <Box sx={PAGE_FILL_SX}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ mb: 2 }}
        flexWrap="wrap"
        useFlexGap
        alignItems={{ sm: 'center' }}
      >
        <ToggleButtonGroup
          exclusive
          size="small"
          value={range}
          onChange={(_e, next: RangeKey | null) => next && setRange(next)}
          sx={{ flexWrap: 'wrap' }}
        >
          {RANGES.map(([key, label]) => (
            <ToggleButton key={key} value={key} sx={{ textTransform: 'none', px: 1.5, flex: isMobile ? 1 : undefined }}>
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          size="small"
          placeholder="Search customer, listing, SKU"
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
          sx={{ minWidth: isMobile ? 0 : 260, ml: { sm: 'auto' } }}
        />
      </Stack>

      <Paper variant="outlined" sx={{ p: isMobile ? 1.5 : 2, mb: 2, borderRadius: 2 }}>
        <Stack
          direction="row"
          spacing={isMobile ? 2 : 4}
          flexWrap="wrap"
          useFlexGap
          justifyContent={isMobile ? 'space-between' : 'flex-start'}
        >
          <Stat label="Sales" value={String(totals.sales)} />
          <Stat label="Units" value={String(totals.units)} />
          <Stat label="Gross" value={formatCurrency(totals.gross)} />
          {!isMobile && (
            <Stat label="Contribution" value={formatCurrency(totals.contribution)} />
          )}
        </Stack>
      </Paper>

      {isMobile ? (
        <HoldMobileList
          rows={rows}
          onSelect={onSelect}
          emptyTitle="No completed online sales in this range"
          emphasis="completed"
          showMoney
        />
      ) : (
        <Box sx={GRID_FILL_SX}>
          <DataGrid
            rows={rows}
            columns={cols}
            getRowId={(r) => r.id}
            disableRowSelectionOnClick
            onRowClick={(params) => onSelect(params.row.id)}
            slots={noRowsSlot('No completed online sales in this range')}
            sx={GRID_SX}
            {...GRID_PAGE_PROPS}
          />
        </Box>
      )}
    </Box>
  );
}
