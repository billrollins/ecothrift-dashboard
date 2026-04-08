import { Box, Chip, Tooltip } from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridRenderCellParams,
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

export type AuctionListDesktopProps = {
  rows: BuyingAuctionListItem[];
  rowCount: number;
  loading: boolean;
  ordering: string;
  onOrderingChange: (ordering: string) => void;
  paginationModel: GridPaginationModel;
  onPaginationModelChange: (model: GridPaginationModel) => void;
  onRowNavigate: (id: number) => void;
};

const columns: GridColDef<BuyingAuctionListItem>[] = [
  {
    field: 'marketplace__name',
    headerName: 'Marketplace',
    width: 130,
    sortable: true,
    valueGetter: (_value, row) => row.marketplace?.name ?? '',
  },
  {
    field: 'title',
    headerName: 'Title',
    flex: 1,
    minWidth: 200,
    sortable: true,
  },
  {
    field: 'current_price',
    headerName: 'Current price',
    width: 120,
    type: 'number',
    sortable: true,
    valueFormatter: (v) => formatCurrencyWhole(v as string | null),
  },
  {
    field: 'retail_sort',
    headerName: 'Total retail',
    width: 130,
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
    field: 'bid_count',
    headerName: 'Bids',
    width: 80,
    type: 'number',
    sortable: true,
  },
  {
    field: 'end_time',
    headerName: 'Time left',
    width: 110,
    sortable: true,
    renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => (
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
    sortable: true,
  },
  {
    field: 'condition_summary',
    headerName: 'Condition',
    width: 120,
    sortable: true,
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 100,
    sortable: true,
  },
  {
    field: 'has_manifest',
    headerName: 'Manifest',
    width: 120,
    sortable: true,
    valueGetter: (_v, row) => {
      const n = row.manifest_row_count ?? 0;
      return row.has_manifest || n > 0;
    },
    renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => {
      const row = params.row;
      const n = row.manifest_row_count ?? 0;
      const has = row.has_manifest || n > 0;
      return (
        <Chip
          size="small"
          label={has ? (n > 0 ? `Yes (${n})` : 'Yes') : 'No'}
          color={has ? 'primary' : 'default'}
          variant={has ? 'filled' : 'outlined'}
        />
      );
    },
  },
];

export default function AuctionListDesktop({
  rows,
  rowCount,
  loading,
  ordering,
  onOrderingChange,
  paginationModel,
  onPaginationModelChange,
  onRowNavigate,
}: AuctionListDesktopProps) {
  const sortModel: GridSortModel = sortModelFromOrdering(ordering);

  return (
    <Box sx={{ flex: 1, minHeight: 400 }}>
      <DataGrid
        rows={rows}
        columns={columns}
        rowCount={rowCount}
        loading={loading}
        pageSizeOptions={[25, 50, 100]}
        paginationMode="server"
        sortingMode="server"
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        sortModel={sortModel}
        onSortModelChange={(model) => {
          onOrderingChange(orderingFromSortModel(model));
        }}
        getRowId={(row) => row.id}
        onRowClick={(params) => onRowNavigate(Number(params.id))}
        disableRowSelectionOnClick
        density="compact"
        sx={{
          height: '100%',
          border: 'none',
          '& .MuiDataGrid-row': { cursor: 'pointer' },
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
