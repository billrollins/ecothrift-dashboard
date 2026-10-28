/**
 * The listing photo editor (Bill, 2026-10-28). Nothing is burned into a photo: the upload is kept as its original
 * and the editor's turn, crop, brightness and contrast are saved beside it, so clicking a photo reopens it here from
 * the original with every edit still undoable. The shop's photo is built from the two on the server.
 *
 * Crop opens on Full (any shape). Main and Grid are 4:3 and Thumb is square: an untouched one starts as the biggest
 * box of its shape in the middle of the photo, and keeps "auto" (the whole picture) until the box is moved.
 */
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import RotateLeft from '@mui/icons-material/RotateLeft';
import RotateRight from '@mui/icons-material/RotateRight';
import ReactCrop, { type Crop as CropState } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useSnackbar } from 'notistack';
import type { ListingImageCrops, ListingPhotoEdits, WebListingImage } from '../../../api/webstore.api';
import { getWebListingImageOriginal } from '../../../api/webstore.api';
import {
  useEditWebListingImage,
  useUploadWebListingImage,
} from '../../../hooks/useWebStore';
import {
  WHOLE_PCT,
  centerAspectPct,
  getRotatedJpeg,
  rebaseToTrim,
  rectFits,
  storedCropToPct,
  type PctRect,
} from '../../../utils/imageEdit';
import { IconClose as Close } from '../../../icons/ecoIcons';

type SlotId = 'full' | 'main' | 'grid' | 'thumb';

type CropDraft = {
  custom: Partial<Record<SlotId, PctRect>>;
  touched: Record<SlotId, boolean>;
};

const EMPTY_TOUCHED: Record<SlotId, boolean> = {
  full: false,
  main: false,
  grid: false,
  thumb: false,
};

const EMPTY_DRAFT: CropDraft = { custom: {}, touched: { ...EMPTY_TOUCHED } };

const SLOTS: SlotId[] = ['full', 'main', 'grid', 'thumb'];

const SLOT_ASPECT: Record<SlotId, number | undefined> = {
  full: undefined,
  main: 4 / 3,
  grid: 4 / 3,
  thumb: 1,
};

const SLOT_CAPTION: Record<SlotId, string> = {
  full: 'Crop the photo (any shape). This is what people see when they click the listing photo.',
  main: 'Main photo on the listing: 1600 × 1200 (4:3). Auto shows the whole picture; move the box to frame it.',
  grid: 'Shop grid: 800 × 600 (4:3). Auto follows Main.',
  thumb: 'Thumbnail: 400 × 400 (square). Auto shows the whole picture.',
};

const ROUND = (n: number) => Math.round(n * 1000) / 1000;

function toCropState(rect: PctRect): CropState {
  return { unit: '%', x: rect.x, y: rect.y, width: rect.w, height: rect.h };
}

function fromCropState(crop: CropState): PctRect {
  return { x: crop.x, y: crop.y, w: crop.width, h: crop.height };
}

function roundRect(rect: PctRect): PctRect {
  return { x: ROUND(rect.x), y: ROUND(rect.y), w: ROUND(rect.w), h: ROUND(rect.h) };
}

/** The inverse of `rebaseToTrim`: a rect in percent of the Full trim, back to percent of the turned photo. */
function fromTrim(rect: PctRect, full: PctRect): PctRect {
  return {
    x: full.x + (rect.x * full.w) / 100,
    y: full.y + (rect.y * full.h) / 100,
    w: (rect.w * full.w) / 100,
    h: (rect.h * full.h) / 100,
  };
}

/** What each slot shows, the way the server derives the untouched ones (services/listing_photos.py). */
function deriveRects(draft: CropDraft, imageAspect: number): Record<SlotId, PctRect> {
  const full = draft.touched.full && draft.custom.full ? draft.custom.full : WHOLE_PCT;
  const mainSet = draft.touched.main && draft.custom.main;
  const main = mainSet ? draft.custom.main! : { ...full };
  const grid = draft.touched.grid && draft.custom.grid ? draft.custom.grid : { ...main };
  const thumb = draft.touched.thumb && draft.custom.thumb
    ? draft.custom.thumb
    : mainSet ? centerAspectPct(main, 1, imageAspect) : { ...main };
  return { full, main, grid, thumb };
}

function applySlotCrop(draft: CropDraft, slot: SlotId, next: PctRect): CropDraft {
  const custom = { ...draft.custom, [slot]: next };
  const touched = { ...draft.touched, [slot]: true };
  if (slot === 'full') {
    (['main', 'grid', 'thumb'] as const).forEach((s) => {
      if (touched[s] && custom[s] && !rectFits(custom[s], next)) {
        touched[s] = false;
        delete custom[s];
      }
    });
  }
  return { custom, touched };
}

/** An existing photo's saved crop and hand-set frames, as the editor's draft (percent of the turned original). */
function seedFromImage(image: WebListingImage): CropDraft {
  const custom: Partial<Record<SlotId, PctRect>> = {};
  const touched = { ...EMPTY_TOUCHED };
  const crop = image.edits?.crop;
  const full = crop ? { x: crop.x, y: crop.y, w: crop.w, h: crop.h } : WHOLE_PCT;
  if (crop) {
    custom.full = full;
    touched.full = true;
  }
  const width = image.width ?? 0;
  const height = image.height ?? 0;
  (['main', 'grid', 'thumb'] as const).forEach((slot) => {
    const stored = image.crops?.[slot];
    if (stored && !stored.derived && width > 0 && height > 0) {
      custom[slot] = fromTrim(storedCropToPct(stored, width, height), full);
      touched[slot] = true;
    }
  });
  return { custom, touched };
}

function FramePreview({
  src,
  crop,
  aspect,
  letterbox,
  filter,
  label,
  selected,
  onClick,
}: {
  src: string;
  crop: PctRect;
  aspect: number;
  /** Auto: the shop shows the whole crop inside the slot with bars (as the server builds it), not stretched. */
  letterbox?: { cropAspect: number };
  filter?: string;
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const width = crop.w || 100;
  const height = crop.h || 100;
  const x = crop.x || 0;
  const y = crop.y || 0;
  let inner = { left: 0, top: 0, w: 100, h: 100 };
  if (letterbox && letterbox.cropAspect > 0) {
    inner = letterbox.cropAspect > aspect
      ? { left: 0, w: 100, h: (aspect / letterbox.cropAspect) * 100, top: 0 }
      : { top: 0, h: 100, w: (letterbox.cropAspect / aspect) * 100, left: 0 };
    inner.left = (100 - inner.w) / 2;
    inner.top = (100 - inner.h) / 2;
  }
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      <Box
        component={onClick ? 'button' : 'div'}
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        sx={{
          display: 'block',
          width: '100%',
          p: 0,
          border: selected ? '2px solid' : '2px solid transparent',
          borderColor: selected ? 'primary.main' : 'transparent',
          borderRadius: 1,
          cursor: onClick ? 'pointer' : 'default',
          bgcolor: 'transparent',
        }}
      >
        <Box
          sx={{
            width: '100%',
            aspectRatio: `${aspect} / 1`,
            overflow: 'hidden',
            borderRadius: 0.5,
            // The server's bar colour (SLOT_FILL) when letterboxed.
            bgcolor: letterbox ? 'rgb(238, 242, 240)' : '#0f172a',
            position: 'relative',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              left: `${inner.left}%`,
              top: `${inner.top}%`,
              width: `${inner.w}%`,
              height: `${inner.h}%`,
              overflow: 'hidden',
            }}
          >
            <Box
              component="img"
              src={src}
              alt={label}
              sx={{
                position: 'absolute',
                left: `${-(x / width) * 100}%`,
                top: `${-(y / height) * 100}%`,
                width: `${(100 / width) * 100}%`,
                height: `${(100 / height) * 100}%`,
                maxWidth: 'none',
                objectFit: 'fill',
                filter: filter || 'none',
              }}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export function ListingPhotoEditorDialog({
  open,
  listingId,
  files,
  reframe,
  onClose,
}: {
  open: boolean;
  listingId: number;
  files: File[];
  /** An existing photo to edit (opened by clicking it). */
  reframe: WebListingImage | null;
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const uploadImage = useUploadWebListingImage();
  const editImage = useEditWebListingImage();

  const isEdit = Boolean(reframe);
  const total = isEdit ? 1 : files.length;

  const [index, setIndex] = useState(0);
  const [slot, setSlot] = useState<SlotId>('full');
  // The original: the picked file, or an existing photo's original from the server.
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  // A turned copy of the original for the screen only; the turn is saved as an edit.
  const [turnedUrl, setTurnedUrl] = useState<string | null>(null);
  const turnedUrlRef = useRef<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [draft, setDraft] = useState<CropDraft>(EMPTY_DRAFT);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [busy, setBusy] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const replaceTurnedUrl = (next: string | null) => {
    if (turnedUrlRef.current) URL.revokeObjectURL(turnedUrlRef.current);
    turnedUrlRef.current = next;
    setTurnedUrl(next);
  };

  useEffect(() => {
    return () => {
      if (turnedUrlRef.current) URL.revokeObjectURL(turnedUrlRef.current);
    };
  }, []);

  const resetEdits = () => {
    replaceTurnedUrl(null);
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setSlot('full');
    setDraft(EMPTY_DRAFT);
    setNaturalSize(null);
  };

  useEffect(() => {
    if (!open) {
      replaceTurnedUrl(null);
      return;
    }
    setIndex(0);
    setDoneCount(0);
    resetEdits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, files, reframe]);

  // A new upload: the picked file is the original.
  useEffect(() => {
    if (!open || isEdit) return;
    const file = files[index];
    if (!file) {
      setBaseUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setBaseUrl(url);
    resetEdits();
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, files, index]);

  // An existing photo: start from its original and its saved edits.
  useEffect(() => {
    if (!open || !reframe) return;
    let cancelled = false;
    let url: string | null = null;
    setBaseUrl(null);
    setLoadError(false);
    const edits = reframe.edits ?? {};
    void (async () => {
      try {
        const blob = await getWebListingImageOriginal(listingId, reframe.id);
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        const turn = ((edits.rotate ?? 0) % 360 + 360) % 360;
        if (turn) replaceTurnedUrl(URL.createObjectURL(await getRotatedJpeg(url, turn)));
        if (cancelled) return;
        setRotation(turn);
        setBrightness(edits.brightness ?? 100);
        setContrast(edits.contrast ?? 100);
        setDraft(seedFromImage(reframe));
        setBaseUrl(url);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, reframe, listingId]);

  const src = turnedUrl || baseUrl;
  const cssFilter = `brightness(${brightness}%) contrast(${contrast}%)`;
  const imageAspect = naturalSize && naturalSize.h > 0 ? naturalSize.w / naturalSize.h : 4 / 3;
  const rects = useMemo(() => deriveRects(draft, imageAspect), [draft, imageAspect]);
  const imageReady = Boolean(src && naturalSize);
  const aspect = SLOT_ASPECT[slot];
  // An untouched 4:3 or square slot starts as the biggest box of its shape inside the crop, not a stretched one.
  const boxRect = aspect && !draft.touched[slot] ? centerAspectPct(rects.full, aspect, imageAspect) : rects[slot];

  const onImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setNaturalSize({ w: naturalWidth, h: naturalHeight });
  };

  const turn = async (degrees: number) => {
    if (!baseUrl) return;
    const next = (((rotation + degrees) % 360) + 360) % 360;
    setRotating(true);
    try {
      replaceTurnedUrl(next ? URL.createObjectURL(await getRotatedJpeg(baseUrl, next)) : null);
      setRotation(next);
      setDraft(EMPTY_DRAFT);
      setNaturalSize(null);
      setSlot('full');
    } finally {
      setRotating(false);
    }
  };

  // Back to the original as uploaded (saved only when Save is pressed).
  const undoAll = () => {
    if (rotation !== 0) {
      replaceTurnedUrl(null);
      setNaturalSize(null);
    }
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setDraft(EMPTY_DRAFT);
    setSlot('full');
  };

  const advanceOrClose = (fromIndex: number) => {
    const next = fromIndex + 1;
    setDoneCount((n) => n + 1);
    if (isEdit || next >= files.length) {
      onClose();
      return;
    }
    setIndex(next);
  };

  const currentEdits = (): ListingPhotoEdits => ({
    rotate: rotation,
    crop: draft.touched.full ? roundRect(rects.full) : null,
    brightness,
    contrast,
  });

  // Hand-set frames, in percent of the cropped photo (the server turns them into pixels).
  const currentCrops = (): ListingImageCrops => {
    const crops: ListingImageCrops = {};
    (['main', 'grid', 'thumb'] as const).forEach((s) => {
      if (draft.touched[s]) crops[s] = roundRect(rebaseToTrim(rects[s], rects.full));
    });
    return crops;
  };

  const saveCurrent = async () => {
    if (!src || !naturalSize) return;
    setBusy(true);
    try {
      if (isEdit && reframe) {
        await editImage.mutateAsync({ listingId, imageId: reframe.id, edits: currentEdits(), crops: currentCrops() });
        enqueueSnackbar('Photo saved', { variant: 'success' });
        onClose();
        return;
      }
      const file = files[index];
      if (!file) return;
      const crops = currentCrops();
      await uploadImage.mutateAsync({
        id: listingId,
        file,
        edits: currentEdits(),
        crops: Object.keys(crops).length ? crops : null,
      });
      enqueueSnackbar('Photo uploaded', { variant: 'success' });
      advanceOrClose(index);
    } catch {
      enqueueSnackbar(isEdit ? 'Could not save the photo' : 'Upload failed', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const skipCurrent = async () => {
    const file = files[index];
    if (!file) return;
    setBusy(true);
    try {
      await uploadImage.mutateAsync({ id: listingId, file, edits: {} });
      enqueueSnackbar('Photo uploaded', { variant: 'success' });
      advanceOrClose(index);
    } catch {
      enqueueSnackbar('Upload failed', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const applyRestAsIs = async () => {
    setBusy(true);
    try {
      for (let i = index; i < files.length; i += 1) {
        const file = files[i];
        if (!file) continue;
        await uploadImage.mutateAsync({ id: listingId, file, edits: {} });
        setDoneCount((n) => n + 1);
      }
      enqueueSnackbar('Photos uploaded', { variant: 'success' });
      onClose();
    } catch {
      enqueueSnackbar('Upload failed', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const progress = useMemo(() => {
    if (total < 1) return 0;
    return Math.min(100, Math.round((doneCount / total) * 100));
  }, [doneCount, total]);

  const edited = rotation !== 0 || brightness !== 100 || contrast !== 100 || SLOTS.some((s) => draft.touched[s]);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md" fullScreen={phone}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={700} noWrap>
            {isEdit ? 'Edit photo' : 'Frame photo'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {isEdit
              ? 'From the original upload. Every edit can be changed or undone.'
              : `${index + 1} of ${total} · the original upload is kept`}
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} disabled={busy} edge="end">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {!isEdit ? <LinearProgress variant="determinate" value={progress} /> : null}

          <Typography variant="body2" color="text.secondary">
            {SLOT_CAPTION[slot]}
          </Typography>

          <ToggleButtonGroup
            exclusive
            size="small"
            value={slot}
            onChange={(_, next: SlotId | null) => {
              if (next) setSlot(next);
            }}
            aria-label="Photo slot"
          >
            {SLOTS.map((id) => (
              <ToggleButton key={id} value={id}>
                {id === 'full' ? 'Crop' : id === 'main' ? 'Main' : id === 'grid' ? 'Grid' : 'Thumb'}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <IconButton aria-label="Rotate left" onClick={() => void turn(-90)} disabled={busy || rotating || !baseUrl}>
              <RotateLeft />
            </IconButton>
            <IconButton aria-label="Rotate right" onClick={() => void turn(90)} disabled={busy || rotating || !baseUrl}>
              <RotateRight />
            </IconButton>
            <Box sx={{ minWidth: 160, flex: 1 }}>
              <Typography variant="caption">Brightness</Typography>
              <Slider size="small" min={50} max={150} value={brightness} onChange={(_, v) => setBrightness(v as number)} />
            </Box>
            <Box sx={{ minWidth: 160, flex: 1 }}>
              <Typography variant="caption">Contrast</Typography>
              <Slider size="small" min={50} max={150} value={contrast} onChange={(_, v) => setContrast(v as number)} />
            </Box>
            {edited ? (
              <Button size="small" onClick={undoAll} disabled={busy || rotating}>
                Undo all edits
              </Button>
            ) : null}
          </Stack>

          {loadError ? (
            <Typography color="error">Could not load the original photo.</Typography>
          ) : (
            <CropBox
              src={src}
              crop={toCropState(boxRect)}
              aspect={aspect}
              filter={cssFilter}
              rotating={rotating}
              onLoad={onImageLoad}
              onChange={(percentCrop) => {
                setDraft((prev) => applySlotCrop(prev, slot, fromCropState(percentCrop)));
              }}
            />
          )}

          {src ? (
            <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
              {SLOTS.map((id) => {
                const cropAspect = (imageAspect * rects.full.w) / Math.max(rects.full.h, 0.0001);
                const previewAspect = SLOT_ASPECT[id] ?? cropAspect;
                // Auto Grid and Thumb follow a hand-set Main, so they are letterboxed only while Main is auto too.
                const auto = id !== 'full' && !draft.touched[id] && !draft.touched.main;
                const label =
                  id === 'full'
                    ? 'Crop · any shape'
                    : id === 'main'
                      ? 'Main · 1600 × 1200'
                      : id === 'grid'
                        ? 'Grid · 800 × 600'
                        : 'Thumb · 400 × 400';
                return (
                  <Box key={id} sx={{ flex: id === 'thumb' ? '0 0 22%' : '1 1 22%', minWidth: 96 }}>
                    <FramePreview
                      src={src}
                      crop={rects[id]}
                      aspect={previewAspect}
                      letterbox={auto ? { cropAspect } : undefined}
                      filter={cssFilter}
                      label={label}
                      selected={slot === id}
                      onClick={() => setSlot(id)}
                    />
                    {draft.touched[id] ? (
                      <Button
                        size="small"
                        onClick={() => {
                          setDraft((prev) => {
                            const custom = { ...prev.custom };
                            delete custom[id];
                            return { custom, touched: { ...prev.touched, [id]: false } };
                          });
                        }}
                      >
                        {id === 'full' ? 'Whole photo' : 'Reset to auto'}
                      </Button>
                    ) : null}
                  </Box>
                );
              })}
            </Stack>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5, gap: 1, flexWrap: 'wrap' }}>
        {!isEdit ? (
          <>
            <Button onClick={() => void skipCurrent()} disabled={busy || rotating}>
              Skip (upload as-is)
            </Button>
            <Button onClick={() => void applyRestAsIs()} disabled={busy || rotating}>
              Apply remaining as-is
            </Button>
          </>
        ) : (
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          onClick={() => void saveCurrent()}
          disabled={busy || rotating || !imageReady}
        >
          {busy ? 'Saving…' : isEdit ? 'Save photo' : 'Apply and next'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CropBox({
  src,
  crop,
  aspect,
  filter,
  rotating,
  onLoad,
  onChange,
}: {
  src: string | null;
  crop: CropState;
  aspect?: number;
  filter?: string;
  rotating: boolean;
  onLoad: (e: SyntheticEvent<HTMLImageElement>) => void;
  onChange: (c: CropState) => void;
}) {
  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: 240,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        bgcolor: '#0f172a',
        borderRadius: 1,
        p: 1,
        '& .ReactCrop__child-wrapper img': {
          maxHeight: { xs: 320, sm: 380 },
          maxWidth: '100%',
          filter: filter || undefined,
        },
      }}
    >
      {rotating || !src ? (
        <CircularProgress size={32} sx={{ color: 'grey.200' }} />
      ) : (
        <ReactCrop
          crop={crop}
          aspect={aspect}
          onChange={(_c, percentCrop) => onChange(percentCrop)}
          keepSelection
          ruleOfThirds
        >
          <img src={src} alt="Edit listing photo" onLoad={onLoad} />
        </ReactCrop>
      )}
    </Box>
  );
}
