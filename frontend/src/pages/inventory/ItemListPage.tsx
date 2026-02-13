import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  TextField,
  Tooltip,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Search from '@mui/icons-material/Search';
import Delete from '@mui/icons-material/Delete';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import { useItems, useCreateItem, useDeleteItem } from '../../hooks/useInventory';
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

const EMPTY_CREATE_FORM = {
  title: '',
  brand: '',
  category: '',
  price: '',
  source: 'purchased' as ItemSource,
  notes: '',
};

export default function ItemListPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE_FORM });

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (search) p.search = search;
    if (statusFilter) p.status = statusFilter;
    if (sourceFilter) p.source = sourceFilter;
    if (categoryFilter) p.category = categoryFilter;
    return p;
  }, [search, statusFilter, sourceFilter, categoryFilter]);

  const { data, isLoading } = useItems(params);
  const createItem = useCreateItem();
  const deleteItem = useDeleteItem();

  const items = data?.results ?? [];

  const handleOpenDelete = (item: Item) => {
    setDeleteTarget(item);
    setDeleteOpen(true);
  };

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
    {
      field: 'actions',
      headerName: '',
      width: 60,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Tooltip title="Delete">
            <IconButton
              size="small"
              color="error"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenDelete(row as Item);
              }}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const handleCreate = async () => {
    if (!createForm.title) {
      enqueueSnackbar('Title is required', { variant: 'warning' });
      return;
    }
    try {
      await createItem.mutateAsync({
        title: createForm.title,
        brand: createForm.brand,
        category: createForm.category,
        price: createForm.price || '0',
        source: createForm.source,
        notes: createForm.notes,
      });
      enqueueSnackbar('Item created', { variant: 'success' });
      setCreateOpen(false);
      setCreateForm({ ...EMPTY_CREATE_FORM });
    } catch {
      enqueueSnackbar('Failed to create item', { variant: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteItem.mutateAsync(deleteTarget.id);
      enqueueSnackbar('Item deleted', { variant: 'success' });
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch {
      enqueueSnackbar('Failed to delete item', { variant: 'error' });
    }
  };

  if (isLoading && items.length === 0) return <LoadingScreen />;

  return (
    <Box>
      <PageHeader
        title="Items"
        subtitle="Browse and manage inventory items"
        action={
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
            Add Item
          </Button>
        }
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
          onRowClick={(params) => navigate(`/inventory/items/${params.id}`)}
          getRowId={(row: Item) => row.id}
          sx={{
            border: 'none',
            '& .MuiDataGrid-row': { cursor: 'pointer' },
          }}
        />
      </Box>

      {/* Create Item Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Item</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Title"
                value={createForm.title}
                onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Brand"
                value={createForm.brand}
                onChange={(e) => setCreateForm((f) => ({ ...f, brand: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Category"
                value={createForm.category}
                onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Price"
                type="number"
                value={createForm.price}
                onChange={(e) => setCreateForm((f) => ({ ...f, price: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Source"
                value={createForm.source}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, source: e.target.value as ItemSource }))
                }
              >
                {ITEM_SOURCES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={2}
                value={createForm.notes}
                onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!createForm.title || createItem.isPending}
          >
            {createItem.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete Item"
        message={`Delete item ${deleteTarget?.sku ?? ''}? This cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        loading={deleteItem.isPending}
      />
    </Box>
  );
}
