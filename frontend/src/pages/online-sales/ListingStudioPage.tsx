import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import ArrowDownward from '@mui/icons-material/ArrowDownward';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import ContentCopy from '@mui/icons-material/ContentCopy';
import Delete from '@mui/icons-material/Delete';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import { useSnackbar } from 'notistack';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  useArchiveWebListing,
  useCategoryOptions,
  useDeleteWebListing,
  useDeleteWebListingImage,
  useGenerateFbCopy,
  useMarkFbPosted,
  useMarkWebListingSold,
  usePauseWebListing,
  usePublishWebListing,
  useReorderWebListingImage,
  useRestoreWebListing,
  useUpdateWebListing,
  useUpdateWebListingImageAlt,
  useUploadWebListingImage,
  useWebListing,
  useWebstoreConfig,
} from '../../hooks/useWebStore';

const CONDITION_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'very_good', label: 'Very Good' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
];

export default function ListingStudioPage() {
  const { id } = useParams();
  const listingId = Number(id);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { data: listing, isLoading, isError } = useWebListing(Number.isFinite(listingId) ? listingId : null);
  const { data: categories } = useCategoryOptions();
  const { data: config } = useWebstoreConfig();
  const updateListing = useUpdateWebListing();
  const uploadImage = useUploadWebListingImage();
  const deleteImage = useDeleteWebListingImage();
  const reorderImages = useReorderWebListingImage();
  const updateImageAlt = useUpdateWebListingImageAlt();
  const deleteListing = useDeleteWebListing();
  const publish = usePublishWebListing();
  const pause = usePauseWebListing();
  const archive = useArchiveWebListing();
  const restore = useRestoreWebListing();
  const markSold = useMarkWebListingSold();
  const genFb = useGenerateFbCopy();
  const markFb = useMarkFbPosted();

  const [form, setForm] = useState({
    title: '',
    sku: '',
    description: '',
    condition: 'good',
    price: '',
    compare_at_price: '',
    on_hand: '1',
    category: '',
    featured: false,
    return_policy: 'final_sale',
    fb_title: '',
    fb_body: '',
    fb_posted_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [altDrafts, setAltDrafts] = useState<Record<number, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSold, setConfirmSold] = useState(false);

  useEffect(() => {
    if (!listing) return;
    setForm({
      title: listing.title || '',
      sku: listing.sku || '',
      description: listing.description || '',
      condition: listing.condition || 'good',
      price: listing.price || '',
      compare_at_price: listing.compare_at_price || '',
      on_hand: String(listing.on_hand ?? 1),
      category: listing.category != null ? String(listing.category) : '',
      featured: Boolean(listing.featured),
      return_policy: listing.return_policy || 'final_sale',
      fb_title: listing.fb_title || '',
      fb_body: listing.fb_body || '',
      fb_posted_url: listing.fb_posted_url || '',
    });
    const nextAlts: Record<number, string> = {};
    for (const im of listing.images) {
      nextAlts[im.id] = im.alt || '';
    }
    setAltDrafts(nextAlts);
  }, [listing]);

  if (isLoading) return <LoadingScreen />;
  if (isError || !listing) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Could not load this listing.</Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate('/online-sales/listings')}>
          Back to listings
        </Button>
      </Box>
    );
  }

  const setField = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const publicBase = (config?.public_base_url || 'https://ecothrift.us').replace(/\/$/, '');
  const publicUrl = listing.slug ? `${publicBase}/shop/${listing.slug}` : null;

  const save = async () => {
    setSaving(true);
    try {
      await updateListing.mutateAsync({
        id: listing.id,
        data: {
          title: form.title,
          sku: form.sku,
          description: form.description,
          condition: form.condition,
          price: form.price || '0',
          compare_at_price: form.compare_at_price || null,
          on_hand: Number(form.on_hand) || 1,
          category: form.category ? Number(form.category) : null,
          featured: form.featured,
          return_policy: form.return_policy,
          fb_title: form.fb_title,
          fb_body: form.fb_body,
        },
      });
      enqueueSnackbar('Saved', { variant: 'success' });
    } catch {
      enqueueSnackbar('Save failed', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (file?: File | null) => {
    if (!file) return;
    try {
      await uploadImage.mutateAsync({ id: listing.id, file });
      enqueueSnackbar('Photo uploaded', { variant: 'success' });
    } catch {
      enqueueSnackbar('Upload failed', { variant: 'error' });
    }
  };

  const moveImage = async (imageId: number, direction: -1 | 1) => {
    const ids = listing.images.map((im) => im.id);
    const idx = ids.indexOf(imageId);
    const swapWith = idx + direction;
    if (idx < 0 || swapWith < 0 || swapWith >= ids.length) return;
    const order = [...ids];
    [order[idx], order[swapWith]] = [order[swapWith], order[idx]];
    try {
      await reorderImages.mutateAsync({ listingId: listing.id, order });
    } catch {
      enqueueSnackbar('Could not reorder photos', { variant: 'error' });
    }
  };

  const saveAlt = async (imageId: number) => {
    const alt = altDrafts[imageId] ?? '';
    try {
      await updateImageAlt.mutateAsync({ listingId: listing.id, imageId, alt });
      enqueueSnackbar('Alt text saved', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not save alt text', { variant: 'error' });
    }
  };

  const onDeleteListing = async () => {
    try {
      await deleteListing.mutateAsync(listing.id);
      enqueueSnackbar('Listing deleted', { variant: 'success' });
      navigate('/online-sales/listings');
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Delete failed';
      enqueueSnackbar(detail, { variant: 'error' });
    } finally {
      setConfirmDelete(false);
    }
  };

  const onMarkSold = async () => {
    try {
      await markSold.mutateAsync(listing.id);
      enqueueSnackbar('Marked sold', { variant: 'success' });
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Mark sold failed';
      enqueueSnackbar(detail, { variant: 'error' });
    } finally {
      setConfirmSold(false);
    }
  };

  const readiness = listing.readiness_errors || [];
  const images = listing.images;

  return (
    <Box sx={{ pb: 6 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <IconButton onClick={() => navigate('/online-sales/listings')} aria-label="Back">
          <ArrowBack />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Typography variant="h5">Listing Studio</Typography>
          <Typography variant="body2" color="text.secondary">
            {listing.item_sku ? `Linked item ${listing.item_sku}` : 'Manual / unlinked listing'} · {listing.status_display}
          </Typography>
        </Box>
        <Chip label={listing.status} color={listing.status === 'published' ? 'success' : 'default'} />
        <Button variant="outlined" onClick={save} disabled={saving}>
          Save
        </Button>
        {listing.status === 'archived' ? (
          <Button variant="contained" onClick={() => restore.mutateAsync(listing.id)}>
            Restore
          </Button>
        ) : listing.status === 'published' ? (
          <Button variant="outlined" onClick={() => pause.mutateAsync(listing.id)}>
            Pause
          </Button>
        ) : listing.status !== 'sold' ? (
          <Button
            variant="contained"
            onClick={async () => {
              await save();
              try {
                await publish.mutateAsync(listing.id);
                enqueueSnackbar('Published', { variant: 'success' });
              } catch (err: unknown) {
                const detail =
                  (err as { response?: { data?: { errors?: string[] } } })?.response?.data?.errors?.join(
                    ' ',
                  ) || 'Publish failed';
                enqueueSnackbar(detail, { variant: 'error' });
              }
            }}
          >
            Publish
          </Button>
        ) : null}
        {listing.status !== 'archived' && listing.status !== 'sold' && (
          <Button color="warning" onClick={() => archive.mutateAsync(listing.id)}>
            Archive
          </Button>
        )}
        {listing.status !== 'sold' && listing.status !== 'archived' && (
          <Button color="secondary" onClick={() => setConfirmSold(true)}>
            Mark sold
          </Button>
        )}
        <Button color="error" onClick={() => setConfirmDelete(true)}>
          Delete
        </Button>
      </Stack>

      {readiness.length > 0 && listing.status !== 'published' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Before publish: {readiness.join(' ')}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={2}>
            <TextField label="Title" value={form.title} onChange={(e) => setField('title', e.target.value)} fullWidth />
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              fullWidth
              multiline
              minRows={4}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="SKU" value={form.sku} onChange={(e) => setField('sku', e.target.value)} fullWidth />
              <TextField
                select
                label="Condition"
                value={form.condition}
                onChange={(e) => setField('condition', e.target.value)}
                fullWidth
              >
                {CONDITION_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Price" value={form.price} onChange={(e) => setField('price', e.target.value)} fullWidth />
              <TextField
                label="Compare-at"
                value={form.compare_at_price}
                onChange={(e) => setField('compare_at_price', e.target.value)}
                fullWidth
              />
              <TextField
                label="On hand"
                value={form.on_hand}
                onChange={(e) => setField('on_hand', e.target.value)}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <TextField
                select
                label="Category"
                value={form.category}
                onChange={(e) => setField('category', e.target.value)}
                fullWidth
              >
                <MenuItem value="">None</MenuItem>
                {(categories || []).map((c) => (
                  <MenuItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Return policy"
                value={form.return_policy}
                onChange={(e) => setField('return_policy', e.target.value)}
                fullWidth
                helperText="48h store-credit template stays unpublished until ops exist"
              >
                <MenuItem value="final_sale">Final sale</MenuItem>
                <MenuItem value="return_48h_credit">48h → store credit (disabled advertising)</MenuItem>
              </TextField>
              <FormControlLabel
                control={
                  <Switch checked={form.featured} onChange={(e) => setField('featured', e.target.checked)} />
                }
                label="Featured"
              />
            </Stack>

            <Divider />
            <Typography variant="h6">Photos</Typography>
            <Button component="label" startIcon={<PhotoCamera />} variant="outlined" sx={{ alignSelf: 'flex-start' }}>
              Upload photo
              <input
                hidden
                type="file"
                accept="image/*"
                onChange={(e) => onUpload(e.target.files?.[0])}
              />
            </Button>
            <Stack spacing={1.5}>
              {images.map((im, index) => (
                <Stack
                  key={im.id}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  alignItems={{ sm: 'flex-start' }}
                  sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
                >
                  <Box
                    component="img"
                    src={im.url}
                    alt={altDrafts[im.id] || listing.title}
                    sx={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }}
                  />
                  <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <IconButton
                        size="small"
                        aria-label="Move photo up"
                        disabled={index === 0 || reorderImages.isPending}
                        onClick={() => moveImage(im.id, -1)}
                      >
                        <ArrowUpward fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label="Move photo down"
                        disabled={index === images.length - 1 || reorderImages.isPending}
                        onClick={() => moveImage(im.id, 1)}
                      >
                        <ArrowDownward fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label="Delete photo"
                        onClick={() => deleteImage.mutateAsync({ listingId: listing.id, imageId: im.id })}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                      <Typography variant="caption" color="text.secondary">
                        Position {index + 1}
                      </Typography>
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                      <TextField
                        label="Alt text"
                        size="small"
                        value={altDrafts[im.id] ?? ''}
                        onChange={(e) =>
                          setAltDrafts((prev) => ({ ...prev, [im.id]: e.target.value }))
                        }
                        fullWidth
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={updateImageAlt.isPending}
                        onClick={() => saveAlt(im.id)}
                        sx={{ flexShrink: 0 }}
                      >
                        Save alt
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Box sx={{ position: 'sticky', top: 16, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              Preview
            </Typography>
            <Typography variant="subtitle1">{form.title || 'Untitled'}</Typography>
            <Typography variant="h5" sx={{ my: 1 }}>
              ${form.price || '0.00'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>
              {form.description || 'No description yet.'}
            </Typography>
            <Typography variant="caption" display="block">
              Available {listing.available} · Reserved {listing.reserved} · On hand {listing.on_hand}
            </Typography>
            {publicUrl && (
              <Button
                component="a"
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                size="small"
                sx={{ mt: 1 }}
              >
                Public URL
              </Button>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" gutterBottom>
              Website
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Native publish to the public shop. Status: {listing.status_display}.
            </Typography>

            <Divider sx={{ my: 2 }} />
            <Typography variant="h6" gutterBottom>
              Facebook Page
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
              <Button
                size="small"
                variant="outlined"
                onClick={async () => {
                  const updated = await genFb.mutateAsync(listing.id);
                  setForm((prev) => ({
                    ...prev,
                    fb_title: updated.fb_title,
                    fb_body: updated.fb_body,
                  }));
                }}
              >
                Generate copy
              </Button>
              <Button
                size="small"
                startIcon={<ContentCopy />}
                onClick={async () => {
                  await navigator.clipboard.writeText(`${form.fb_title}\n\n${form.fb_body}`);
                  enqueueSnackbar('Copied', { variant: 'success' });
                }}
              >
                Copy all
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={async () => {
                  await markFb.mutateAsync({ id: listing.id, url: form.fb_posted_url });
                  enqueueSnackbar('Marked posted', { variant: 'success' });
                }}
              >
                Mark posted
              </Button>
            </Stack>
            <TextField
              label="FB title"
              value={form.fb_title}
              onChange={(e) => setField('fb_title', e.target.value)}
              fullWidth
              sx={{ mb: 1 }}
            />
            <TextField
              label="FB body"
              value={form.fb_body}
              onChange={(e) => setField('fb_body', e.target.value)}
              fullWidth
              multiline
              minRows={5}
              sx={{ mb: 1 }}
            />
            <TextField
              label="Posted URL"
              value={form.fb_posted_url}
              onChange={(e) => setField('fb_posted_url', e.target.value)}
              fullWidth
            />
          </Box>
        </Grid>
      </Grid>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete listing?"
        message="This permanently deletes the listing and its photos. Active holds will block delete."
        confirmLabel="Delete"
        severity="error"
        loading={deleteListing.isPending}
        onConfirm={onDeleteListing}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmSold}
        title="Mark listing sold?"
        message="Sets status to sold. Active holds will block this action."
        confirmLabel="Mark sold"
        severity="warning"
        loading={markSold.isPending}
        onConfirm={onMarkSold}
        onCancel={() => setConfirmSold(false)}
      />
    </Box>
  );
}
