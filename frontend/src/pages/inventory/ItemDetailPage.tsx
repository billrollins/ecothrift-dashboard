import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import CheckCircle from '@mui/icons-material/CheckCircle';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import { useItem, useUpdateItem, useDeleteItem, useMarkItemReady } from '../../hooks/useInventory';
import type { ItemSource } from '../../types/inventory.types';

const ITEM_SOURCES: ItemSource[] = ['purchased', 'consignment', 'house'];

function formatCurrency(value: string | null): string {
  if (value == null) return '—';
  const n = parseFloat(value);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const itemId = id ? parseInt(id, 10) : null;

  const { data: item, isLoading } = useItem(itemId);
  const updateItem = useUpdateItem();
  const deleteItemMut = useDeleteItem();
  const markReady = useMarkItemReady();

  const [form, setForm] = useState({
    title: '',
    brand: '',
    category: '',
    price: '',
    source: 'purchased' as ItemSource,
    location: '',
    notes: '',
  });

  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (item) {
      setForm({
        title: item.title,
        brand: item.brand,
        category: item.category,
        price: item.price,
        source: item.source,
        location: item.location ?? '',
        notes: item.notes ?? '',
      });
    }
  }, [item]);

  const handleSave = async () => {
    if (!itemId) return;
    try {
      await updateItem.mutateAsync({ id: itemId, data: form });
      enqueueSnackbar('Item updated', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to update item', { variant: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!itemId) return;
    try {
      await deleteItemMut.mutateAsync(itemId);
      enqueueSnackbar('Item deleted', { variant: 'success' });
      navigate('/inventory/items');
    } catch {
      enqueueSnackbar('Failed to delete item', { variant: 'error' });
    }
  };

  const handleMarkReady = async () => {
    if (!itemId) return;
    try {
      await markReady.mutateAsync(itemId);
      enqueueSnackbar('Item marked as ready (on shelf)', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to mark item ready', { variant: 'error' });
    }
  };

  if (isLoading && !item) return <LoadingScreen />;
  if (!item) return <Typography>Item not found.</Typography>;

  const canMarkReady = ['intake', 'processing'].includes(item.status);

  return (
    <Box>
      <PageHeader
        title={item.sku}
        subtitle={item.title}
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            {canMarkReady && (
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircle />}
                onClick={handleMarkReady}
                disabled={markReady.isPending}
              >
                Mark Ready
              </Button>
            )}
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteOutline />}
              onClick={() => setDeleteOpen(true)}
            >
              Delete
            </Button>
            <Button
              variant="outlined"
              startIcon={<ArrowBack />}
              onClick={() => navigate('/inventory/items')}
            >
              Back
            </Button>
          </Box>
        }
      />

      <Card>
        <CardContent>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="SKU" value={item.sku} disabled variant="filled" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
                <Typography variant="body2" color="text.secondary">Status:</Typography>
                <StatusBadge status={item.status} />
              </Box>
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
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Price"
                type="number"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                select
                label="Source"
                value={form.source}
                onChange={(e) =>
                  setForm((f) => ({ ...f, source: e.target.value as ItemSource }))
                }
              >
                {ITEM_SOURCES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Grid>

            {/* Read-only info */}
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Cost"
                value={formatCurrency(item.cost)}
                disabled
                variant="filled"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Listed"
                value={item.listed_at ? format(new Date(item.listed_at), 'MMM d, yyyy') : '—'}
                disabled
                variant="filled"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Sold"
                value={
                  item.sold_at
                    ? `${format(new Date(item.sold_at), 'MMM d, yyyy')} — ${formatCurrency(item.sold_for)}`
                    : '—'
                }
                disabled
                variant="filled"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Created"
                value={item.created_at ? format(new Date(item.created_at), 'MMM d, yyyy HH:mm') : '—'}
                disabled
                variant="filled"
              />
            </Grid>

            <Grid size={12}>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={updateItem.isPending}
              >
                {updateItem.isPending ? 'Saving...' : 'Save'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Item"
        message={`Delete item ${item.sku}? This cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        loading={deleteItemMut.isPending}
      />
    </Box>
  );
}
