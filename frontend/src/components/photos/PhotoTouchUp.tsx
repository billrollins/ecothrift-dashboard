import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material';
import CropRounded from '@mui/icons-material/CropRounded';
import RotateRightRounded from '@mui/icons-material/RotateRightRounded';
import { useEffect, useRef, useState } from 'react';
import ReactCrop, { type Crop as CropState, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { t } from '../../i18n/routines';
import { useLanguage } from '../../i18n/useLanguage';
import { getCroppedJpegFromDisplay, getRotatedJpeg } from '../../utils/imageEdit';
import { shrinkPhoto } from './photoFile';
import { useIsPhoneDevice } from './photoMethods';

export interface PhotoTouchUpProps {
  /** The photo just taken; the window is open while this is set. */
  photo: Blob | null;
  saving?: boolean;
  error?: string;
  onSave: (photo: Blob) => void;
  onCancel: () => void;
}

/** The step between taking a photo and saving it: look at it, rotate it, crop it. Nothing more (D12). */
export function PhotoTouchUp({ photo, saving = false, error = '', onSave, onCancel }: PhotoTouchUpProps) {
  const lang = useLanguage();
  const fullScreen = useIsPhoneDevice();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [work, setWork] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [crop, setCrop] = useState<CropState>();
  const [done, setDone] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setWork(null);
    setCropping(false);
    setCrop(undefined);
    setDone(null);
    if (!photo) return undefined;
    setBusy(true);
    void shrinkPhoto(photo).then((small) => {
      if (cancelled) return;
      setWork(small);
      setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [photo]);

  useEffect(() => {
    if (!work) {
      setUrl(null);
      return undefined;
    }
    const next = URL.createObjectURL(work);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [work]);

  const rotate = async () => {
    if (!url || busy) return;
    setBusy(true);
    try {
      setWork(await getRotatedJpeg(url, 90));
    } finally {
      setBusy(false);
    }
  };

  const startCrop = () => {
    setCrop({ unit: '%', x: 5, y: 5, width: 90, height: 90 });
    setDone(null);
    setCropping(true);
  };

  const applyCrop = async () => {
    const img = imgRef.current;
    if (!img) return;
    // Before the first drag the crop is the starting box (5% in on every side).
    const box: PixelCrop = done && done.width > 1 && done.height > 1
      ? done
      : { unit: 'px', x: img.width * 0.05, y: img.height * 0.05, width: img.width * 0.9, height: img.height * 0.9 };
    setBusy(true);
    try {
      setWork(await getCroppedJpegFromDisplay(img, box));
      setCropping(false);
    } finally {
      setBusy(false);
    }
  };

  const locked = busy || saving;
  const picture = url ? (
    <Box
      component="img"
      ref={imgRef}
      src={url}
      alt={t('phNewPhoto', lang)}
      data-testid="photo-touch-up-image"
      sx={{ maxWidth: '100%', maxHeight: fullScreen ? '62vh' : '60vh', display: 'block' }}
    />
  ) : null;

  return (
    <Dialog open={Boolean(photo)} onClose={locked ? undefined : onCancel} fullScreen={fullScreen} fullWidth maxWidth="md" data-testid="photo-touch-up">
      <DialogTitle sx={{ fontWeight: 800 }}>{t('phNewPhoto', lang)}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#111', borderRadius: 1, minHeight: 240, p: 1 }}>
          {!url ? <CircularProgress sx={{ color: '#fff' }} /> : cropping ? (
            <ReactCrop crop={crop} onChange={(_, percent) => setCrop(percent)} onComplete={(pixels) => setDone(pixels)} keepSelection>
              {picture}
            </ReactCrop>
          ) : picture}
        </Box>
        {cropping ? (
          <Stack direction="row" spacing={1} justifyContent="center">
            <Button onClick={() => setCropping(false)} disabled={locked} data-testid="photo-crop-cancel">{t('phCropCancel', lang)}</Button>
            <Button variant="outlined" onClick={() => void applyCrop()} disabled={locked} data-testid="photo-crop-apply">{t('phCropApply', lang)}</Button>
          </Stack>
        ) : (
          <Stack direction="row" spacing={1} justifyContent="center">
            <Button startIcon={<RotateRightRounded />} onClick={() => void rotate()} disabled={locked || !url} data-testid="photo-rotate">{t('phRotate', lang)}</Button>
            <Button startIcon={<CropRounded />} onClick={startCrop} disabled={locked || !url} data-testid="photo-crop">{t('phCrop', lang)}</Button>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={locked}>{t('phCancel', lang)}</Button>
        <Button
          variant="contained"
          size="large"
          disabled={locked || cropping || !work}
          onClick={() => work && onSave(work)}
          data-testid="photo-save"
        >
          {saving ? t('phSaving', lang) : t('phSave', lang)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
