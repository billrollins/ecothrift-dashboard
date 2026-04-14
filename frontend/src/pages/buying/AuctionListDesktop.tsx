import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { useCallback, useMemo } from 'react';
import { Box, Chip, IconButton, Tooltip, Typography } from '@mui/material';
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
  formatAuctionCostToRetailPct,
  formatTimeRemaining,
  orderingFromSortModel,
  sortModelFromOrdering,
  timeRemainingSx,
} from '../../utils/buyingAuctionList';
import type { BuyingAuctionListItem } from '../../types/buying.types';
import ManifestListCell from '../../components/buying/ManifestListCell';

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
  /** Yellow tint for watchlist membership on main list */
  watchlistIds?: Set<number>;
};

function formatNeedScoreRaw(score: string | null | undefined): string {
  if (score == null || score === '') return '—';
  const n = Number.parseFloat(String(score));
  if (Number.isNaN(n)) return String(score);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function buildColumns(
  isAdmin: boolean,
  onThumbsToggle: AuctionListDesktopProps['onThumbsToggle'],
  watchlistIds: AuctionListDesktopProps['watchlistIds']
): GridColDef<BuyingAuctionListItem>[] {
  return [
    {
      field: 'watchlist_hint',
      headerName: '',
      width: 40,
      sortable: false,
      align: 'center',
      renderHeader: () => (
        <Tooltip title="On watchlist">
          <StarIcon fontSize="small" sx={{ color: 'action.active' }} />
        </Tooltip>
      ),
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const row = params.row;
        if (watchlistIds === undefined) {
          return (
            <Tooltip title="Watchlist status may be incomplete when watchlist is large">
              <StarBorderIcon fontSize="small" sx={{ color: 'action.disabled' }} />
            </Tooltip>
          );
        }
        const watched = watchlistIds.has(row.id);
        return watched ? (
          <StarIcon fontSize="small" color="warning" />
        ) : (
          <StarBorderIcon fontSize="small" sx={{ color: 'action.disabled' }} />
        );
      },
    },
    {
      field: 'thumbs_up',
      headerName: '',
      width: 76,
      sortable: false,
      align: 'center',
      renderHeader: () => (
        <Tooltip title="Thumbs up (your vote)">
          <ThumbUpIcon fontSize="small" sx={{ color: 'action.active' }} />
        </Tooltip>
      ),
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const row = params.row;
        const active = Boolean(row.thumbs_up);
        const canToggle = isAdmin && onThumbsToggle;
        const icon = active ? (
          <ThumbUpIcon fontSize="small" color="primary" />
        ) : (
          <ThumbUpOutlinedIcon fontSize="small" color="disabled" />
        );
        /* thumbs_up on model is boolean per current user; aggregate count is Phase 3B when API adds it. */
        if (!canToggle) {
          return (
            <Box
              component="span"
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, width: '100%' }}
            >
              {icon}
            </Box>
          );
        }
        return (
          <Box
            component="span"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
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
          </Box>
        );
      },
    },
    {
      field: 'priority',
      headerName: 'Priority',
      width: 72,
      type: 'number',
      sortable: true,
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const row = params.row;
        const p = row.priority ?? '—';
        return (
          <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {p}
          </Typography>
        );
      },
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
      renderCell: (params) => (
        <Typography variant="body2" component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatNeedScoreRaw(params.row.need_score)}
        </Typography>
      ),
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
      field: 'manifest_badge',
      headerName: 'Mfst',
      width: 52,
      sortable: false,
      align: 'center',
      renderCell: (params) => <ManifestListCell hasManifest={params.row.has_manifest} />,
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
      field: 'cost_retail_pct',
      headerName: 'Cost / retail %',
      width: 108,
      sortable: false,
      align: 'right',
      renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
        const row = params.row;
        const pct = formatAuctionCostToRetailPct(row);
        const tip =
          pct === '—'
            ? 'Cost or listing retail missing'
            : `estimated_total_cost ÷ total_retail_value (listing). Cost: ${formatCurrencyWhole(row.estimated_total_cost)} · Retail (listing): ${formatCurrencyWhole(row.total_retail_value)}`;
        return (
          <Tooltip title={tip}>
            <Typography variant="body2" component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {pct}
            </Typography>
          </Tooltip>
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
  watchlistIds,
}: AuctionListDesktopProps) {
  const sortModel: GridSortModel = useMemo(() => sortModelFromOrdering(ordering), [ordering]);
  const columns = useMemo(
    () => buildColumns(isAdmin, onThumbsToggle, watchlistIds),
    [isAdmin, onThumbsToggle, watchlistIds]
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
