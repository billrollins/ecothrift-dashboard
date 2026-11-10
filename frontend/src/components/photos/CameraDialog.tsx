import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/routines';
import { useLanguage } from '../../i18n/useLanguage';
import { blobToPhotoFile, videoFrameToJpeg } from './photoFile';

type CameraState = 'starting' | 'live' | 'none' | 'blocked';

export interface CameraDialogProps {
  open: boolean;
  onClose: () => void;
  onPhoto: (file: File) => void;
}

/**
 * Take photo on a computer: the webcam in a window. (A phone uses its own camera app instead; a computer's file
 * picker has no camera in it.) The camera stops the moment the window closes or the page is hidden.
 */
export function CameraDialog({ open, onClose, onPhoto }: CameraDialogProps) {
  const lang = useLanguage();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('starting');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const stop = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    const start = async () => {
      setState('starting');
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setState('none');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setState('live');
      } catch (error) {
        const name = (error as { name?: string } | null)?.name ?? '';
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'blocked' : 'none');
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop();
      else if (!streamRef.current) void start();
    };
    void start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [open]);

  const take = async () => {
    const video = videoRef.current;
    if (!video || busy) return;
    setBusy(true);
    try {
      onPhoto(blobToPhotoFile(await videoFrameToJpeg(video)));
      onClose();
    } catch {
      setState('none');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" data-testid="photo-camera-dialog">
      <DialogTitle sx={{ fontWeight: 800 }}>{t('phTakePhoto', lang)}</DialogTitle>
      <DialogContent>
        {state === 'none' ? <Alert severity="info" data-testid="photo-camera-none">{t('phNoCamera', lang)}</Alert> : null}
        {state === 'blocked' ? <Alert severity="warning" data-testid="photo-camera-blocked">{t('phCameraBlocked', lang)}</Alert> : null}
        <Box
          sx={{
            display: state === 'none' || state === 'blocked' ? 'none' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: '#111',
            borderRadius: 1,
            minHeight: 320,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box
            component="video"
            ref={videoRef}
            muted
            playsInline
            aria-label={t('phTakePhoto', lang)}
            sx={{ width: '100%', maxHeight: '65vh', display: 'block' }}
          />
          {state === 'starting' ? (
            <Box sx={{ position: 'absolute', display: 'flex', alignItems: 'center', gap: 1.5, color: '#fff' }}>
              <CircularProgress size={22} sx={{ color: '#fff' }} />
              {t('phCameraStarting', lang)}
            </Box>
          ) : null}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t('phCancel', lang)}</Button>
        <Button variant="contained" onClick={() => void take()} disabled={state !== 'live' || busy} data-testid="photo-camera-take">
          {t('phTakePhoto', lang)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
