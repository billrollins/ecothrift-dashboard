import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useCallback, useMemo } from 'react';
import { Box, Chip, IconButton, Tooltip } from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridRenderCellParams,
  type GridRowClassNameParams,
  type GridSortModel,
} from '@mui/x-data-grid';
import { formatCurrencyWhole } from '../../utils/format';
import {
  formatTimeRemaining,
  orderingFromSortModel,
  sortModelFromOrdering,
  timeRemainingSx,
} from '../../utils/buyingAuctionList';
import type { BuyingAuctionListItem } from '../../types/buying.types';
import NeedPill from '../../components/buying/NeedPill';
import ProfitabilityPill from '../../components/buying/ProfitabilityPill';

export type AuctionListDesktopProps = {
  rows: BuyingAuctionListItem[];
  rowCount: number;
  loading: boolean;
  ordering: string;
  onOrderingChange: (ordering: string) => void;
  paginationModel: GridPaginationModel;
  onPaginationModelChange: (model: GridPaginationModel) => void;
  onRowNavigate: (id: number) => void;
  isAdmin?: boolean;
  onThumbsToggle?: (id: number, next: boolean) => void;
  onPriorityDelta?: (id: number, delta: -1 | 1) => void;
  /** Yellow tint for watchlist membership on main list */
  watchlistIds?: Set<number>;
};

function buildColumns(
  isAdmin: boolean,
  onThumbsToggle: AuctionListDesktopProps['onThumbsToggle'],
  onPriorityDelta: AuctionListDesktopProps['onPriorityDelta']
): GridColDef<BuyingAuctionListItem>[] {
  return [
    {
      field: 'thumbs_up',
      headerName: '',
      width: 44,
      sortable: false,
      align: 'center',
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const row = params.row;
        const active = Boolean(row.thumbs_up);
        const canToggle = isAdmin && onThumbsToggle;
        const icon = active ? (
          <ThumbUpIcon fontSize="small" color="primary" />
        ) : (
          <ThumbUpOutlinedIcon fontSize="small" color="disabled" />
        );
        if (!canToggle) {
          return (
            <Box component="span" sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
              {icon}
            </Box>
          );
        }
        return (
          <IconButton
            size="small"
            aria-label={active ? 'Remove thumbs up' : 'Thumbs up'}
            onClick={(e) => {
              e.stopPropagation();
              onThumbsToggle(row.id, !active);
            }}
          >
            {icon}
          </IconButton>
        );
      },
    },
    {
      field: 'marketplace__name',
      headerName: 'Vendor',
      width: 100,
      sortable: true,
      valueGetter: (_value, row) => row.marketplace?.name ?? '',
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => (
        <Chip size="small" label={params.row.marketplace?.name ?? '—'} color="primary" variant="outlined" />
      ),
    },
    {
      field: 'title',
      headerName: 'Title',
      flex: 1,
      minWidth: 160,
      sortable: true,
    },
    {
      field: 'current_price',
      headerName: 'Price',
      width: 88,
      type: 'number',
      sortable: true,
      valueFormatter: (v) => formatCurrencyWhole(v as string | null),
    },
    {
      field: 'retail_sort',
      headerName: 'Retail',
      width: 100,
      type: 'number',
      sortable: true,
      valueGetter: (_v, row) => {
        const s = row.retail_sort;
        if (s == null || s === '') return null;
        const n = Number.parseFloat(String(s));
        return Number.isNaN(n) ? null : n;
      },
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const row = params.row;
        const display = row.total_retail_display ?? row.total_retail_value;
        const src = row.retail_source ?? 'listing';
        const tip =
          src === 'manifest'
            ? `From manifest: ${formatCurrencyWhole(display)}`
            : `From listing: ${formatCurrencyWhole(display)}`;
        return (
          <Tooltip title={tip}>
            <Box component="span">{formatCurrencyWhole(display)}</Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'estimated_revenue',
      headerName: 'Est. revenue',
      width: 108,
      type: 'number',
      sortable: true,
      valueGetter: (_v, row) => {
        const s = row.estimated_revenue;
        if (s == null || s === '') return null;
        const n = Number.parseFloat(String(s));
        return Number.isNaN(n) ? null : n;
      },
      valueFormatter: (v) => formatCurrencyWhole(v as string | null),
    },
    {
      field: 'profitability_ratio',
      headerName: 'Profitability',
      width: 130,
      type: 'number',
      sortable: true,
      valueGetter: (_v, row) => {
        const s = row.profitability_ratio;
        if (s == null || s === '') return null;
        const n = Number.parseFloat(String(s));
        return Number.isNaN(n) ? null : n;
      },
      renderCell: (params) => <ProfitabilityPill ratio={params.row.profitability_ratio} />,
    },
    {
      field: 'need_score',
      headerName: 'Need',
      width: 88,
      type: 'number',
      sortable: true,
      valueGetter: (_v, row) => {
        const s = row.need_score;
        if (s == null || s === '') return null;
        const n = Number.parseFloat(String(s));
        return Number.isNaN(n) ? null : n;
      },
      renderCell: (params) => <NeedPill score={params.row.need_score} />,
    },
    {
      field: 'priority',
      headerName: 'Priority',
      width: 108,
      type: 'number',
      sortable: true,
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const row = params.row;
        const p = row.priority ?? '—';
        const canStep = isAdmin && onPriorityDelta && typeof row.priority === 'number';
        return (
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            {canStep ? (
              <>
                <IconButton
                  size="small"
                  aria-label="Decrease priority"
                  disabled={row.priority! <= 1}
                  onClick={() => onPriorityDelta(row.id, -1)}
                >
                  <KeyboardArrowDownIcon fontSize="small" />
                </IconButton>
                <Box component="span" sx={{ fontWeight: 700, minWidth: 24, textAlign: 'center' }}>
                  {p}
                </Box>
                <IconButton
                  size="small"
                  aria-label="Increase priority"
                  disabled={row.priority! >= 99}
                  onClick={() => onPriorityDelta(row.id, 1)}
                >
                  <KeyboardArrowUpIcon fontSize="small" />
                </IconButton>
              </>
            ) : (
              <Box component="span" sx={{ fontWeight: 700 }}>
                {p}
              </Box>
            )}
          </Box>
        );
      },
    },
    {
      field: 'end_time',
      headerName: 'Time left',
      width: 96,
      sortable: true,
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => (
        <Box component="span" sx={timeRemainingSx(params.row.end_time)}>
          {formatTimeRemaining(params.row.end_time)}
        </Box>
      ),
    },
  ];
}

export default function AuctionListDesktop({
  rows,
  rowCount,
  loading,
  ordering,
  onOrderingChange,
  paginationModel,
  onPaginationModelChange,
  onRowNavigate,
  isAdmin = false,
  onThumbsToggle,
  onPriorityDelta,
  watchlistIds,
}: AuctionListDesktopProps) {
  // New array refs every render make DataGrid think columns/sort changed and reset controlled pagination.
  const sortModel: GridSortModel = useMemo(() => sortModelFromOrdering(ordering), [ordering]);
  const columns = useMemo(
    () => buildColumns(isAdmin, onThumbsToggle, onPriorityDelta),
    [isAdmin, onThumbsToggle, onPriorityDelta]
  );

  const handleSortModelChange = useCallback(
    (model: GridSortModel) => {
      onOrderingChange(orderingFromSortModel(model));
    },
    [onOrderingChange]
  );

  const getRowClassName = useCallback(
    (params: GridRowClassNameParams<BuyingAuctionListItem>) =>
      watchlistIds?.has(Number(params.id)) ? 'buying-auction-row--watched' : '',
    [watchlistIds]
  );

  const handleRowClick = useCallback(
    (params: { id: string | number }) => {
      onRowNavigate(Number(params.id));
    },
    [onRowNavigate]
  );

  return (
    <Box sx={{ flex: 1, minHeight: 400 }}>
      <DataGrid
        rows={rows}
        columns={columns}
        rowCount={rowCount}
        loading={loading}
        /* First option must match AuctionListPage initial paginationModel.pageSize (50) or MUI may sync to 25 and break server pagination. */
        pageSizeOptions={[50, 25, 100]}
        paginationMode="server"
        sortingMode="server"
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        sortModel={sortModel}
        onSortModelChange={handleSortModelChange}
        getRowId={(row) => row.id}
        onRowClick={handleRowClick}
        disableRowSelectionOnClick
        density="compact"
        getRowClassName={getRowClassName}
        sx={{
          height: '100%',
          border: 'none',
          '& .MuiDataGrid-row': { cursor: 'pointer' },
          '& .MuiDataGrid-row.buying-auction-row--watched': {
            backgroundColor: '#fffde7',
          },
          '& .MuiDataGrid-columnHeader .MuiDataGrid-sortIcon': {
            opacity: 0,
            transition: 'opacity 0.15s ease',
          },
          '& .MuiDataGrid-columnHeader:hover .MuiDataGrid-sortIcon': { opacity: 1 },
        }}
      />
    </Box>
  );
}
