import { forwardRef, useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Chip,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { StatusBadge } from '../common/StatusBadge';
import { LoadingScreen } from '../feedback/LoadingScreen';
import { useItems } from '../../hooks/useInventory';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { Item, ItemCondition, ItemSource, ItemStatus } from '../../types/inventory.types';
import {
  formatConditionLabel,
  formatItemSourceLabel,
  ITEM_CONDITIONS,
  ITEM_SOURCES,
} from '../../constants/inventory.constants';

const ITEM_STATUSES: ItemStatus[] = [
  'intake',
  'processing',
  'on_shelf',
  'sold',
  'returned',
  'scrapped',
  'lost',
];

function formatCurrency(value: string | null): string {
  if (value == null) return '—';
  const n = parseFloat(value);
  return Number.isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

function isRecentlyAdded(row: Item, recent: Set<number>): boolean {
  return recent.has(row.id);
}

function statusLabel(s: ItemStatus): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export type ItemListPanelProps = {
  onRowClick: (item: Item) => void;
  recentlyAddedIds: Set<number>;
  /** Highlights the row for the open edit session */
  selectedItemId?: number | null;
  /** Fixed DataGrid height; omit to fill remaining space in a flex parent (Items split layout). */
  height?: number | string;
  /** Report total match count from API for parent header */
  onCountsChange?: (payload: { total: number }) => void;
};

const ItemListPanel = forwardRef<HTMLInputElement, ItemListPanelProps>(function ItemListPanel(
  {
    onRowClick,
    recentlyAddedIds,
    selectedItemId = null,
    height,
    onCountsChange,
  },
  ref,
) {
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const [statusFilter, setStatusFilter] = useState<ItemStatus[]>([]);
  const [conditionFilter, setConditionFilter] = useState<ItemCondition[]>([]);
  const [sourceFilter, setSourceFilter] = useState<ItemSource[]>([]);
  const [lastDays, setLastDays] = useState<string>('');

  const params = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (debouncedSearch.trim()) p.q = debouncedSearch.trim();
    if (statusFilter.length) p.status = statusFilter.join(',');
    if (conditionFilter.length) p.condition = conditionFilter.join(',');
    if (sourceFilter.length) p.source = sourceFilter.join(',');
    if (lastDays) {
      const n = parseInt(lastDays, 10);
      if (!Number.isNaN(n)) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        d.setHours(0, 0, 0, 0);
        p.updated_after = d.toISOString();
      }
    }
    return p;
  }, [debouncedSearch, statusFilter, conditionFilter, sourceFilter, lastDays]);

  const { data, isLoading } = useItems(params);
  const items = data?.results ?? [];
  const total = data?.count ?? items.length;

  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: 'title',
        headerName: 'Title',
        flex: 1,
        minWidth: 160,
        renderCell: ({ row }) => (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ height: '100%' }}>
            <span>{row.title}</span>
            {isRecentlyAdded(row as Item, recentlyAddedIds) && (
              <Chip label="NEW" size="small" color="success" sx={{ height: 20, fontSize: '0.65rem' }} />
            )}
          </Stack>
        ),
      },
      { field: 'brand', headerName: 'Brand', width: 120 },
      { field: 'category', headerName: 'Category', width: 130 },
      {
        field: 'price',
        headerName: 'Price',
        width: 100,
        valueFormatter: (value) => formatCurrency(value),
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 120,
        renderCell: ({ value }) => <StatusBadge status={value} size="small" />,
      },
    ],
    [recentlyAddedIds],
  );

  useEffect(() => {
    onCountsChange?.({ total });
  }, [total, onCountsChange]);

  const gridContainerSx =
    height != null
      ? { height }
      : { flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' as const };

  if (isLoading && items.length === 0) {
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LoadingScreen />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
      }}
    >
      <TextField
        inputRef={ref}
        fullWidth
        size="small"
        placeholder="Search items (SKU, title, brand, notes…)"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        sx={{ mb: 1.5 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" color="action" />
              </InputAdornment>
            ),
          },
        }}
      />

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        flexWrap="wrap"
        sx={{ mb: 1.5, alignItems: { sm: 'flex-start' }, gap: 1 }}
      >
        <Autocomplete<ItemStatus, true, false, false>
          multiple
          size="small"
          options={ITEM_STATUSES}
          value={statusFilter}
          onChange={(_, v) => setStatusFilter(v)}
          getOptionLabel={(o) => statusLabel(o)}
          renderInput={(params) => <TextField {...params} label="Status" placeholder="All" />}
          sx={{ minWidth: { xs: '100%', sm: 160 }, flex: { sm: '1 1 140px' } }}
        />
        <Autocomplete<ItemCondition, true, false, false>
          multiple
          size="small"
          options={ITEM_CONDITIONS}
          value={conditionFilter}
          onChange={(_, v) => setConditionFilter(v)}
          getOptionLabel={(o) => formatConditionLabel(o)}
          renderInput={(params) => <TextField {...params} label="Condition" placeholder="All" />}
          sx={{ minWidth: { xs: '100%', sm: 160 }, flex: { sm: '1 1 140px' } }}
        />
        <Autocomplete<ItemSource, true, false, false>
          multiple
          size="small"
          options={ITEM_SOURCES}
          value={sourceFilter}
          onChange={(_, v) => setSourceFilter(v)}
          getOptionLabel={(o) => formatItemSourceLabel(o)}
          renderInput={(params) => <TextField {...params} label="Source" placeholder="All" />}
          sx={{ minWidth: { xs: '100%', sm: 160 }, flex: { sm: '1 1 140px' } }}
        />
        <TextField
          select
          size="small"
          label="Updated within"
          value={lastDays}
          onChange={(e) => setLastDays(e.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 150 } }}
        >
          <MenuItem value="">Any time</MenuItem>
          <MenuItem value="30">Last 30 days</MenuItem>
          <MenuItem value="60">Last 60 days</MenuItem>
          <MenuItem value="90">Last 90 days</MenuItem>
        </TextField>
      </Stack>

      <Box sx={gridContainerSx}>
        <DataGrid
          rows={items}
          columns={columns}
          loading={isLoading}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          onRowClick={(params) => onRowClick(params.row as Item)}
          getRowId={(row: Item) => row.id}
          getRowClassName={(params) => {
            const id = params.id as number;
            const classes: string[] = [];
            if (selectedItemId != null && id === selectedItemId) classes.push('items-row-selected');
            if (recentlyAddedIds.has(id)) classes.push('items-row-new');
            return classes.join(' ');
          }}
          sx={{
            ...(height == null ? { height: '100%' } : {}),
            border: 'none',
            '@keyframes itemsRowNewPulse': {
              '0%': { bgcolor: 'rgba(46, 125, 50, 0.2)' },
              '100%': { bgcolor: 'transparent' },
            },
            '& .MuiDataGrid-row': { cursor: 'pointer' },
            '& .items-row-selected': {
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(99, 102, 241, 0.16)' : 'rgba(99, 102, 241, 0.12)',
            },
            '& .items-row-new': {
              animation: 'itemsRowNewPulse 2s ease-out 1',
            },
          }}
        />
      </Box>
    </Box>
  );
});

export default ItemListPanel;
