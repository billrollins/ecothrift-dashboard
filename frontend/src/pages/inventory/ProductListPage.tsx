import { useState, useMemo } from 'react';
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
  TextField,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useProducts, useCreateProduct, useUpdateProduct } from '../../hooks/useInventory';
import { deleteProduct } from '../../api/inventory.api';
import { useQueryClient } from '@tanstack/react-query';
import type { Product } from '../../types/inventory.types';

function formatCurrency(value: string | null): string {
  if (value == null) return '—';
  const n = parseFloat(value);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

export default function ProductListPage() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: '',
    brand: '',
    model: '',
    category: '',
    description: '',
    default_price: '',
  });

  const params = useMemo(() => (search ? { search } : {}), [search]);
  const { data, isLoading } = useProducts(params);
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const products = data?.results ?? [];

  const columns: GridColDef[] = [
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 180 },
    { field: 'brand', headerName: 'Brand', width: 120 },
    { field: 'category', headerName: 'Category', width: 120 },
    {
      field: 'default_price',
      headerName: 'Default Price',
      width: 120,
      valueFormatter: (value) => formatCurrency(value),
    },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setEditingId(row.id);
              setForm({
                title: row.title,
                brand: row.brand,
                model: row.model ?? '',
                category: row.category,
                description: row.description ?? '',
                default_price: row.default_price ?? '',
              });
              setDialogOpen(true);
            }}
          >
            <Edit fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={async (e) => {
              e.stopPropagation();
              if (!confirm('Delete this product?')) return;
              try {
                await deleteProduct(row.id);
                queryClient.invalidateQueries({ queryKey: ['products'] });
                enqueueSnackbar('Product deleted', { variant: 'success' });
              } catch {
                enqueueSnackbar('Failed to delete product', { variant: 'error' });
              }
            }}
          >
            <Delete fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  const handleSave = async () => {
    try {
      const payload = {
        ...form,
        default_price: form.default_price ? form.default_price : null,
      };
      if (editingId) {
        await updateProduct.mutateAsync({ id: editingId, data: payload });
        enqueueSnackbar('Product updated', { variant: 'success' });
      } else {
        await createProduct.mutateAsync(payload);
        enqueueSnackbar('Product created', { variant: 'success' });
      }
      setDialogOpen(false);
      setEditingId(null);
      setForm({
        title: '',
        brand: '',
        model: '',
        category: '',
        description: '',
        default_price: '',
      });
    } catch {
      enqueueSnackbar(editingId ? 'Failed to update product' : 'Failed to create product', {
        variant: 'error',
      });
    }
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm({
      title: '',
      brand: '',
      model: '',
      category: '',
      description: '',
      default_price: '',
    });
    setDialogOpen(true);
  };

  if (isLoading && products.length === 0) return <LoadingScreen />;

  return (
    <Box>
      <PageHeader
        title="Products"
        subtitle="Product catalog"
        action={
          <Button variant="contained" startIcon={<Add />} onClick={handleOpenAdd}>
            Add Product
          </Button>
        }
      />

      <Box sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search products..."
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
          sx={{ maxWidth: 320 }}
        />
      </Box>

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={products}
          columns={columns}
          loading={isLoading}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          getRowId={(row: Product) => row.id}
          sx={{ border: 'none' }}
        />
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edit Product' : 'Add Product'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
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
                label="Model"
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
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
                label="Default Price"
                value={form.default_price}
                onChange={(e) => setForm((f) => ({ ...f, default_price: e.target.value }))}
                placeholder="0.00"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Description"
                multiline
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!form.title || createProduct.isPending || updateProduct.isPending}
          >
            {createProduct.isPending || updateProduct.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
