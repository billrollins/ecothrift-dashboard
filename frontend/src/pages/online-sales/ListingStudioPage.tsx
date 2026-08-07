import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SxProps, Theme } from '@mui/material';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Paper,
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
import MoreVert from '@mui/icons-material/MoreVert';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import { useSnackbar } from 'notistack';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { formatCurrency } from '../../utils/format';
import { ListingStatusChip } from './presentation';
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
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

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
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ mb: 2 }}
        flexWrap="wrap"
        useFlexGap
      >
        <IconButton onClick={() => navigate('/online-sales/listings')} aria-label="Back">
          <ArrowBack />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h5" fontWeight={600}>
              Listing Studio
            </Typography>
            <ListingStatusChip status={listing.status} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {listing.item_sku ? `Linked item ${listing.item_sku}` : 'Manual listing, no inventory item'}
          </Typography>
        </Box>
        <Button variant="outlined" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
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
        {/* Sold / Archive / Delete live behind the overflow so nobody clips
            Delete while reaching for Publish. */}
        <IconButton aria-label="More actions" onClick={(e) => setMenuAnchor(e.currentTarget)}>
          <MoreVert />
        </IconButton>
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          {listing.status !== 'sold' && listing.status !== 'archived' && (
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                setConfirmSold(true);
              }}
            >
              Mark sold
            </MenuItem>
          )}
          {listing.status !== 'archived' && listing.status !== 'sold' && (
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                archive.mutateAsync(listing.id);
              }}
            >
              Archive
            </MenuItem>
          )}
          <MenuItem
            sx={{ color: 'error.main' }}
            onClick={() => {
              setMenuAnchor(null);
              setConfirmDelete(true);
            }}
          >
            Delete
          </MenuItem>
        </Menu>
      </Stack>

      {readiness.length > 0 && listing.status !== 'published' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            Finish these before publishing
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {readiness.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </Box>
        </Alert>
      )}

      {/* Two paired rows so sibling cards share a baseline on md+ */}
      <Grid container spacing={2.5} alignItems="stretch">
        <Grid size={{ xs: 12, md: 7 }} sx={{ display: 'flex' }}>
          <StudioSection title="Details">
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
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }}>
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
                sx={{ mt: { sm: 1 }, flexShrink: 0 }}
                control={
                  <Switch checked={form.featured} onChange={(e) => setField('featured', e.target.checked)} />
                }
                label="Featured"
              />
            </Stack>
          </StudioSection>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }} sx={{ display: 'flex' }}>
          <StudioSection title="Shop preview">
            {images[0] ? (
              <Box
                component="img"
                src={images[0].url}
                alt={altDrafts[images[0].id] || form.title || 'Listing photo'}
                sx={{
                  width: '100%',
                  height: 180,
                  objectFit: 'cover',
                  borderRadius: 1.5,
                  bgcolor: 'action.hover',
                }}
              />
            ) : (
              <Box
                sx={{
                  height: 180,
                  borderRadius: 1.5,
                  border: '1px dashed',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'action.hover',
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No photo yet
                </Typography>
              </Box>
            )}
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {form.title || 'Untitled'}
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
                {formatCurrency(form.price || '0')}
              </Typography>
              {form.compare_at_price ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ textDecoration: 'line-through' }}
                >
                  {formatCurrency(form.compare_at_price)}
                </Typography>
              ) : null}
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  whiteSpace: 'pre-wrap',
                  mt: 1.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 6,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {form.description || 'No description yet.'}
              </Typography>
            </Box>
            <Stack
              direction="row"
              spacing={2}
              flexWrap="wrap"
              useFlexGap
              sx={{ mt: 'auto', pt: 1 }}
            >
              <Typography variant="caption" color="text.secondary">
                Available <strong>{listing.available}</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Reserved <strong>{listing.reserved}</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                On hand <strong>{listing.on_hand}</strong>
              </Typography>
            </Stack>
            {publicUrl ? (
              <Button
                component="a"
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                size="small"
                sx={{ alignSelf: 'flex-start', px: 0 }}
              >
                View on the shop
              </Button>
            ) : null}
          </StudioSection>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }} sx={{ display: 'flex' }}>
          <StudioSection
            title="Photos"
            caption="The first photo is the one shoppers see in the grid. Alt text keeps the listing accessible."
          >
            <Button component="label" startIcon={<PhotoCamera />} variant="outlined" sx={{ alignSelf: 'flex-start' }}>
              Upload photo
              <input
                hidden
                type="file"
                accept="image/*"
                onChange={(e) => onUpload(e.target.files?.[0])}
              />
            </Button>
            {images.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No photos yet - a listing cannot publish without one.
              </Typography>
            )}
            <Stack spacing={1.5}>
              {images.map((im, index) => (
                <Stack
                  key={im.id}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  alignItems={{ sm: 'flex-start' }}
                  sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
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
                        {index === 0 ? ' · cover' : ''}
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
          </StudioSection>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }} sx={{ display: 'flex' }}>
          <StudioSection
            title="Facebook Page"
            caption="Generate the copy here, then paste it into the Page post."
          >
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
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
              label="Post headline"
              value={form.fb_title}
              onChange={(e) => setField('fb_title', e.target.value)}
              fullWidth
              size="small"
            />
            <TextField
              label="Post body"
              value={form.fb_body}
              onChange={(e) => setField('fb_body', e.target.value)}
              fullWidth
              multiline
              minRows={5}
              size="small"
            />
            <Box sx={{ flex: 1, minHeight: 0 }} />
            <TextField
              label="Posted URL"
              value={form.fb_posted_url}
              onChange={(e) => setField('fb_posted_url', e.target.value)}
              fullWidth
              size="small"
            />
          </StudioSection>
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

function StudioSection({
  title,
  caption,
  sx,
  children,
}: {
  title: string;
  caption?: string;
  sx?: SxProps<Theme>;
  children: ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        borderRadius: 2,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        ...sx,
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
        {title}
      </Typography>
      {caption ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {caption}
        </Typography>
      ) : null}
      <Stack spacing={2} sx={{ mt: 2, flex: 1, minHeight: 0 }}>
        {children}
      </Stack>
    </Paper>
  );
}
