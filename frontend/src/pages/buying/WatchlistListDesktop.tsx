import { Box, Chip, IconButton, Tooltip } from '@mui/material';
import BookmarkRemove from '@mui/icons-material/BookmarkRemove';
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridRenderCellParams,
  type GridSortModel,
} from '@mui/x-data-grid';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '../../utils/format';
import {
  watchlistOrderingFromSortModel,
  watchlistSortModelFromOrdering,
} from '../../utils/buyingWatchlistList';
import { formatTimeRemaining, timeRemainingSx } from '../../utils/buyingAuctionList';
import type { BuyingWatchlistAuctionItem } from '../../types/buying.types';

export type WatchlistListDesktopProps = {
  rows: BuyingWatchlistAuctionItem[];
  rowCount: number;
  loading: boolean;
  ordering: string;
  onOrderingChange: (ordering: string) => void;
  paginationModel: GridPaginationModel;
  onPaginationModelChange: (model: GridPaginationModel) => void;
  onRowNavigate: (id: number) => void;
  onRemove: (auctionId: number) => void;
  removingId: number | null;
};

function formatAdded(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'MMM d, yyyy h:mm a');
  } catch {
    return iso;
  }
}

const columns = (
  onRemove: (id: number) => void,
  removingId: number | null
): GridColDef<BuyingWatchlistAuctionItem>[] => [
  {
    field: 'marketplace_name',
    headerName: 'Marketplace',
    width: 130,
    sortable: false,
    valueGetter: (_value, row) => row.marketplace?.name ?? '',
  },
  {
    field: 'title',
    headerName: 'Title',
    flex: 1,
    minWidth: 180,
    sortable: false,
  },
  {
    field: 'current_price',
    headerName: 'Current price',
    width: 120,
    type: 'number',
    valueFormatter: (v) => formatCurrency(v as string | null),
  },
  {
    field: 'total_retail_value',
    headerName: 'Total retail',
    width: 130,
    type: 'number',
    valueFormatter: (v) => formatCurrency(v as string | null),
  },
  {
    field: 'bid_count',
    headerName: 'Bids',
    width: 80,
    type: 'number',
    sortable: false,
  },
  {
    field: 'end_time',
    headerName: 'Time left',
    width: 110,
    renderCell: (params: GridRenderCellParams<BuyingWatchlistAuctionItem>) => (
      <Box component="span" sx={timeRemainingSx(params.row.end_time)}>
        {formatTimeRemaining(params.row.end_time)}
      </Box>
    ),
  },
  {
    field: 'lot_size',
    headerName: 'Lot size',
    width: 90,
    type: 'number',
    sortable: false,
  },
  {
    field: 'condition_summary',
    headerName: 'Condition',
    width: 120,
    sortable: false,
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 100,
    sortable: false,
  },
  {
    field: 'has_manifest',
    headerName: 'Manifest',
    width: 100,
    sortable: false,
    renderCell: (params: GridRenderCellParams<BuyingWatchlistAuctionItem>) => (
      <Chip
        size="small"
        label={params.row.has_manifest ? 'Yes' : 'No'}
        color={params.row.has_manifest ? 'primary' : 'default'}
        variant={params.row.has_manifest ? 'filled' : 'outlined'}
      />
    ),
  },
  {
    field: 'watchlist_priority',
    headerName: 'Priority',
    width: 100,
    sortable: false,
    valueGetter: (_v, row) => row.watchlist_entry?.priority ?? '',
  },
  {
    field: 'added_at',
    headerName: 'Added',
    width: 160,
    sortable: true,
    valueGetter: (_v, row) => row.added_at ?? row.watchlist_entry?.added_at ?? '',
    renderCell: (params: GridRenderCellParams<BuyingWatchlistAuctionItem>) => (
      <span>{formatAdded(params.row.added_at ?? params.row.watchlist_entry?.added_at)}</span>
    ),
  },
  {
    field: 'actions',
    headerName: '',
    width: 52,
    sortable: false,
    align: 'center',
    renderCell: (params: GridRenderCellParams<BuyingWatchlistAuctionItem>) => (
      <Tooltip title="Remove from watchlist">
        <span>
          <IconButton
            size="small"
            disabled={removingId === params.row.id}
            aria-label="Remove from watchlist"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(params.row.id);
            }}
          >
            <BookmarkRemove fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    ),
  },
];

export default function WatchlistListDesktop({
  rows,
  rowCount,
  loading,
  ordering,
  onOrderingChange,
  paginationModel,
  onPaginationModelChange,
  onRowNavigate,
  onRemove,
  removingId,
}: WatchlistListDesktopProps) {
  const sortModel: GridSortModel = watchlistSortModelFromOrdering(ordering);

  return (
    <Box sx={{ flex: 1, minHeight: 400 }}>
      <DataGrid
        rows={rows}
        columns={columns(onRemove, removingId)}
        rowCount={rowCount}
        loading={loading}
        pageSizeOptions={[25, 50, 100]}
        paginationMode="server"
        sortingMode="server"
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        sortModel={sortModel}
        onSortModelChange={(model) => {
          onOrderingChange(watchlistOrderingFromSortModel(model));
        }}
        getRowId={(row) => row.id}
        onRowClick={(params) => onRowNavigate(Number(params.id))}
        disableRowSelectionOnClick
        density="compact"
        sx={{
          height: '100%',
          border: 'none',
          '& .MuiDataGrid-row': { cursor: 'pointer' },
        }}
      />
    </Box>
  );
}
