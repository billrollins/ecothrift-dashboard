import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Slider,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Rect, clampBox, cropToJpeg, keyBox, photoBox, toSourceRect } from './keyCrop';

/** The zoom Bill shoots keys at (over white photo paper). */
const KEY_ZOOM = 5;
const BOX_STYLE = {
  position: 'absolute' as const,
  border: '3px solid #fff',
  borderRadius: 2,
  boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
  pointerEvents: 'none' as const,
};

type Mode = 'live' | 'crop' | 'review';

function cameraSupported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}

/** Track a frame element's size in CSS pixels (a callback ref: the dialog's portal mounts its content late). */
function useSize(el: HTMLElement | null) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [el]);
  return size;
}

/**
 * Live rear camera at 5x where the browser can set zoom (Android Chrome). The tracks stop at once when the page is
 * hidden, the phone locks or the dialog closes (the house camera rule), and start again when it is back.
 */
function useKeyCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [status, setStatus] = useState<'off' | 'starting' | 'live' | 'blocked' | 'unsupported'>('off');
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    const release = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    const onChange = () => {
      const hidden = document.visibilityState === 'hidden';
      if (hidden) release();
      setVisible(!hidden);
    };
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('pagehide', release);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('pagehide', release);
      release();
    };
  }, []);

  useEffect(() => {
    if (!enabled || !visible) {
      setStatus('off');
      return;
    }
    if (!cameraSupported()) {
      setStatus('unsupported');
      return;
    }
    let cancelled = false;
    const stop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    void (async () => {
      setStatus('starting');
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = media;
        const track = media.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as { zoom?: { min?: number; max?: number } };
        if (typeof caps.zoom?.max === 'number' && caps.zoom.max > 1) {
          const z = Math.min(KEY_ZOOM, caps.zoom.max);
          try {
            await track.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] });
            setZoom(z);
          } catch {
            setZoom(null);
          }
        } else {
          setZoom(null);
        }
        try {
          await track?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
        } catch {
          // Not every camera takes focus hints.
        }
        const el = videoRef.current;
        if (!el) throw new Error('no video');
        el.srcObject = media;
        el.muted = true;
        el.setAttribute('playsinline', 'true');
        await el.play();
        if (!cancelled) setStatus('live');
      } catch {
        stop();
        if (!cancelled) setStatus('blocked');
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, visible]);

  return { videoRef, status, zoom };
}

/**
 * Take a key photo: the live camera with the key box ("Make the key fill the box"), or the phone's own camera (its 5x
 * lens on an iPhone) or a saved photo, cropped to the box. `onPhoto` gets the cropped JPEG.
 */
export function KeyCamera({
  open,
  title,
  onClose,
  onPhoto,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onPhoto: (photo: Blob) => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [mode, setMode] = useState<Mode>('live');
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [file, setFile] = useState<{ url: string; w: number; h: number } | null>(null);
  const [box, setBox] = useState<Rect | null>(null);
  const [size, setSizeFraction] = useState(0.96);
  const [error, setError] = useState('');
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const nativeInput = useRef<HTMLInputElement | null>(null);
  const pickInput = useRef<HTMLInputElement | null>(null);
  const drag = useRef<{ x: number; y: number; box: Rect } | null>(null);
  const camera = useKeyCamera(open && mode === 'live');
  const frame = useSize(frameEl);
  const liveBox = frame.w ? keyBox(frame.w, frame.h) : null;

  const reset = useCallback(() => {
    setMode('live');
    setShot((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
    setFile((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
    setBox(null);
    setError('');
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  // A picked photo: start with the box in the middle.
  useEffect(() => {
    if (mode === 'crop' && file && frame.w) setBox(photoBox(file.w, file.h, frame.w, frame.h, size));
    // The size slider moves the box itself (below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, file, frame.w, frame.h]);

  const review = (blob: Blob) => {
    setShot({ blob, url: URL.createObjectURL(blob) });
    setMode('review');
  };

  const takeLive = async () => {
    const video = camera.videoRef.current;
    if (!video || !liveBox || !video.videoWidth) return;
    const src = toSourceRect(liveBox, video.videoWidth, video.videoHeight, frame.w, frame.h, 'cover');
    try {
      review(await cropToJpeg(video, src));
    } catch {
      setError("The photo didn't take. Try again.");
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    const url = URL.createObjectURL(picked);
    const img = new Image();
    img.onload = () => {
      setFile({ url, w: img.naturalWidth, h: img.naturalHeight });
      setMode('crop');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("That file isn't a photo this browser can open.");
    };
    img.src = url;
  };

  const cropFile = async () => {
    const img = imgRef.current;
    if (!img || !file || !box) return;
    const src = toSourceRect(box, file.w, file.h, frame.w, frame.h, 'contain');
    try {
      review(await cropToJpeg(img, src));
    } catch {
      setError("The crop didn't work. Try again.");
    }
  };

  const resize = (fraction: number) => {
    setSizeFraction(fraction);
    if (!box || !frame.w) return;
    if (!file) return;
    const next = photoBox(file.w, file.h, frame.w, frame.h, fraction);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    setBox(clampBox({ ...next, x: cx - next.w / 2, y: cy - next.h / 2 }, frame.w, frame.h));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!box) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, box };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setBox(clampBox({ ...d.box, x: d.box.x + e.clientX - d.x, y: d.box.y + e.clientY - d.y }, frame.w, frame.h));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const useShot = () => {
    if (!shot) return;
    onPhoto(shot.blob);
    onClose();
  };

  const liveHint =
    camera.status === 'live'
      ? camera.zoom
        ? `Camera zoom ${camera.zoom}x. Make the key fill the box.`
        : "This browser can't zoom the camera. Make the key fill the box, or use the phone camera at 5x."
      : camera.status === 'starting'
        ? 'Starting the camera...'
        : camera.status === 'blocked'
          ? "The camera didn't start. Use the phone camera or choose a photo."
          : camera.status === 'unsupported'
            ? 'No live camera here. Use the phone camera or choose a photo.'
            : '';

  return (
    <Dialog open={open} onClose={onClose} fullScreen={phone} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ p: { xs: 1, sm: 2 } }}>
        <Stack spacing={1.5}>
          <Box
            ref={setFrameEl}
            sx={{
              position: 'relative',
              width: '100%',
              height: { xs: 'calc(100dvh - 260px)', sm: 520 },
              minHeight: 280,
              bgcolor: '#111',
              borderRadius: 1,
              overflow: 'hidden',
              touchAction: 'none',
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {mode === 'live' ? (
              <>
                <Box
                  component="video"
                  ref={camera.videoRef}
                  playsInline
                  muted
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                {liveBox ? <Box sx={{ ...BOX_STYLE, left: liveBox.x, top: liveBox.y, width: liveBox.w, height: liveBox.h }} /> : null}
              </>
            ) : null}
            {mode === 'crop' && file ? (
              <>
                <Box
                  component="img"
                  ref={imgRef}
                  src={file.url}
                  alt="Key photo to crop"
                  sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none' }}
                  draggable={false}
                />
                {box ? (
                  <Box
                    onPointerDown={onPointerDown}
                    sx={{ ...BOX_STYLE, pointerEvents: 'auto', cursor: 'move', left: box.x, top: box.y, width: box.w, height: box.h }}
                  />
                ) : null}
              </>
            ) : null}
            {mode === 'review' && shot ? (
              <Box
                component="img"
                src={shot.url}
                alt="Key photo"
                sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', bgcolor: '#fff' }}
              />
            ) : null}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {mode === 'live' && liveHint}
            {mode === 'crop' && 'Drag the box onto the key. Make the key fill the box.'}
            {mode === 'review' && 'Is the whole key sharp, with every cut in the photo?'}
          </Typography>
          {mode === 'crop' ? (
            <Stack direction="row" spacing={2} alignItems="center" sx={{ px: 1 }}>
              <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>Box size</Typography>
              <Slider
                size="small"
                min={0.3}
                max={1}
                step={0.02}
                value={size}
                onChange={(_e, v) => resize(v as number)}
                aria-label="Box size"
              />
            </Stack>
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          <input ref={nativeInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
          <input ref={pickInput} type="file" accept="image/*" hidden onChange={onFile} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: { xs: 1, sm: 3 }, pb: 2 }}>
        {mode === 'live' ? (
          <>
            <Button onClick={() => nativeInput.current?.click()}>Phone camera</Button>
            <Button onClick={() => pickInput.current?.click()}>Choose a photo</Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" onClick={() => void takeLive()} disabled={camera.status !== 'live'}>
              Take photo
            </Button>
          </>
        ) : null}
        {mode === 'crop' ? (
          <>
            <Button onClick={reset}>Back</Button>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" onClick={() => void cropFile()} disabled={!box}>
              Crop to box
            </Button>
          </>
        ) : null}
        {mode === 'review' ? (
          <>
            <Button onClick={reset}>Retake</Button>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" onClick={useShot}>
              Use photo
            </Button>
          </>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
