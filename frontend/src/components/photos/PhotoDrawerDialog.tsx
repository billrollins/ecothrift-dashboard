import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Link, MenuItem, TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { getPhotoDrawerOwners, getPhotoDropFile, markPhotoDropUsed, type PhotoDropDTO } from '../../api/photoDrops.api';
import { useAuthUser } from '../../contexts/AuthContext';
import {
  photoDropsKey, readDrawerWhose, usePhotoDrops, useSteadyDrops, writeDrawerWhose,
} from '../../hooks/usePhotoDrops';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from '../../i18n/routines';
import { useLanguage } from '../../i18n/useLanguage';
import { PhotoDropTile } from './PhotoDropTile';
import { blobToPhotoFile, rememberDrop } from './photoFile';
import { useIsPhoneDevice } from './photoMethods';

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
  /**
   * When the Used mark is made. `pick`: now (a screen that saves the photo the moment it is picked).
   * `save`: not here; the screen calls `markPhotosUsed` when its own Save or Send goes through.
   */
  usedOn?: 'pick' | 'save';
}

/**
 * Pick from my photo drawer. While it is open the list refreshes every few seconds, so a photo taken on the phone
 * a moment ago shows up without touching anything.
 *
 * The owner (a superuser) also gets "Whose drawer" (owner 2026-11-25): Mine, or anyone whose drawer holds photos.
 * The last pick is remembered on this computer. Everyone else sees only their own drawer, as before.
 */
export function PhotoDrawerDialog({
  open, onClose, onPhotos, multiple = false, max, usedWhere = '', usedOn = 'pick',
}: PhotoDrawerDialogProps) {
  const lang = useLanguage();
  const isPhone = useIsPhoneDevice();
  const client = useQueryClient();
  const canPickWhose = Boolean(useAuthUser()?.is_superuser);
  const [whose, setWhose] = useState<number | null>(() => (canPickWhose ? readDrawerWhose() : null));
  const ownersQ = useQuery({
    queryKey: ['photoDrawerOwners'],
    queryFn: async () => (await getPhotoDrawerOwners()).data,
    enabled: open && canPickWhose,
    staleTime: 30_000,
  });
  const owners = ownersQ.data ?? [];
  // A remembered person whose drawer is empty now (or who is gone) reads as Mine.
  const owner = canPickWhose && whose != null && (!ownersQ.data || owners.some((row) => row.id === whose)) ? whose : null;
  const { data: allDrops = [], isLoading, isError } = usePhotoDrops({ enabled: open, live: open, owner });
  const { drops, holdProps } = useSteadyDrops(allDrops);
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
        rows.map(async (row) => rememberDrop(
          blobToPhotoFile((await getPhotoDropFile(row.id)).data, row.filename || undefined), row.id,
        )),
      );
      if (usedOn === 'pick') {
        // The mark is a note for the person; a failed mark never blocks using the photo.
        void Promise.allSettled(rows.map((row) => markPhotoDropUsed(row.id, usedWhere)))
          .then(() => client.invalidateQueries({ queryKey: photoDropsKey }));
      }
      onPhotos(files);
      onClose();
    } catch {
      setError(t('phOpenFailed', lang));
      setBusy(false);
    }
  };

  const tap = (drop: PhotoDropDTO) => {
    if (!multiple) {
      setPicked([drop.id]);
      void use([drop]);
      return;
    }
    setPicked((current) => {
      if (current.includes(drop.id)) return current.filter((id) => id !== drop.id);
      return current.length >= limit ? current : [...current, drop.id];
    });
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="md"
      fullScreen={isPhone}
      data-testid="photo-drawer-dialog"
    >
      <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        {canPickWhose ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            {t('phDrawer', lang)}
            <TextField
              select
              size="small"
              label={t('phWhoseDrawer', lang)}
              value={owner ?? 'mine'}
              disabled={busy}
              onChange={(event) => {
                const next = event.target.value === 'mine' ? null : Number(event.target.value);
                setWhose(next);
                writeDrawerWhose(next);
                setPicked([]);
              }}
              sx={{ minWidth: 190 }}
              slotProps={{ htmlInput: { 'data-testid': 'photo-drawer-whose' } }}
            >
              <MenuItem value="mine">{t('phMine', lang)}</MenuItem>
              {owners.map((row) => (
                <MenuItem key={row.id} value={row.id}>{row.name} ({row.photos})</MenuItem>
              ))}
            </TextField>
          </Box>
        ) : t('phMyDrawer', lang)}
        {/* Every drop, used or not (2026-11-13: Photo drops left the avatar menu). A new tab keeps this form open. */}
        <Link href="/photo-drops" target="_blank" rel="noopener" underline="hover" sx={{ fontSize: 14, fontWeight: 600 }}>
          {t('phSeeAll', lang)}
        </Link>
      </DialogTitle>
      <DialogContent sx={{ minHeight: 220 }}>
        {error ? <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert> : null}
        {isError ? <Alert severity="error" sx={{ mb: 1.5 }}>{t('phOpenFailed', lang)}</Alert> : null}
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : drops.length === 0 ? (
          <Box data-testid="photo-drawer-empty" sx={{ py: 4, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t(owner != null ? 'phDrawerEmptyTheirs' : 'phDrawerEmpty', lang)}</Typography>
            {owner == null ? <Typography sx={{ color: 'text.secondary' }}>{t('phDrawerHow', lang)}</Typography> : null}
          </Box>
        ) : (
          <>
            <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mb: 1.5 }}>
              {multiple ? t('phPickMany', lang) : t('phPickOne', lang)}
            </Typography>
            <Box
              {...holdProps}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(auto-fill, minmax(132px, 1fr))' },
                gap: { xs: 1, sm: 1.5 },
              }}
            >
              {drops.map((drop) => (
                <PhotoDropTile
                  key={drop.id}
                  drop={drop}
                  selected={picked.includes(drop.id)}
                  working={busy && picked.includes(drop.id)}
                  disabled={busy}
                  onClick={() => tap(drop)}
                />
              ))}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        {/* Always in the row, so the buttons never move when the wait starts. */}
        <Box
          role="status"
          data-testid="photo-drawer-adding"
          sx={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 1, fontSize: 14, fontWeight: 700,
            visibility: busy ? 'visible' : 'hidden',
          }}
        >
          <CircularProgress size={18} />
          {t('phAdding', lang)}
        </Box>
        <Button onClick={onClose} disabled={busy}>{t('phCancel', lang)}</Button>
        {multiple ? (
          <Button
            variant="contained"
            disabled={busy || picked.length === 0}
            onClick={() => void use(drops.filter((drop) => picked.includes(drop.id)))}
            data-testid="photo-drawer-use"
            sx={{ minWidth: 150 }}
          >
            {t('phUsePhotos', lang)}{picked.length ? ` (${picked.length})` : ''}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
