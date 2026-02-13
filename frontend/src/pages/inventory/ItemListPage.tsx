import { useState, useMemo } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  InputAdornment,
  MenuItem,
  TextField,
} from '@mui/material';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useItems, useUpdateItem } from '../../hooks/useInventory';
import type { Item, ItemStatus, ItemSource } from '../../types/inventory.types';

const ITEM_STATUSES: ItemStatus[] = [
  'intake',
  'processing',
  'on_shelf',
  'sold',
  'returned',
  'scrapped',
];

const ITEM_SOURCES: ItemSource[] = ['purchased', 'consignment', 'house'];

function formatCurrency(value: string | null): string {
  if (value == null) return '—';
  const n = parseFloat(value);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

export default function ItemListPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [form, setForm] = useState({
    title: '',
    brand: '',
    category: '',
    price: '',
  });

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (search) p.search = search;
    if (statusFilter) p.status = statusFilter;
    if (sourceFilter) p.source = sourceFilter;
    if (categoryFilter) p.category = categoryFilter;
    return p;
  }, [search, statusFilter, sourceFilter, categoryFilter]);

  const { data, isLoading } = useItems(params);
  const updateItem = useUpdateItem();

  const items = data?.results ?? [];

  const columns: GridColDef[] = [
    { field: 'sku', headerName: 'SKU', width: 140 },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 180 },
    { field: 'brand', headerName: 'Brand', width: 120 },
    { field: 'category', headerName: 'Category', width: 120 },
    {
      field: 'price',
      headerName: 'Price',
      width: 100,
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: ({ value }) => <StatusBadge status={value} size="small" />,
    },
    {
      field: 'source',
      headerName: 'Source',
      width: 110,
      valueFormatter: (value) =>
        String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    },
  ];

  const handleRowClick = ({ row }: { row: Item }) => {
    setSelectedItem(row);
    setForm({
      title: row.title,
      brand: row.brand,
      category: row.category,
      price: row.price,
    });
  };

  const handleSave = async () => {
    if (!selectedItem) return;
    try {
      await updateItem.mutateAsync({
        id: selectedItem.id,
        data: form,
      });
      enqueueSnackbar('Item updated', { variant: 'success' });
      setSelectedItem(null);
    } catch {
      enqueueSnackbar('Failed to update item', { variant: 'error' });
    }
  };

  if (isLoading && items.length === 0) return <LoadingScreen />;

  return (
    <Box>
      <PageHeader
        title="Items"
        subtitle="Browse and manage inventory items"
      />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search by SKU or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <TextField
            fullWidth
            size="small"
            select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {ITEM_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <TextField
            fullWidth
            size="small"
            select
            label="Source"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {ITEM_SOURCES.map((s) => (
              <MenuItem key={s} value={s}>
                {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="Category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            placeholder="Filter by category"
          />
        </Grid>
      </Grid>

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={items}
          columns={columns}
          loading={isLoading}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          onRowClick={(params) => handleRowClick({ row: params.row as Item })}
          getRowId={(row: Item) => row.id}
          sx={{
            border: 'none',
            '& .MuiDataGrid-row': { cursor: 'pointer' },
          }}
        />
      </Box>

      <Dialog
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {selectedItem ? `Item ${selectedItem.sku}` : 'Item'}
        </DialogTitle>
        <DialogContent>
          {selectedItem && (
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="SKU"
                  value={selectedItem.sku}
                  disabled
                  variant="filled"
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Brand"
                  value={form.brand}
                  onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Category"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Price"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Status"
                  value={selectedItem.status}
                  disabled
                  variant="filled"
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Created"
                  value={
                    selectedItem.created_at
                      ? format(new Date(selectedItem.created_at), 'MMM d, yyyy HH:mm')
                      : '—'
                  }
                  disabled
                  variant="filled"
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedItem(null)}>Close</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={updateItem.isPending}
          >
            {updateItem.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
