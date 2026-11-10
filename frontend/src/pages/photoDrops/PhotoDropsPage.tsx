import { Alert, Box, Button, CircularProgress, IconButton, Stack, Typography } from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import { useSnackbar } from 'notistack';
import { useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { PageHeader } from '../../components/common/PageHeader';
import { CameraDialog } from '../../components/photos/CameraDialog';
import { PhotoDropTile } from '../../components/photos/PhotoDropTile';
import { PhotoTouchUp } from '../../components/photos/PhotoTouchUp';
import { useIsPhoneDevice } from '../../components/photos/photoMethods';
import { useAddPhotoDrop, useDeletePhotoDrop, usePhotoDrops } from '../../hooks/usePhotoDrops';
import { t } from '../../i18n/routines';
import { useLanguage } from '../../i18n/useLanguage';

/**
 * Home > Photo drops (Dash Updates #82): take a photo on the phone, and it is in my photo drawer on every
 * computer a few seconds later. Everyone sees only their own.
 */
export default function PhotoDropsPage() {
  const lang = useLanguage();
  const isPhone = useIsPhoneDevice();
  const { enqueueSnackbar } = useSnackbar();
  const { data: drops = [], isLoading, isError } = usePhotoDrops({ live: true });
  const add = useAddPhotoDrop();
  const remove = useDeletePhotoDrop();
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [fresh, setFresh] = useState<Blob | null>(null);
  const [webcam, setWebcam] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSaveError('');
    setFresh(file);
  };

  const save = (photo: Blob) => {
    setSaveError('');
    add.mutate(photo, {
      onSuccess: () => {
        setFresh(null);
        enqueueSnackbar(t('phSaved', lang), { variant: 'success' });
      },
      onError: () => setSaveError(t('phSaveFailed', lang)),
    });
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }} data-testid="photo-drops-page">
      <PageHeader title={t('phDrops', lang)} subtitle={t('phDropsHelp', lang)} icon={false} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden data-testid="photo-drops-camera-input" onChange={onPick} />
      <input ref={filesRef} type="file" accept="image/*" hidden data-testid="photo-drops-file-input" onChange={onPick} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ my: 2 }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<PhotoCameraRounded />}
          onClick={() => (isPhone ? cameraRef.current?.click() : setWebcam(true))}
          data-testid="photo-drops-take"
          sx={{ minHeight: 64, fontSize: 18, fontWeight: 800, flex: { xs: 'none', sm: '0 0 280px' } }}
        >
          {t('phTakePhoto', lang)}
        </Button>
        <Button
          variant="outlined"
          size="large"
          startIcon={<FolderOpenRounded />}
          onClick={() => filesRef.current?.click()}
          data-testid="photo-drops-files"
          sx={{ minHeight: 52 }}
        >
          {t('phFromFiles', lang)}
        </Button>
      </Stack>

      <Typography component="h2" sx={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', mt: 3, mb: 1 }}>
        {t('phMyDrawer', lang)} ({drops.length})
      </Typography>
      {isError ? <Alert severity="error">{t('phOpenFailed', lang)}</Alert> : null}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : drops.length === 0 ? (
        <Typography data-testid="photo-drops-empty" sx={{ color: 'text.secondary', py: 3 }}>{t('phDrawerEmpty', lang)}</Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(auto-fill, minmax(160px, 1fr))' }, gap: 1.5 }}>
          {drops.map((drop) => (
            <PhotoDropTile
              key={drop.id}
              drop={drop}
              corner={(
                <IconButton
                  aria-label={t('phDelete', lang)}
                  onClick={() => setDeleteId(drop.id)}
                  data-testid="photo-drop-delete"
                  sx={{ bgcolor: 'rgba(255,255,255,0.92)', '&:hover': { bgcolor: '#fff' }, width: 40, height: 40 }}
                >
                  <DeleteOutlineRounded />
                </IconButton>
              )}
            />
          ))}
        </Box>
      )}
      <Typography sx={{ color: 'text.secondary', fontSize: 13, mt: 2.5 }}>{t('phKeepNote', lang)}</Typography>

      <PhotoTouchUp photo={fresh} saving={add.isPending} error={saveError} onSave={save} onCancel={() => setFresh(null)} />
      {webcam ? <CameraDialog open onClose={() => setWebcam(false)} onPhoto={(file) => setFresh(file)} /> : null}
      <ConfirmDialog
        open={deleteId !== null}
        title={t('phDeleteAsk', lang)}
        message=""
        confirmLabel={t('phDelete', lang)}
        cancelLabel={t('phKeep', lang)}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          const id = deleteId;
          setDeleteId(null);
          if (id !== null) remove.mutate(id, { onError: () => enqueueSnackbar(t('phDeleteFailed', lang), { variant: 'error' }) });
        }}
      />
    </Box>
  );
}
