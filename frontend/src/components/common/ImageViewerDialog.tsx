import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import Download from '@mui/icons-material/Download';
import UploadFile from '@mui/icons-material/UploadFile';
import ZoomIn from '@mui/icons-material/ZoomIn';
import ZoomOut from '@mui/icons-material/ZoomOut';
import FitScreen from '@mui/icons-material/FitScreen';
import RotateLeft from '@mui/icons-material/RotateLeft';
import RotateRight from '@mui/icons-material/RotateRight';
import Crop from '@mui/icons-material/Crop';
import CropOriginal from '@mui/icons-material/CropOriginal';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import ReactCrop, {
  centerCrop,
  type Crop as CropState,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { downloadBlob } from '../../utils/downloadBlob';
import { getCroppedJpegFromDisplay, getRotatedJpeg } from '../../utils/imageEdit';

export interface ImageViewerDialogProps {
  open: boolean;
  onClose: () => void;
  /** Full-resolution image URL (shown in the dialog). */
  src: string | null;
  alt: string;
  title?: string;
  filename?: string | null;
  /** Authenticated download (preferred). Falls back to fetching `src`. */
  onDownload?: () => void | Promise<void>;
  downloadLabel?: string;
  /** Persist an edited JPEG (Receiving replace, etc.). */
  onSaveEdited?: (blob: Blob) => void | Promise<void>;
  /** When false, hide crop/rotate save controls. */
  canEdit?: boolean;
  /** Pick a new image file to replace the current one in place. */
  onReplaceFile?: (file: File) => void | Promise<void>;
  /** Gallery navigation (e.g. Receiving photo sequence). */
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** Shown in the title area, e.g. "3 / 12". */
  positionLabel?: string | null;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function initialPercentCrop(mediaWidth: number, mediaHeight: number): CropState {
  return centerCrop(
    {
      unit: '%',
      width: 90,
      height: 90,
    },
    mediaWidth,
    mediaHeight,
  );
}

/**
 * Reusable image lightbox: fit-to-viewport at 100%, zoom/pan, optional crop/rotate save.
 * Crop uses freeform aspect with corner + edge handles (react-image-crop).
 */
export function ImageViewerDialog({
  open,
  onClose,
  src,
  alt,
  title,
  filename,
  onDownload,
  downloadLabel = 'Download',
  onSaveEdited,
  canEdit = false,
  onReplaceFile,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  positionLabel = null,
}: ImageViewerDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const editImgRef = useRef<HTMLImageElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [rotating, setRotating] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const [editMode, setEditMode] = useState(false);
  /** Working image for edit (may be a rotated blob URL). */
  const [editSrc, setEditSrc] = useState<string | null>(null);
  const [editObjectUrl, setEditObjectUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropState>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [dirty, setDirty] = useState(false);

  const editable = Boolean(canEdit && onSaveEdited);
  const replaceable = Boolean(onReplaceFile);

  const revokeEditUrl = () => {
    if (editObjectUrl) {
      URL.revokeObjectURL(editObjectUrl);
      setEditObjectUrl(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    setLoading(Boolean(src));
    setError(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setEditMode(false);
    setEditSrc(null);
    setEditObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCrop(undefined);
    setCompletedCrop(null);
    setDirty(false);
  }, [open, src]);

  useEffect(() => {
    return () => {
      if (editObjectUrl) URL.revokeObjectURL(editObjectUrl);
    };
  }, [editObjectUrl]);

  const fitToScreen = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  const handleWheel = (e: ReactWheelEvent) => {
    if (editMode) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((z) => {
      const next = clampZoom(z + delta);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (editMode || zoom <= 1) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setPan({
      x: d.originX + (e.clientX - d.startX),
      y: d.originY + (e.clientY - d.startY),
    });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (onDownload) {
        await onDownload();
        return;
      }
      if (!src) return;
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        downloadBlob(blob, filename || 'photo.jpg');
      } catch {
        window.open(src, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleReplacePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onReplaceFile) return;
    setReplacing(true);
    try {
      await onReplaceFile(file);
    } finally {
      setReplacing(false);
    }
  };

  const enterEdit = () => {
    if (!editable || !src) return;
    revokeEditUrl();
    setEditSrc(src);
    setCrop(undefined);
    setCompletedCrop(null);
    setDirty(false);
    setEditMode(true);
    fitToScreen();
  };

  const exitEdit = () => {
    setEditMode(false);
    setEditSrc(null);
    revokeEditUrl();
    setCrop(undefined);
    setCompletedCrop(null);
    setDirty(false);
  };

  const onEditImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const next = initialPercentCrop(width, height);
    setCrop(next);
    // Seed completed crop from rendered size so Save works before first drag.
    setCompletedCrop({
      unit: 'px',
      x: (next.x / 100) * width,
      y: (next.y / 100) * height,
      width: (next.width / 100) * width,
      height: (next.height / 100) * height,
    });
  };

  const bakeRotate = async (degrees: number) => {
    const base = editSrc || src;
    if (!base) return;
    setRotating(true);
    try {
      const blob = await getRotatedJpeg(base, degrees);
      const objectUrl = URL.createObjectURL(blob);
      if (editObjectUrl) URL.revokeObjectURL(editObjectUrl);
      setEditObjectUrl(objectUrl);
      setEditSrc(objectUrl);
      setCrop(undefined);
      setCompletedCrop(null);
      setDirty(true);
    } finally {
      setRotating(false);
    }
  };

  const handleSaveEdited = async () => {
    if (!onSaveEdited || !editSrc || !editImgRef.current || !completedCrop) return;
    if (!dirty) return;
    if (completedCrop.width < 1 || completedCrop.height < 1) return;
    setSaving(true);
    try {
      const blob = await getCroppedJpegFromDisplay(editImgRef.current, completedCrop);
      await onSaveEdited(blob);
      exitEdit();
    } finally {
      setSaving(false);
    }
  };

  const navEnabled = !editMode && Boolean(onPrev || onNext);

  useEffect(() => {
    if (!open || !navEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, navEnabled, hasPrev, hasNext, onPrev, onNext]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="lg"
      fullWidth
      aria-labelledby="image-viewer-title"
      PaperProps={{
        sx: {
          height: fullScreen ? '100%' : 'min(90vh, 900px)',
          maxHeight: fullScreen ? '100%' : '90vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <DialogTitle
        id="image-viewer-title"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1, flexShrink: 0 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap fontWeight={700}>
            {title || filename || 'Photo'}
          </Typography>
          {positionLabel || (filename && title) ? (
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {[positionLabel, filename && title ? filename : null].filter(Boolean).join(' · ')}
            </Typography>
          ) : null}
        </Box>
        <IconButton aria-label="Close" onClick={onClose} edge="end">
          <Close />
        </IconButton>
      </DialogTitle>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1.5,
          py: 0.75,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        {!editMode ? (
          <>
            <IconButton
              aria-label="Zoom out"
              size="small"
              disabled={!src || zoom <= MIN_ZOOM}
              onClick={() =>
                setZoom((z) => {
                  const next = clampZoom(z - ZOOM_STEP);
                  if (next <= 1) setPan({ x: 0, y: 0 });
                  return next;
                })
              }
            >
              <ZoomOut />
            </IconButton>
            <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </Typography>
            <IconButton
              aria-label="Zoom in"
              size="small"
              disabled={!src || zoom >= MAX_ZOOM}
              onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
            >
              <ZoomIn />
            </IconButton>
            <IconButton aria-label="Fit to screen" size="small" disabled={!src} onClick={fitToScreen}>
              <FitScreen />
            </IconButton>
            {editable ? (
              <Button size="small" startIcon={<Crop />} onClick={enterEdit} disabled={!src || loading || error}>
                Crop / Rotate
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <IconButton
              aria-label="Rotate left"
              size="small"
              disabled={rotating || saving}
              onClick={() => void bakeRotate(-90)}
            >
              <RotateLeft />
            </IconButton>
            <IconButton
              aria-label="Rotate right"
              size="small"
              disabled={rotating || saving}
              onClick={() => void bakeRotate(90)}
            >
              <RotateRight />
            </IconButton>
            <Typography variant="caption" color="text.secondary" sx={{ mx: 0.5 }}>
              Drag corners / edges to crop any aspect ratio
            </Typography>
            <Button size="small" startIcon={<CropOriginal />} onClick={exitEdit} disabled={saving || rotating}>
              Cancel edit
            </Button>
          </>
        )}
      </Box>

      <DialogContent
        dividers
        sx={{
          flex: 1,
          minHeight: 0,
          p: 0,
          overflow: 'hidden',
          bgcolor: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {!src ? (
          <Box sx={{ m: 'auto', p: 2 }}>
            <Typography color="grey.300">No image available.</Typography>
          </Box>
        ) : error ? (
          <Box sx={{ m: 'auto', p: 2 }}>
            <Typography color="error.light">Could not load image.</Typography>
          </Box>
        ) : editMode && editSrc ? (
          <Box
            sx={{
              position: 'relative',
              flex: 1,
              minHeight: 280,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'auto',
              p: 1,
              '& .ReactCrop': { maxHeight: '100%' },
              '& .ReactCrop__child-wrapper img': {
                maxHeight: 'calc(90vh - 220px)',
                maxWidth: '100%',
              },
            }}
          >
            {rotating ? (
              <CircularProgress size={36} sx={{ color: 'grey.200', position: 'absolute', zIndex: 2 }} />
            ) : null}
            <ReactCrop
              crop={crop}
              onChange={(c) => {
                setCrop(c);
                setDirty(true);
              }}
              onComplete={(c) => {
                setCompletedCrop(c);
                setDirty(true);
              }}
              // Free aspect — no `aspect` prop → corner + edge handles resize freely
              keepSelection
              ruleOfThirds
            >
              <img
                ref={editImgRef}
                src={editSrc}
                alt={alt}
                onLoad={onEditImageLoad}
                style={{ maxWidth: '100%', display: 'block' }}
              />
            </ReactCrop>
          </Box>
        ) : (
          <Box
            ref={viewportRef}
            onWheel={handleWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            sx={{
              position: 'relative',
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: zoom > 1 ? 'grab' : 'default',
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            {loading ? (
              <CircularProgress size={36} sx={{ color: 'grey.200', position: 'absolute', zIndex: 1 }} />
            ) : null}
            <Box
              component="img"
              src={src}
              alt={alt}
              draggable={false}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError(true);
              }}
              sx={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                opacity: loading ? 0 : 1,
                transition: dragRef.current ? undefined : 'opacity 120ms ease',
                pointerEvents: 'auto',
              }}
            />
            {navEnabled && (hasPrev || hasNext) ? (
              <>
                <IconButton
                  aria-label="Previous photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrev?.();
                  }}
                  disabled={!hasPrev}
                  sx={{
                    position: 'absolute',
                    left: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 2,
                    bgcolor: 'rgba(15,23,42,0.55)',
                    color: 'grey.100',
                    '&:hover': { bgcolor: 'rgba(15,23,42,0.8)' },
                    '&.Mui-disabled': { color: 'grey.600', bgcolor: 'rgba(15,23,42,0.25)' },
                  }}
                >
                  <ChevronLeft fontSize="large" />
                </IconButton>
                <IconButton
                  aria-label="Next photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNext?.();
                  }}
                  disabled={!hasNext}
                  sx={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 2,
                    bgcolor: 'rgba(15,23,42,0.55)',
                    color: 'grey.100',
                    '&:hover': { bgcolor: 'rgba(15,23,42,0.8)' },
                    '&.Mui-disabled': { color: 'grey.600', bgcolor: 'rgba(15,23,42,0.25)' },
                  }}
                >
                  <ChevronRight fontSize="large" />
                </IconButton>
              </>
            ) : null}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, flexShrink: 0, gap: 1 }}>
        <Button
          startIcon={<Download />}
          onClick={() => void handleDownload()}
          disabled={downloading || replacing || !src}
        >
          {downloading ? 'Downloading…' : downloadLabel}
        </Button>
        {!editMode && replaceable ? (
          <>
            <Button
              startIcon={<UploadFile />}
              onClick={() => replaceInputRef.current?.click()}
              disabled={replacing || saving || !src}
            >
              {replacing ? 'Replacing…' : 'Replace'}
            </Button>
            <input
              ref={replaceInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(ev) => void handleReplacePick(ev)}
            />
          </>
        ) : null}
        <Box sx={{ flex: 1 }} />
        {editMode ? (
          <Stack direction="row" spacing={1}>
            <Button onClick={exitEdit} disabled={saving || rotating}>
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={saving || rotating || !dirty || !completedCrop || !onSaveEdited}
              onClick={() => void handleSaveEdited()}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </Stack>
        ) : (
          <Button onClick={onClose} variant="contained" disabled={replacing}>
            Close
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
