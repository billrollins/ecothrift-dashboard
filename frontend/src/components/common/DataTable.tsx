import {
  DataGrid,
  type GridColDef,
  type GridRowsProp,
  type GridValidRowModel,
} from '@mui/x-data-grid';

export interface DataTableProps<T extends GridValidRowModel = GridValidRowModel> {
  rows: GridRowsProp<T>;
  columns: GridColDef<T>[];
  loading?: boolean;
  pageSize?: number;
  onRowClick?: (params: { id: unknown; row: T }) => void;
  toolbar?: React.ReactNode;
  checkboxSelection?: boolean;
}

const DEFAULT_PAGE_SIZE = 50;

export default function DataTable<T extends GridValidRowModel>({
  rows,
  columns,
  loading = false,
  pageSize = DEFAULT_PAGE_SIZE,
  onRowClick,
  toolbar,
  checkboxSelection = false,
}: DataTableProps<T>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {toolbar && (
        <div style={{ marginBottom: 16 }}>{toolbar}</div>
      )}
      <DataGrid
        rows={rows}
        columns={columns}
        loading={loading}
        pageSizeOptions={[10, 25, 50, 100]}
        initialState={{
          pagination: {
            paginationModel: { pageSize, page: 0 },
          },
          density: 'comfortable',
        }}
        checkboxSelection={checkboxSelection}
        onRowClick={
          onRowClick
            ? (params) => onRowClick({ id: params.id, row: params.row as T })
            : undefined
        }
        sx={{
          border: 'none',
          '& .MuiDataGrid-cell:focus': {
            outline: 'none',
          },
          '& .MuiDataGrid-row': {
            cursor: onRowClick ? 'pointer' : 'default',
          },
        }}
      />
    </div>
  );
}
