import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import CropRounded from '@mui/icons-material/CropRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import RotateLeftRounded from '@mui/icons-material/RotateLeftRounded';
import RotateRightRounded from '@mui/icons-material/RotateRightRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import { useEffect, useRef, useState } from 'react';
import ReactCrop, { type Crop as CropState, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { t } from '../../i18n/routines';
import { useLanguage } from '../../i18n/useLanguage';
import { getCroppedJpegFromDisplay, getRotatedJpeg } from '../../utils/imageEdit';
import { shrinkPhoto } from './photoFile';
import { useIsPhoneDevice } from './photoMethods';

export interface PhotoTouchUpProps {
  /** The window is open while this is true. */
  open: boolean;
  /** The photo to look at. While it is still on its way (null), the window shows that it is loading. */
  photo: Blob | null;
  /** Words under the title: when it was taken, where it was used. */
  caption?: string;
  error?: string;
  /** Called with the turned or cropped photo. Not called when nothing was changed. */
  onSave: (photo: Blob) => void;
  onClose: () => void;
  onDelete?: () => void;
}

/** Look at one photo big, and if you want, turn it or crop it. Nothing more (D12). */
export function PhotoTouchUp({ open, photo, caption = '', error = '', onSave, onClose, onDelete }: PhotoTouchUpProps) {
  const lang = useLanguage();
  const fullScreen = useIsPhoneDevice();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [base, setBase] = useState<Blob | null>(null);
  const [work, setWork] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [crop, setCrop] = useState<CropState>();
  const [done, setDone] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBase(null);
    setWork(null);
    setCropping(false);
    setCrop(undefined);
    setDone(null);
    setBusy(false);
    if (!photo) return undefined;
    void shrinkPhoto(photo).then((small) => {
      if (cancelled) return;
      setBase(small);
      setWork(small);
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

  const rotate = async (degrees: 90 | 270) => {
    if (!url || busy) return;
    setBusy(true);
    try {
      setWork(await getRotatedJpeg(url, degrees));
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

  const changed = Boolean(work && base && work !== base);
  const ready = Boolean(url);
  const picture = url ? (
    <Box
      component="img"
      ref={imgRef}
      src={url}
      alt={t('phPhoto', lang)}
      data-testid="photo-touch-up-image"
      sx={{ maxWidth: '100%', maxHeight: fullScreen ? '58vh' : '56vh', display: 'block' }}
    />
  ) : null;
  // On a phone the four tools share the row evenly, picture over word, so the words never touch.
  const tool = {
    minHeight: { xs: 56, sm: 44 }, flex: { xs: '1 1 0', sm: 'none' }, minWidth: 0, px: { xs: 0.5, sm: 2 },
    whiteSpace: 'nowrap', flexDirection: { xs: 'column', sm: 'row' }, fontSize: { xs: 12.5, sm: 14 }, lineHeight: 1.3,
    '& .MuiButton-startIcon': { mx: { xs: 0, sm: undefined }, mb: { xs: 0.25, sm: 0 } },
  } as const;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen={fullScreen} fullWidth maxWidth="md" data-testid="photo-touch-up">
      <DialogTitle sx={{ fontWeight: 800, pb: 0.5, pr: 7 }}>
        {t('phPhoto', lang)}
        <IconButton
          aria-label={t('phClose', lang)}
          onClick={onClose}
          disabled={busy}
          data-testid="photo-touch-up-close"
          sx={{ position: 'absolute', top: 8, right: 8, width: 44, height: 44 }}
        >
          <CloseRounded />
        </IconButton>
        <Box sx={{ fontSize: 13, fontWeight: 400, color: 'text.secondary', minHeight: 20, lineHeight: '20px' }}>{caption}</Box>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Box
          sx={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
            bgcolor: '#111', borderRadius: 1, minHeight: { xs: 240, sm: 360 }, p: 1,
            // A drag that misses a corner must not paint the photo in the browser's select colour.
            userSelect: 'none', WebkitUserSelect: 'none', '& img': { WebkitUserDrag: 'none' },
            // Crop corners a thumb can grab.
            '--rc-drag-handle-size': '18px',
            '--rc-drag-handle-mobile-size': '36px',
            '--rc-drag-handle-bg-colour': 'rgba(255,255,255,0.9)',
          }}
        >
          {!url ? <CircularProgress sx={{ color: '#fff' }} /> : cropping ? (
            <ReactCrop crop={crop} onChange={(_, percent) => setCrop(percent)} onComplete={(pixels) => setDone(pixels)} keepSelection>
              {picture}
            </ReactCrop>
          ) : picture}
          {busy && url ? (
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.35)' }}>
              <CircularProgress sx={{ color: '#fff' }} />
            </Box>
          ) : null}
        </Box>
        {/* One row, one height, in both states: nothing below it moves when Crop is on. */}
        <Box sx={{ display: 'flex', gap: { xs: 0.5, sm: 1 }, justifyContent: 'center', minHeight: { xs: 56, sm: 44 } }}>
          {cropping ? (
            <>
              <Button sx={tool} onClick={() => setCropping(false)} disabled={busy} data-testid="photo-crop-cancel">{t('phCropCancel', lang)}</Button>
              <Button sx={tool} variant="outlined" onClick={() => void applyCrop()} disabled={busy} data-testid="photo-crop-apply">{t('phCropApply', lang)}</Button>
            </>
          ) : (
            <>
              <Button sx={tool} startIcon={<RotateLeftRounded />} onClick={() => void rotate(270)} disabled={busy || !ready} data-testid="photo-rotate-left">{t('phTurnLeft', lang)}</Button>
              <Button sx={tool} startIcon={<RotateRightRounded />} onClick={() => void rotate(90)} disabled={busy || !ready} data-testid="photo-rotate">{t('phTurnRight', lang)}</Button>
              <Button sx={tool} startIcon={<CropRounded />} onClick={startCrop} disabled={busy || !ready} data-testid="photo-crop">{t('phCrop', lang)}</Button>
              <Button
                sx={{ ...tool, visibility: changed ? 'visible' : 'hidden' }}
                startIcon={<UndoRounded />}
                onClick={() => setWork(base)}
                disabled={busy}
                data-testid="photo-undo"
              >
                {t('phUndo', lang)}
              </Button>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {onDelete ? (
          <Button color="error" startIcon={<DeleteOutlineRounded />} onClick={onDelete} disabled={busy} data-testid="photo-touch-up-delete" sx={{ minHeight: 44 }}>
            {t('phDelete', lang)}
          </Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        {/* Once something is changed, Cancel leaves the photo as it was. Same spot every time, so nothing moves. */}
        <Button
          onClick={onClose}
          disabled={busy}
          data-testid="photo-touch-up-cancel"
          sx={{ minHeight: 44, visibility: changed ? 'visible' : 'hidden' }}
        >
          {t('phCancel', lang)}
        </Button>
        <Button
          variant="contained"
          size="large"
          disabled={busy || cropping}
          onClick={() => (changed && work ? onSave(work) : onClose())}
          data-testid="photo-save"
          sx={{ minWidth: 150, minHeight: 44 }}
        >
          {changed ? t('phSaveChanges', lang) : t('phDone', lang)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
