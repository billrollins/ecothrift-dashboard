import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Typography,
} from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useRef, useState } from 'react';
import { getPhotoDropFile, type PhotoDropDTO } from '../../api/photoDrops.api';
import { PageHeader } from '../../components/common/PageHeader';
import { CameraDialog } from '../../components/photos/CameraDialog';
import {
  PhotoDropTile, TILE_CAPTION_SX, TILE_FRAME_SX, TILE_IMG_SX, dropTimeLabel, usedLabel,
} from '../../components/photos/PhotoDropTile';
import { PhotoTouchUp } from '../../components/photos/PhotoTouchUp';
import { isPhotoFile, shrinkPhoto } from '../../components/photos/photoFile';
import { useIsPhoneDevice } from '../../components/photos/photoMethods';
import {
  photoDropThumbKey, useAddPhotoDrop, useDeletePhotoDrop, usePhotoDropThumb, usePhotoDrops, useSteadyDrops,
} from '../../hooks/usePhotoDrops';
import { t } from '../../i18n/routines';
import { useLanguage } from '../../i18n/useLanguage';

/** A photo on its way into the drawer: shown at once from the phone's own copy, while it goes up. */
interface Pending {
  key: number;
  photo: Blob;
  url: string;
  failed: boolean;
}

const TILE_FRAME = {
  display: 'block', width: '100%', borderRadius: 1.5, overflow: 'hidden', border: '2px solid', borderColor: 'divider',
} as const;

function PendingTile({ item, onRetry, onRemove, lang }: { item: Pending; onRetry: () => void; onRemove: () => void; lang: string }) {
  return (
    <Box data-testid="photo-drop-pending" data-failed={item.failed ? 'yes' : 'no'}>
      <Box sx={TILE_FRAME}>
        <Box sx={TILE_FRAME_SX}>
          <Box component="img" src={item.url} alt={t('phNewPhoto', lang)} sx={TILE_IMG_SX} />
          <Box
            sx={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 1, bgcolor: 'rgba(17,24,39,0.55)', color: '#fff', fontWeight: 800,
            }}
          >
            {item.failed ? t('phNotSaved', lang) : (
              <>
                <CircularProgress size={30} sx={{ color: '#fff' }} />
                {t('phSaving', lang)}
              </>
            )}
          </Box>
        </Box>
      </Box>
      <Box sx={{ ...TILE_CAPTION_SX, display: 'flex', gap: 0.5 }}>
        {item.failed ? null : t('phSaving', lang)}
        {item.failed ? (
          <>
            <Button size="small" variant="contained" onClick={onRetry} data-testid="photo-drop-retry">{t('phTryAgain', lang)}</Button>
            <Button size="small" onClick={onRemove}>{t('phRemove', lang)}</Button>
          </>
        ) : null}
      </Box>
    </Box>
  );
}

/** "Delete this photo?" with the photo in it, so the last look is at the right one. */
function DeleteDropDialog({ drop, onKeep, onDelete, lang }: { drop: PhotoDropDTO | null; onKeep: () => void; onDelete: () => void; lang: string }) {
  const thumb = usePhotoDropThumb(drop?.id ?? null);
  const used = drop ? usedLabel(drop, lang) : '';
  return (
    <Dialog open={Boolean(drop)} onClose={onKeep} maxWidth="xs" fullWidth data-testid="photo-drop-delete-dialog">
      <DialogTitle sx={{ fontWeight: 800 }}>{t('phDeleteAsk', lang)}</DialogTitle>
      <DialogContent>
        <Box sx={{ ...TILE_FRAME_SX, width: 160, mx: 'auto', borderRadius: 1.5, overflow: 'hidden' }}>
          {thumb ? <Box component="img" src={thumb} alt="" sx={TILE_IMG_SX} /> : null}
        </Box>
        <Typography sx={{ textAlign: 'center', color: 'text.secondary', fontSize: 13.5, mt: 1, minHeight: 20 }}>
          {drop ? [dropTimeLabel(drop, lang), used].filter(Boolean).join(' · ') : ''}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onKeep} variant="outlined" color="inherit" sx={{ minHeight: 44 }}>{t('phKeep', lang)}</Button>
        <Button onClick={onDelete} variant="contained" color="error" sx={{ minHeight: 44 }} data-testid="photo-drop-delete-yes">
          {t('phDelete', lang)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Home > Photo drops (Dash Updates #82): take a photo on the phone, and it is in my photo drawer on every
 * computer a few seconds later. Everyone sees only their own.
 *
 * A photo is saved the moment it is taken (Bill: "click take photo, click"). The touch-up is there for the photo
 * that needs it: tap it in the drawer.
 */
export default function PhotoDropsPage() {
  const lang = useLanguage();
  const isPhone = useIsPhoneDevice();
  const client = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data: allDrops = [], isLoading, isError } = usePhotoDrops({ live: true });
  // A photo from another device waits while a hand is over the drawer, so nothing slides under it.
  const { drops, holdProps } = useSteadyDrops(allDrops);
  const add = useAddPhotoDrop();
  const remove = useDeletePhotoDrop();
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const serial = useRef(0);
  const [pending, setPending] = useState<Pending[]>([]);
  const [webcam, setWebcam] = useState(false);
  const [viewing, setViewing] = useState<PhotoDropDTO | null>(null);
  const [deleting, setDeleting] = useState<PhotoDropDTO | null>(null);
  const [replacing, setReplacing] = useState<number[]>([]);

  const full = useQuery({
    queryKey: ['photoDrops', 'file', viewing?.id],
    queryFn: async () => (await getPhotoDropFile(viewing!.id)).data,
    enabled: viewing !== null,
    staleTime: Infinity,
  });

  // The copies shown while saving are let go when the page closes.
  const pendingRef = useRef<Pending[]>([]);
  pendingRef.current = pending;
  useEffect(() => () => pendingRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);

  const send = async (item: Pending) => {
    try {
      const small = await shrinkPhoto(item.photo);
      // The tile's small picture is already here: no grey box while the server's copy is fetched.
      const drop = await add.mutateAsync({ photo: small });
      client.setQueryData(photoDropThumbKey(drop.id), small);
      setPending((rows) => rows.filter((row) => row.key !== item.key));
      URL.revokeObjectURL(item.url);
      enqueueSnackbar(t('phSaved', lang), { variant: 'success' });
    } catch {
      setPending((rows) => rows.map((row) => (row.key === item.key ? { ...row, failed: true } : row)));
    }
  };

  const saveNow = (photo: Blob) => {
    serial.current += 1;
    const item: Pending = { key: serial.current, photo, url: URL.createObjectURL(photo), failed: false };
    setPending((rows) => [item, ...rows]);
    void send(item);
  };

  /** A turned or cropped photo takes the old one's place: same spot, same time, same Used mark. */
  const saveChanges = async (id: number, photo: Blob) => {
    setReplacing((ids) => [...ids, id]);
    try {
      const drop = await add.mutateAsync({ photo, replaces: id });
      client.setQueryData(photoDropThumbKey(drop.id), photo);
    } catch {
      enqueueSnackbar(t('phSaveFailed', lang), { variant: 'error' });
    } finally {
      setReplacing((ids) => ids.filter((other) => other !== id));
    }
  };

  const retry = (item: Pending) => {
    setPending((rows) => rows.map((row) => (row.key === item.key ? { ...row, failed: false } : row)));
    void send(item);
  };

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter(isPhotoFile);
    event.target.value = '';
    // Oldest first, so the newest pick ends up first in the drawer.
    files.forEach((file) => saveNow(file));
  };

  const takeButton = (
    <Button
      key="take"
      variant={isPhone ? 'contained' : 'outlined'}
      size="large"
      startIcon={<PhotoCameraRounded />}
      onClick={() => (isPhone ? cameraRef.current?.click() : setWebcam(true))}
      data-testid="photo-drops-take"
      sx={isPhone ? { minHeight: 72, fontSize: 20, fontWeight: 800 } : { minHeight: 52 }}
    >
      {t('phTakePhoto', lang)}
    </Button>
  );
  const filesButton = (
    <Button
      key="files"
      variant={isPhone ? 'outlined' : 'contained'}
      size="large"
      startIcon={<FolderOpenRounded />}
      onClick={() => filesRef.current?.click()}
      data-testid="photo-drops-files"
      sx={{ minHeight: 52, ...(isPhone ? {} : { fontWeight: 800, minWidth: 200 }) }}
    >
      {t('phFromFiles', lang)}
    </Button>
  );
  const visible = drops;
  const count = visible.length + pending.length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }} data-testid="photo-drops-page">
      <PageHeader title={t('phDrops', lang)} subtitle={t(isPhone ? 'phDropsHelp' : 'phDropsHelpDesk', lang)} icon={false} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden data-testid="photo-drops-camera-input" onChange={onPick} />
      <input ref={filesRef} type="file" accept="image/*" multiple hidden data-testid="photo-drops-file-input" onChange={onPick} />
      {/* A phone leads with the camera in your hand; a computer leads with files (its drawer is the page itself). */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ my: 2 }}>
        {isPhone ? [takeButton, filesButton] : [filesButton, takeButton]}
      </Stack>

      <Typography component="h2" sx={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', mt: 3 }}>
        {t('phMyDrawer', lang)} ({count})
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 13, mb: 1.25, minHeight: 20 }}>
        {count > 0 ? t(isPhone ? 'phTapToFix' : 'phClickToFix', lang) : ''}
      </Typography>
      {isError ? <Alert severity="error">{t('phOpenFailed', lang)}</Alert> : null}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : count === 0 ? (
        <Typography data-testid="photo-drops-empty" sx={{ color: 'text.secondary', py: 3 }}>{t('phDrawerEmpty', lang)}</Typography>
      ) : (
        <Box
          {...holdProps}
          sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(auto-fill, minmax(150px, 1fr))' }, gap: 1.5 }}
        >
          {pending.map((item) => (
            <PendingTile
              key={`pending-${item.key}`}
              item={item}
              lang={lang}
              onRetry={() => retry(item)}
              onRemove={() => {
                URL.revokeObjectURL(item.url);
                setPending((rows) => rows.filter((row) => row.key !== item.key));
              }}
            />
          ))}
          {visible.map((drop) => (
            <PhotoDropTile
              key={drop.id}
              drop={drop}
              working={replacing.includes(drop.id)}
              disabled={replacing.includes(drop.id)}
              onClick={() => setViewing(drop)}
              clickLabel={t('phOpenPhoto', lang)}
              action={(
                <IconButton
                  aria-label={t('phDelete', lang)}
                  onClick={() => setDeleting(drop)}
                  data-testid="photo-drop-delete"
                  sx={{ width: 44, height: 44, mr: -0.75, color: 'text.secondary' }}
                >
                  <DeleteOutlineRounded />
                </IconButton>
              )}
            />
          ))}
        </Box>
      )}
      <Typography sx={{ color: 'text.secondary', fontSize: 13, mt: 2.5 }}>{t('phKeepNote', lang)}</Typography>

      <PhotoTouchUp
        open={viewing !== null}
        photo={viewing && full.data ? full.data : null}
        caption={viewing ? [dropTimeLabel(viewing, lang), usedLabel(viewing, lang)].filter(Boolean).join(' · ') : ''}
        error={full.isError ? t('phOpenFailed', lang) : ''}
        onClose={() => setViewing(null)}
        onSave={(photo) => {
          const id = viewing?.id;
          setViewing(null);
          if (id != null) void saveChanges(id, photo);
        }}
        onDelete={() => setDeleting(viewing)}
      />
      {webcam ? (
        <CameraDialog open onClose={() => setWebcam(false)} onPhoto={(file) => saveNow(file)} onUseFiles={() => filesRef.current?.click()} />
      ) : null}
      <DeleteDropDialog
        drop={deleting}
        lang={lang}
        onKeep={() => setDeleting(null)}
        onDelete={() => {
          const id = deleting?.id;
          setDeleting(null);
          if (id == null) return;
          if (viewing?.id === id) setViewing(null);
          remove.mutate(id, { onError: () => enqueueSnackbar(t('phDeleteFailed', lang), { variant: 'error' }) });
        }}
      />
    </Box>
  );
}
