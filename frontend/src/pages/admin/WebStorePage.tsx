import { useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import Search from '@mui/icons-material/Search';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import {
  useCategoryOptions,
  useCreateWebListing,
  useDeleteWebListing,
  useDeleteWebListingImage,
  useUpdateWebListing,
  useUploadWebListingImage,
  useWebListing,
  useWebListings,
} from '../../hooks/useWebStore';
import type { WebListing } from '../../api/webstore.api';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const CONDITION_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'very_good', label: 'Very Good' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
];

const STATUS_COLOR: Record<string, 'default' | 'success' | 'warning'> = {
  draft: 'default',
  published: 'success',
  archived: 'warning',
};

interface ListingForm {
  title: string;
  category: string;
  condition: string;
  price: string;
  compare_at_price: string;
  stock: string;
  status: string;
  featured: boolean;
  sku: string;
  description: string;
}

const EMPTY_FORM: ListingForm = {
  title: '',
  category: '',
  condition: 'good',
  price: '',
  compare_at_price: '',
  stock: '1',
  status: 'draft',
  featured: false,
  sku: '',
  description: '',
};

function toForm(l: WebListing): ListingForm {
  return {
    title: l.title,
    category: l.category != null ? String(l.category) : '',
    condition: l.condition,
    price: l.price ?? '',
    compare_at_price: l.compare_at_price ?? '',
    stock: String(l.stock ?? 0),
    status: l.status,
    featured: l.featured,
    sku: l.sku ?? '',
    description: l.description ?? '',
  };
}

function buildPayload(form: ListingForm): Record<string, unknown> {
  return {
    title: form.title.trim(),
    category: form.category === '' ? null : Number(form.category),
    condition: form.condition,
    price: form.price === '' ? '0' : form.price,
    compare_at_price: form.compare_at_price === '' ? null : form.compare_at_price,
    stock: Number(form.stock) || 0,
    status: form.status,
    featured: form.featured,
    sku: form.sku.trim(),
    description: form.description,
  };
}

export default function WebStorePage() {
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ListingForm>({ ...EMPTY_FORM });

  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ListingForm>({ ...EMPTY_FORM });

  const [deleteTarget, setDeleteTarget] = useState<WebListing | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useWebListings({
    search: search || undefined,
    status: statusFilter || undefined,
    ordering: '-updated_at',
  });
  const { data: categories = [] } = useCategoryOptions();
  const editQuery = useWebListing(editId);

  const createListing = useCreateWebListing();
  const updateListing = useUpdateWebListing();
  const deleteListing = useDeleteWebListing();
  const uploadImage = useUploadWebListingImage();
  const deleteImage = useDeleteWebListingImage();

  const listings = data?.results ?? [];
  const editImages = editQuery.data?.images ?? [];

  const openEdit = (l: WebListing) => {
    setEditId(l.id);
    setEditForm(toForm(l));
  };

  const closeEdit = () => {
    setEditId(null);
  };

  const handleCreate = async () => {
    if (!createForm.title.trim()) {
      enqueueSnackbar('Title is required', { variant: 'warning' });
      return;
    }
    try {
      const created = await createListing.mutateAsync(buildPayload(createForm));
      enqueueSnackbar('Listing created — add photos next', { variant: 'success' });
      setCreateOpen(false);
      setCreateForm({ ...EMPTY_FORM });
      // Jump straight into editing so staff can attach photos.
      setEditId(created.id);
      setEditForm(toForm(created));
    } catch {
      enqueueSnackbar('Failed to create listing', { variant: 'error' });
    }
  };

  const handleSaveEdit = async () => {
    if (editId == null) return;
    if (!editForm.title.trim()) {
      enqueueSnackbar('Title is required', { variant: 'warning' });
      return;
    }
    try {
      await updateListing.mutateAsync({ id: editId, data: buildPayload(editForm) });
      enqueueSnackbar('Listing saved', { variant: 'success' });
      closeEdit();
    } catch {
      enqueueSnackbar('Failed to save listing', { variant: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteListing.mutateAsync(deleteTarget.id);
      enqueueSnackbar('Listing deleted', { variant: 'success' });
      setDeleteTarget(null);
    } catch {
      enqueueSnackbar('Failed to delete listing', { variant: 'error' });
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || editId == null) return;
    try {
      await uploadImage.mutateAsync({ id: editId, file });
      enqueueSnackbar('Photo added', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to upload photo', { variant: 'error' });
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    if (editId == null) return;
    try {
      await deleteImage.mutateAsync({ listingId: editId, imageId });
    } catch {
      enqueueSnackbar('Failed to remove photo', { variant: 'error' });
    }
  };

  const columns: GridColDef<WebListing>[] = [
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 200 },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: ({ row }) => (
        <Chip
          size="small"
          label={row.status_display}
          color={STATUS_COLOR[row.status] ?? 'default'}
          variant={row.status === 'published' ? 'filled' : 'outlined'}
        />
      ),
    },
    { field: 'category_name', headerName: 'Category', width: 170, valueGetter: (_v, row) => row.category_name ?? '—' },
    {
      field: 'price',
      headerName: 'Price',
      width: 110,
      renderCell: ({ row }) => (
        <span>
          ${row.price}
          {row.on_sale && row.compare_at_price ? (
            <Typography component="span" sx={{ ml: 0.5, textDecoration: 'line-through', color: 'text.disabled', fontSize: 12 }}>
              ${row.compare_at_price}
            </Typography>
          ) : null}
        </span>
      ),
    },
    { field: 'stock', headerName: 'Stock', width: 80, type: 'number' },
    { field: 'featured', headerName: 'Featured', width: 90, type: 'boolean' },
    { field: 'image_count', headerName: 'Photos', width: 80, type: 'number' },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 110,
      sortable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%' }}>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => openEdit(row)}>
              <Edit fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}>
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  if (isLoading && listings.length === 0) return <LoadingScreen message="Loading web store..." />;

  const renderFields = (form: ListingForm, setForm: React.Dispatch<React.SetStateAction<ListingForm>>) => (
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
          select
          fullWidth
          label="Category"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        >
          <MenuItem value="">— None —</MenuItem>
          {categories.map((c) => (
            <MenuItem key={c.id} value={String(c.id)}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          select
          fullWidth
          label="Condition"
          value={form.condition}
          onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
        >
          {CONDITION_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid size={{ xs: 6, md: 4 }}>
        <TextField
          fullWidth
          label="Price"
          type="number"
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
          required
        />
      </Grid>
      <Grid size={{ xs: 6, md: 4 }}>
        <TextField
          fullWidth
          label="Compare-at (was)"
          type="number"
          value={form.compare_at_price}
          onChange={(e) => setForm((f) => ({ ...f, compare_at_price: e.target.value }))}
          slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
        />
      </Grid>
      <Grid size={{ xs: 6, md: 4 }}>
        <TextField
          fullWidth
          label="Stock"
          type="number"
          value={form.stock}
          onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          select
          fullWidth
          label="Status"
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
        >
          {STATUS_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          fullWidth
          label="SKU (optional)"
          value={form.sku}
          onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <FormControlLabel
          control={
            <Switch
              checked={form.featured}
              onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
            />
          }
          label="Featured on the storefront"
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <TextField
          fullWidth
          label="Description"
          multiline
          rows={4}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </Grid>
    </Grid>
  );

  return (
    <Box>
      <PageHeader
        title="Web store"
        subtitle="Curate the public storefront catalog — listings, photos, prices, and stock"
        action={
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
            New listing
          </Button>
        }
      />

      <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search title, SKU, description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 320 }}
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
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {STATUS_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Box sx={{ height: 560 }}>
        <DataGrid
          rows={listings}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{ border: 'none' }}
        />
      </Box>

      {/* Create */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New listing</DialogTitle>
        <DialogContent>{renderFields(createForm, setCreateForm)}</DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!createForm.title.trim() || createListing.isPending}
          >
            {createListing.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit */}
      <Dialog open={editId != null} onClose={closeEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Edit listing</DialogTitle>
        <DialogContent>
          {renderFields(editForm, setEditForm)}

          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle2">Photos</Typography>
            <Button
              size="small"
              startIcon={<PhotoCamera />}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadImage.isPending}
            >
              {uploadImage.isPending ? 'Uploading...' : 'Add photo'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handlePhotoChange}
            />
          </Box>
          {editImages.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No photos yet. The first photo is used as the main image.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {editImages.map((img) => (
                <Box
                  key={img.id}
                  sx={{ position: 'relative', width: 96, height: 96, borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}
                >
                  <Box
                    component="img"
                    src={img.url}
                    alt={img.alt}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteImage(img.id)}
                    sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' } }}
                  >
                    <Delete sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit}>Close</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={updateListing.isPending}>
            {updateListing.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget != null}
        title="Delete listing"
        message={`Delete "${deleteTarget?.title ?? ''}"? This removes it from the storefront and cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteListing.isPending}
      />
    </Box>
  );
}
