import { Box, Chip } from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridRenderCellParams,
  type GridSortModel,
} from '@mui/x-data-grid';
import { formatCurrency } from '../../utils/format';
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
    minWidth: 200,
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
  },
  {
    field: 'end_time',
    headerName: 'Time left',
    width: 110,
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
  },
  {
    field: 'has_manifest',
    headerName: 'Manifest',
    width: 100,
    sortable: false,
    renderCell: (params: GridRenderCellParams<BuyingAuctionListItem>) => (
      <Chip
        size="small"
        label={params.row.has_manifest ? 'Yes' : 'No'}
        color={params.row.has_manifest ? 'primary' : 'default'}
        variant={params.row.has_manifest ? 'filled' : 'outlined'}
      />
    ),
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
        }}
      />
    </Box>
  );
}
