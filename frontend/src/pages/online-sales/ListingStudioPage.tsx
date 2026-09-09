import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SxProps, Theme } from '@mui/material';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import CheckCircle from '@mui/icons-material/CheckCircle';
import ContentCopy from '@mui/icons-material/ContentCopy';
import MoreVert from '@mui/icons-material/MoreVert';
import { useSnackbar } from 'notistack';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { ImageViewerDialog } from '../../components/common/ImageViewerDialog';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { formatCurrency } from '../../utils/format';
import {
  listingImageDisplayUrl,
  listingImageFullUrl,
  type WebListingImage,
} from '../../api/webstore.api';
import { ListingStatusChip } from './presentation';
import { ListingPhotoDropzone } from './photos/ListingPhotoDropzone';
import { ListingPhotoEditorDialog } from './photos/ListingPhotoEditorDialog';
import { ListingPhotoGrid } from './photos/ListingPhotoGrid';
import { useListingDraft } from './useListingDraft';
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
  useUpdateWebListingImageAlt,
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

function formatPostedAt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function saveChipLabel(state: string, lastSavedAt: Date | null): string | null {
  if (state === 'unsaved') return 'Unsaved';
  if (state === 'saving') return 'Saving…';
  if (state === 'error') return 'Save failed';
  if (state === 'saved' && lastSavedAt) {
    return `Saved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return null;
}

export default function ListingStudioPage() {
  const { id } = useParams();
  const listingId = Number(id);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { data: listing, isLoading, isError } = useWebListing(Number.isFinite(listingId) ? listingId : null);
  const { data: categories } = useCategoryOptions();
  const { data: config } = useWebstoreConfig();
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
  const draft = useListingDraft(listing);
  const { form, setField, flush, saveState, lastSavedAt } = draft;

  const [altDrafts, setAltDrafts] = useState<Record<number, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSold, setConfirmSold] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [reframe, setReframe] = useState<WebListingImage | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const lastAutoPostedUrl = useRef('');

  useEffect(() => {
    if (!listing) return;
    setAltDrafts((prev) => {
      const next: Record<number, string> = {};
      for (const im of listing.images) {
        next[im.id] = prev[im.id] !== undefined ? prev[im.id] : im.alt || '';
      }
      return next;
    });
  }, [listing]);

  const debouncedPostedUrl = useDebouncedValue(form.fb_posted_url.trim(), 800);

  const markPosted = async (url: string, opts?: { silentIfSame?: boolean }) => {
    if (!listing) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    if (opts?.silentIfSame && trimmed === (listing.fb_posted_url || '')) return;
    if (trimmed === lastAutoPostedUrl.current && trimmed === (listing.fb_posted_url || '')) return;
    try {
      const updated = await markFb.mutateAsync({ id: listing.id, url: trimmed });
      lastAutoPostedUrl.current = trimmed;
      draft.acceptPostedUrl(updated.fb_posted_url);
      enqueueSnackbar('Marked posted', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not mark posted', { variant: 'error' });
    }
  };

  useEffect(() => {
    if (!listing || !debouncedPostedUrl) return;
    if (debouncedPostedUrl === (listing.fb_posted_url || '')) return;
    void markPosted(debouncedPostedUrl, { silentIfSame: true });
    // markPosted closes over listing; debounce value is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPostedUrl, listing?.id, listing?.fb_posted_url]);

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

  const publicBase = (config?.public_base_url || 'https://ecothrift.us').replace(/\/$/, '');
  const publicUrl = listing.slug ? `${publicBase}/shop/${listing.slug}` : null;
  const images = listing.images;
  const chip = saveChipLabel(saveState, lastSavedAt);
  const posted = Boolean(listing.fb_posted_at);
  const viewerImage = viewerIndex != null ? images[viewerIndex] ?? null : null;

  const save = async () => {
    const ok = await flush();
    if (ok) enqueueSnackbar('Saved', { variant: 'success' });
    else enqueueSnackbar('Save failed', { variant: 'error' });
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
            {chip ? (
              <Chip
                size="small"
                label={chip}
                color={
                  saveState === 'error'
                    ? 'error'
                    : saveState === 'unsaved'
                      ? 'warning'
                      : saveState === 'saved'
                        ? 'success'
                        : 'default'
                }
              />
            ) : null}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {listing.item_sku ? `Linked item ${listing.item_sku}` : 'Manual listing, no inventory item'}
          </Typography>
        </Box>
        <Button variant="outlined" onClick={() => void save()}>
          {saveState === 'saving' ? 'Saving…' : 'Save'}
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
              await flush();
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
                component="button"
                type="button"
                onClick={() => setViewerIndex(0)}
                aria-label="View full cover photo"
                sx={{
                  display: 'block',
                  width: '100%',
                  p: 0,
                  border: 0,
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  bgcolor: 'action.hover',
                }}
              >
                <Box
                  component="img"
                  src={listingImageDisplayUrl(images[0])}
                  alt={altDrafts[images[0].id] || form.title || 'Listing photo'}
                  sx={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }}
                />
              </Box>
            ) : (
              <Box
                sx={{
                  aspectRatio: '4 / 3',
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
            caption="Drop or select photos. The whole picture is kept by default; frame a slot only when you want to crop."
          >
            <ListingPhotoDropzone onFiles={setQueue} />
            <ListingPhotoGrid
              images={images}
              altDrafts={altDrafts}
              title={form.title}
              busy={reorderImages.isPending}
              onOpen={setViewerIndex}
              onReframe={setReframe}
              onMove={moveImage}
              onDelete={(imageId) =>
                void deleteImage.mutateAsync({ listingId: listing.id, imageId })
              }
              onAltChange={(imageId, alt) =>
                setAltDrafts((prev) => ({ ...prev, [imageId]: alt }))
              }
              onSaveAlt={(imageId) => void saveAlt(imageId)}
            />
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
                  draft.replaceFields(
                    { fb_title: updated.fb_title, fb_body: updated.fb_body },
                    { saved: true },
                  );
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
              <Tooltip title={posted ? listing.fb_posted_url || 'Posted' : 'Save the Facebook post URL'}>
                <Button
                  size="small"
                  variant={posted ? 'contained' : 'outlined'}
                  color={posted ? 'success' : 'primary'}
                  startIcon={posted ? <CheckCircle /> : undefined}
                  onClick={() => void markPosted(form.fb_posted_url)}
                >
                  {posted && listing.fb_posted_at
                    ? `Posted ${formatPostedAt(listing.fb_posted_at)}`
                    : 'Mark posted'}
                </Button>
              </Tooltip>
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
              onBlur={() => void markPosted(form.fb_posted_url, { silentIfSame: true })}
              fullWidth
              size="small"
              helperText="Adding a URL marks the listing posted."
            />
          </StudioSection>
        </Grid>
      </Grid>

      <ListingPhotoEditorDialog
        open={queue.length > 0 || Boolean(reframe)}
        listingId={listing.id}
        files={reframe ? [] : queue}
        reframe={reframe}
        onClose={() => {
          setQueue([]);
          setReframe(null);
        }}
      />
      <ImageViewerDialog
        open={viewerImage != null}
        onClose={() => setViewerIndex(null)}
        src={viewerImage ? listingImageFullUrl(viewerImage) : null}
        alt={viewerImage ? altDrafts[viewerImage.id] || listing.title : ''}
        title={listing.title}
        positionLabel={
          viewerImage && viewerIndex != null ? `${viewerIndex + 1} / ${images.length}` : null
        }
        onPrev={() => setViewerIndex((i) => (i != null && i > 0 ? i - 1 : i))}
        onNext={() =>
          setViewerIndex((i) => (i != null && i < images.length - 1 ? i + 1 : i))
        }
        hasPrev={viewerIndex != null && viewerIndex > 0}
        hasNext={viewerIndex != null && viewerIndex < images.length - 1}
      />

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
