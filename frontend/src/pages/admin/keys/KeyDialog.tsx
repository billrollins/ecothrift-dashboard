import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import {
  KEY_TYPES,
  type KeyMetrics,
  type KeyRow,
  archiveKey,
  createKey,
  fetchRings,
  rereadKey,
  updateKey,
} from '../../../api/keys.api';
import { KeyCamera } from './KeyCamera';
import { errorText, when } from './keysShared';

const EMPTY_METRICS: KeyMetrics = {
  key_type: '',
  keyway: '',
  head_shape: '',
  brand: '',
  stamped_code: '',
  cut_count: null,
  cut_depths: '',
};

function metricsOf(key: KeyRow | null): KeyMetrics {
  if (!key) return EMPTY_METRICS;
  const { key_type, keyway, head_shape, brand, stamped_code, cut_count, cut_depths } = key;
  return { key_type, keyway, head_shape, brand, stamped_code, cut_count, cut_depths };
}

/** Add a key (name, ring, photo: the AI reads it on save) or edit one, metrics included. */
export function KeyDialog({
  open,
  keyRow,
  defaultRing,
  onClose,
}: {
  open: boolean;
  /** null: a new key. */
  keyRow: KeyRow | null;
  defaultRing?: number | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [ring, setRing] = useState<number | ''>('');
  const [metrics, setMetrics] = useState<KeyMetrics>(EMPTY_METRICS);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState('');
  const { data: rings = [] } = useQuery({ queryKey: ['keys', 'rings'], queryFn: fetchRings, enabled: open });

  useEffect(() => {
    if (!open) return;
    setName(keyRow?.name ?? '');
    setNotes(keyRow?.notes ?? '');
    setRing(keyRow ? keyRow.ring_id ?? '' : defaultRing ?? '');
    setMetrics(metricsOf(keyRow));
    setPhoto(null);
    setError('');
  }, [open, keyRow, defaultRing]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  const done = (row: KeyRow) => {
    void qc.invalidateQueries({ queryKey: ['keys'] });
    if (row.ai_error) enqueueSnackbar(`Saved. ${row.ai_error}`, { variant: 'warning' });
    else enqueueSnackbar('Saved.', { variant: 'success' });
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const base = { name, notes, ring: ring === '' ? null : ring, photo: photo?.blob ?? null };
      if (!keyRow) return createKey(base);
      // A new photo is read again by the AI; the typed metrics only go when there is no new photo.
      return updateKey(keyRow.id, photo ? base : { ...base, ...metrics, photo: undefined });
    },
    onSuccess: done,
    onError: (err) => setError(errorText(err, 'Could not save the key.')),
  });

  const reread = useMutation({
    mutationFn: () => rereadKey(keyRow!.id),
    onSuccess: (row) => {
      setMetrics(metricsOf(row));
      void qc.invalidateQueries({ queryKey: ['keys'] });
      enqueueSnackbar('Read again.', { variant: 'success' });
    },
    onError: (err) => setError(errorText(err, 'The AI could not read the photo.')),
  });

  const archive = useMutation({
    mutationFn: () => archiveKey(keyRow!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['keys'] });
      enqueueSnackbar('Key removed from the list.', { variant: 'success' });
      onClose();
    },
    onError: (err) => setError(errorText(err, 'Could not remove the key.')),
  });

  const shownPhoto = photo?.url ?? keyRow?.photo_url ?? null;
  const set = (field: keyof KeyMetrics) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setMetrics((m) => ({ ...m, [field]: field === 'cut_count' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value }));

  return (
    <>
      <Dialog open={open && !camera} onClose={onClose} fullScreen={phone} fullWidth maxWidth="md">
        <DialogTitle>{keyRow ? keyRow.name : 'Add a key'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  aspectRatio: '2.4 / 1',
                  bgcolor: 'grey.100',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {shownPhoto ? (
                  <Box component="img" src={shownPhoto} alt="Key" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <Typography color="text.secondary">No photo yet</Typography>
                )}
              </Box>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                <Button variant="outlined" onClick={() => setCamera(true)}>
                  {shownPhoto ? 'New photo' : 'Take photo'}
                </Button>
                {keyRow?.photo_url && !photo ? (
                  <Button onClick={() => reread.mutate()} disabled={reread.isPending}>
                    {reread.isPending ? 'Reading...' : 'Read photo again'}
                  </Button>
                ) : null}
              </Stack>
              {photo ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  The AI reads the new photo when you save.
                </Typography>
              ) : keyRow?.metrics_at ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Read by {keyRow.metrics_model} on {when(keyRow.metrics_at)}
                </Typography>
              ) : null}
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Stack spacing={2}>
                <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!keyRow} required />
                <TextField select label="Key ring" value={ring} onChange={(e) => setRing(e.target.value === '' ? '' : Number(e.target.value))}>
                  <MenuItem value="">Not on a ring</MenuItem>
                  {rings.map((r) => (
                    <MenuItem key={r.id} value={r.id}>
                      {r.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} />
              </Stack>
            </Grid>
            {keyRow && !photo ? (
              <Grid size={12}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  What the AI read (fix anything it got wrong)
                </Typography>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <TextField select fullWidth size="small" label="Type" value={metrics.key_type} onChange={set('key_type')}>
                      <MenuItem value="">Not read</MenuItem>
                      {KEY_TYPES.map((t) => (
                        <MenuItem key={t} value={t}>
                          {t[0].toUpperCase() + t.slice(1)}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <TextField fullWidth size="small" label="Keyway" value={metrics.keyway} onChange={set('keyway')} />
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <TextField fullWidth size="small" label="Brand" value={metrics.brand} onChange={set('brand')} />
                  </Grid>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <TextField fullWidth size="small" label="Head shape" value={metrics.head_shape} onChange={set('head_shape')} />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField fullWidth size="small" label="Stamped code" value={metrics.stamped_code} onChange={set('stamped_code')} />
                  </Grid>
                  <Grid size={{ xs: 4, md: 2 }}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Cuts"
                      value={metrics.cut_count ?? ''}
                      onChange={set('cut_count')}
                      slotProps={{ htmlInput: { min: 0, max: 12 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 8, md: 6 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Cut depths, head to tip"
                      placeholder="3-5-2-4-6"
                      value={metrics.cut_depths}
                      onChange={set('cut_depths')}
                    />
                  </Grid>
                </Grid>
              </Grid>
            ) : null}
          </Grid>
          {error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {keyRow ? (
            <Button color="error" onClick={() => archive.mutate()} disabled={archive.isPending}>
              Remove
            </Button>
          ) : null}
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending ? (photo ? 'Saving and reading...' : 'Saving...') : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
      <KeyCamera
        open={camera}
        title="Photo of the key"
        onClose={() => setCamera(false)}
        onPhoto={(blob) => setPhoto({ blob, url: URL.createObjectURL(blob) })}
      />
    </>
  );
}
