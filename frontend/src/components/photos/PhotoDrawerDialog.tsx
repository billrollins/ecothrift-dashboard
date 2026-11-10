import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { getPhotoDropFile, markPhotoDropUsed, type PhotoDropDTO } from '../../api/photoDrops.api';
import { photoDropsKey, usePhotoDrops } from '../../hooks/usePhotoDrops';
import { useQueryClient } from '@tanstack/react-query';
import { t } from '../../i18n/routines';
import { useLanguage } from '../../i18n/useLanguage';
import { PhotoDropTile } from './PhotoDropTile';
import { blobToPhotoFile } from './photoFile';

export interface PhotoDrawerDialogProps {
  open: boolean;
  onClose: () => void;
  onPhotos: (files: File[]) => void;
  /** One photo: a tap uses it. Several: tap each, then Use photos. */
  multiple?: boolean;
  /** Most photos this pick may return. */
  max?: number;
  /** Where the photo is going, in the screen's own words; shown on the drop as "Used in ...". */
  usedWhere?: string;
}

/**
 * Pick from my photo drawer. While it is open the list refreshes every few seconds, so a photo taken on the phone
 * a moment ago shows up without touching anything.
 */
export function PhotoDrawerDialog({ open, onClose, onPhotos, multiple = false, max, usedWhere = '' }: PhotoDrawerDialogProps) {
  const lang = useLanguage();
  const client = useQueryClient();
  const { data: drops = [], isLoading, isError } = usePhotoDrops({ enabled: open, live: open });
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const limit = multiple ? Math.max(1, max ?? Number.POSITIVE_INFINITY) : 1;

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    setBusy(false);
    setError('');
  }, [open]);

  const use = async (rows: PhotoDropDTO[]) => {
    if (!rows.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const files = await Promise.all(
        rows.map(async (row) => blobToPhotoFile((await getPhotoDropFile(row.id)).data, row.filename || undefined)),
      );
      // The mark is a note for the person; a failed mark never blocks using the photo.
      void Promise.allSettled(rows.map((row) => markPhotoDropUsed(row.id, usedWhere)))
        .then(() => client.invalidateQueries({ queryKey: photoDropsKey }));
      onPhotos(files);
      onClose();
    } catch {
      setError(t('phOpenFailed', lang));
      setBusy(false);
    }
  };

  const tap = (drop: PhotoDropDTO) => {
    if (!multiple) {
      void use([drop]);
      return;
    }
    setPicked((current) => {
      if (current.includes(drop.id)) return current.filter((id) => id !== drop.id);
      return current.length >= limit ? current : [...current, drop.id];
    });
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md" data-testid="photo-drawer-dialog">
      <DialogTitle sx={{ fontWeight: 800 }}>{t('phMyDrawer', lang)}</DialogTitle>
      <DialogContent sx={{ minHeight: 220 }}>
        {error ? <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert> : null}
        {isError ? <Alert severity="error" sx={{ mb: 1.5 }}>{t('phOpenFailed', lang)}</Alert> : null}
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : drops.length === 0 ? (
          <Box data-testid="photo-drawer-empty" sx={{ py: 4, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t('phDrawerEmpty', lang)}</Typography>
            <Typography sx={{ color: 'text.secondary' }}>{t('phDrawerHow', lang)}</Typography>
          </Box>
        ) : (
          <>
            <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 1.5 }}>
              {multiple ? t('phPickMany', lang) : t('phPickOne', lang)}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 1.5 }}>
              {drops.map((drop) => (
                <PhotoDropTile
                  key={drop.id}
                  drop={drop}
                  selected={picked.includes(drop.id)}
                  disabled={busy}
                  onClick={() => tap(drop)}
                />
              ))}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>{t('phCancel', lang)}</Button>
        {multiple ? (
          <Button
            variant="contained"
            disabled={busy || picked.length === 0}
            onClick={() => void use(drops.filter((drop) => picked.includes(drop.id)))}
            data-testid="photo-drawer-use"
          >
            {t('phUsePhotos', lang)}{picked.length ? ` (${picked.length})` : ''}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
