/**
 * Studios → Social Studio → Photos (the "Photo dump", owner 2026-10-21): staff stock real photos on the floor,
 * and whoever posts builds a post from them later, even from home. Phone-first: the camera is the first thing
 * on the page (and opens by itself when the page is reached with ?camera=1 from a tap). Optional category and
 * scanned tag go with the batch. The grid filters to Unused, This week, and a category.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  patchSocialPhoto,
  uploadSocialPhotos,
  type SocialPhoto,
} from '../../../api/marketing.api';
import { ccTokens } from '../../../theme';
import { CameraButtons, CategorySelect, PhotoGrid, PhotoInput, SOCIAL_CATEGORIES as categories } from './PhotoLibrary';
import { formatDay, pageSx, StudioHeader } from './socialParts';

function errorText(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

function PhotoDialog({ photo, categories, onClose }: { photo: SocialPhoto; categories: string[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [category, setCategory] = useState(photo.category);
  const [sku, setSku] = useState(photo.sku);
  const [note, setNote] = useState(photo.note);
  const save = useMutation({
    mutationFn: (data: Parameters<typeof patchSocialPhoto>[1]) => patchSocialPhoto(photo.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing', 'photos'] });
      onClose();
    },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not save the photo.'), { variant: 'error' }),
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Photo</DialogTitle>
      <DialogContent>
        {photo.image_url ? (
          <Box component="img" src={photo.image_url} alt="" sx={{ width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: '10px', bgcolor: '#f4f7f5', mb: 1.5 }} />
        ) : null}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, mb: 1.25 }}>
          <CategorySelect value={category} onChange={setCategory} categories={categories} />
          <TextField size="small" label="Item tag" value={sku} onChange={(e) => setSku(e.target.value)} sx={{ flex: '1 1 160px' }} />
        </Box>
        <TextField size="small" fullWidth label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <Typography sx={{ mt: 1.25, fontSize: 13, color: ccTokens.ink2 }}>
          {photo.uploaded_by_name || 'Someone'} · {photo.uploaded_at ? new Date(photo.uploaded_at).toLocaleString() : '-'}
          {photo.used_in.length ? ` · in ${photo.used_in.map((u) => formatDay(u.slot_date)).join(', ')}` : ' · not used yet'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button color="error" onClick={() => save.mutate({ is_archived: true })} disabled={save.isPending}>Archive</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={save.isPending} onClick={() => save.mutate({ category, sku, note })}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function SocialPhotosPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [category, setCategory] = useState('');
  const [sku, setSku] = useState('');
  const [open, setOpen] = useState<SocialPhoto | null>(null);
  const [lastBatch, setLastBatch] = useState(0);
  const autoCamera = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: (files: File[]) => uploadSocialPhotos(files, { category, sku: sku.trim() }),
    onSuccess: (res) => {
      setLastBatch(res.photos.length);
      queryClient.invalidateQueries({ queryKey: ['marketing', 'photos'] });
      if (res.failed.length) enqueueSnackbar(`${res.failed.length} could not be read: ${res.failed[0].detail}`, { variant: 'warning' });
    },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not upload.'), { variant: 'error' }),
  });

  // Reached from a tap with ?camera=1: open the camera straight away (browsers allow it right after a tap).
  useEffect(() => {
    if (params.get('camera') !== '1') return;
    try { autoCamera.current?.click(); } catch { /* the Take photos button is right there */ }
    const next = new URLSearchParams(params);
    next.delete('camera');
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <Box sx={pageSx}>
      <StudioHeader title="Photos" />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '340px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
        <Card variant="outlined" sx={{ p: 1.5, position: { lg: 'sticky' }, top: { lg: 16 } }}>
          <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Stock the library</Typography>
          <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mb: 1.25 }}>
            Real photos only: bright, the item fills the frame. Set a category or scan the tag first if you like.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, mb: 1.5 }}>
            <CategorySelect value={category} onChange={setCategory} categories={categories} />
            <TextField
              size="small"
              label="Scan or type the tag"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              sx={{ flex: { xs: '1 1 100%', sm: '1 1 180px' } }}
            />
          </Box>
          <CameraButtons onFiles={(files) => upload.mutate(files)} busy={upload.isPending} />
          <PhotoInput ref={autoCamera} onFiles={(files) => upload.mutate(files)} />
          {lastBatch && !upload.isPending ? (
            <Alert severity="success" sx={{ mt: 1.5 }}>
              {lastBatch} photo{lastBatch === 1 ? '' : 's'} added.
            </Alert>
          ) : null}
        </Card>
        <Box sx={{ minWidth: 0 }}>
          <PhotoGrid categories={categories} onPick={setOpen} />
        </Box>
      </Box>
      {open ? <PhotoDialog photo={open} categories={categories} onClose={() => setOpen(null)} /> : null}
    </Box>
  );
}
