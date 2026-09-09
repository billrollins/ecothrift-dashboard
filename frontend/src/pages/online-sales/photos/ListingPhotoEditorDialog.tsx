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
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import RotateLeft from '@mui/icons-material/RotateLeft';
import RotateRight from '@mui/icons-material/RotateRight';
import ReactCrop, { type Crop as CropState } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useSnackbar } from 'notistack';
import type { ListingImageCrops, WebListingImage } from '../../../api/webstore.api';
import { listingImageFullUrl } from '../../../api/webstore.api';
import {
  useReframeWebListingImage,
  useUploadWebListingImage,
} from '../../../hooks/useWebStore';
import {
  WHOLE_PCT,
  getEditedJpeg,
  getRotatedJpeg,
  pctToApiCrop,
  rebaseToTrim,
  rectFits,
  storedCropToPct,
  type PctRect,
} from '../../../utils/imageEdit';

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

const SLOT_ASPECT: Record<SlotId, number | undefined> = {
  full: undefined,
  main: 4 / 3,
  grid: 4 / 3,
  thumb: 1,
};

const SLOT_CAPTION: Record<SlotId, string> = {
  full: 'Gallery photo (any aspect). This is what people see when they click the listing photo.',
  main: 'Main photo on the listing: 1600 × 1200. Defaults to the whole picture.',
  grid: 'Shop grid: 800 × 600. Defaults to the whole picture.',
  thumb: 'Thumbnail: 400 × 400. Defaults to the whole picture.',
};

function toCropState(rect: PctRect): CropState {
  return { unit: '%', x: rect.x, y: rect.y, width: rect.w, height: rect.h };
}

function fromCropState(crop: CropState): PctRect {
  return { x: crop.x, y: crop.y, w: crop.width, h: crop.height };
}

function deriveRects(draft: CropDraft, imageAspect: number): Record<SlotId, PctRect> {
  const full = draft.touched.full && draft.custom.full ? draft.custom.full : WHOLE_PCT;
  const main =
    draft.touched.main && draft.custom.main
      ? draft.custom.main
      : { ...full };
  const grid = draft.touched.grid && draft.custom.grid ? draft.custom.grid : { ...main };
  const thumb =
    draft.touched.thumb && draft.custom.thumb
      ? draft.custom.thumb
      : { ...main };
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

function seedFromReframe(image: WebListingImage, width: number, height: number): CropDraft {
  const custom: Partial<Record<SlotId, PctRect>> = {};
  const touched = { ...EMPTY_TOUCHED };
  const crops = image.crops;
  if (crops?.main && !crops.main.derived) {
    custom.main = storedCropToPct(crops.main, width, height);
    touched.main = true;
  }
  if (crops?.grid && !crops.grid.derived) {
    custom.grid = storedCropToPct(crops.grid, width, height);
    touched.grid = true;
  }
  if (crops?.thumb && !crops.thumb.derived) {
    custom.thumb = storedCropToPct(crops.thumb, width, height);
    touched.thumb = true;
  }
  return { custom, touched };
}

function FramePreview({
  src,
  crop,
  within: _within,
  aspect,
  filter,
  label,
  selected,
  onClick,
}: {
  src: string;
  crop: PctRect;
  within?: PctRect;
  aspect: string;
  filter?: string;
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const windowRect = crop;
  const width = windowRect.w || 100;
  const height = windowRect.h || 100;
  const x = windowRect.x || 0;
  const y = windowRect.y || 0;
  void _within;
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
            aspectRatio: aspect,
            overflow: 'hidden',
            borderRadius: 0.5,
            bgcolor: '#0f172a',
            position: 'relative',
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
  reframe: WebListingImage | null;
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const uploadImage = useUploadWebListingImage();
  const reframeImage = useReframeWebListingImage();

  const isReframe = Boolean(reframe);
  const total = isReframe ? 1 : files.length;

  const [index, setIndex] = useState(0);
  const [slot, setSlot] = useState<SlotId>('main');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [editObjectUrl, setEditObjectUrl] = useState<string | null>(null);
  const editObjectUrlRef = useRef<string | null>(null);
  const [draft, setDraft] = useState<CropDraft>(EMPTY_DRAFT);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [busy, setBusy] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const replaceEditUrl = (next: string | null) => {
    if (editObjectUrlRef.current) URL.revokeObjectURL(editObjectUrlRef.current);
    editObjectUrlRef.current = next;
    setEditObjectUrl(next);
  };

  useEffect(() => {
    return () => {
      if (editObjectUrlRef.current) URL.revokeObjectURL(editObjectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      replaceEditUrl(null);
      return;
    }
    setIndex(0);
    setDoneCount(0);
    setSlot('main');
    setBrightness(100);
    setContrast(100);
    setNaturalSize(null);
    replaceEditUrl(null);
    if (reframe && reframe.width && reframe.height) {
      setNaturalSize({ w: reframe.width, h: reframe.height });
      setDraft(seedFromReframe(reframe, reframe.width, reframe.height));
    } else {
      setDraft(EMPTY_DRAFT);
    }
  }, [open, files, reframe]);

  useEffect(() => {
    if (!open || isReframe) {
      setFileUrl(null);
      return;
    }
    const file = files[index];
    if (!file) {
      setFileUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    replaceEditUrl(null);
    setBrightness(100);
    setContrast(100);
    setSlot('main');
    setDraft(EMPTY_DRAFT);
    setNaturalSize(null);
    return () => URL.revokeObjectURL(url);
  }, [open, isReframe, files, index]);

  const src = isReframe
    ? reframe
      ? listingImageFullUrl(reframe)
      : null
    : editObjectUrl || fileUrl;
  const cssFilter = `brightness(${brightness}%) contrast(${contrast}%)`;
  const imageAspect = naturalSize && naturalSize.h > 0 ? naturalSize.w / naturalSize.h : 4 / 3;
  const rects = useMemo(() => deriveRects(draft, imageAspect), [draft, imageAspect]);
  const imageReady = Boolean(src && naturalSize);

  const onImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setNaturalSize({ w: naturalWidth, h: naturalHeight });
    if (isReframe && reframe && !draft.touched.main && !draft.touched.grid && !draft.touched.thumb) {
      setDraft(seedFromReframe(reframe, naturalWidth, naturalHeight));
    }
  };

  const bakeRotate = async (degrees: number) => {
    if (!src || isReframe) return;
    setRotating(true);
    try {
      const blob = await getRotatedJpeg(src, degrees);
      replaceEditUrl(URL.createObjectURL(blob));
      setDraft(EMPTY_DRAFT);
      setNaturalSize(null);
      setSlot('main');
    } finally {
      setRotating(false);
    }
  };

  const advanceOrClose = (fromIndex: number) => {
    const next = fromIndex + 1;
    setDoneCount((n) => n + 1);
    if (isReframe || next >= files.length) {
      onClose();
      return;
    }
    setIndex(next);
  };

  const buildUploadCrops = (full: PctRect, trimW: number, trimH: number): ListingImageCrops | undefined => {
    const crops: ListingImageCrops = {};
    if (draft.touched.main) {
      crops.main = pctToApiCrop(rebaseToTrim(rects.main, full), trimW, trimH);
    }
    if (draft.touched.grid) {
      crops.grid = pctToApiCrop(rebaseToTrim(rects.grid, full), trimW, trimH);
    }
    if (draft.touched.thumb) {
      crops.thumb = pctToApiCrop(rebaseToTrim(rects.thumb, full), trimW, trimH);
    }
    return Object.keys(crops).length ? crops : undefined;
  };

  const buildReframeCrops = (): ListingImageCrops | undefined => {
    if (!naturalSize) return undefined;
    const crops: ListingImageCrops = {};
    if (draft.touched.main) crops.main = pctToApiCrop(rects.main, naturalSize.w, naturalSize.h);
    if (draft.touched.grid) crops.grid = pctToApiCrop(rects.grid, naturalSize.w, naturalSize.h);
    if (draft.touched.thumb) crops.thumb = pctToApiCrop(rects.thumb, naturalSize.w, naturalSize.h);
    return Object.keys(crops).length ? crops : undefined;
  };

  const applyCurrent = async () => {
    if (!src || !naturalSize) return;
    setBusy(true);
    try {
      if (isReframe && reframe) {
        const crops = buildReframeCrops();
        if (!crops) {
          onClose();
          return;
        }
        await reframeImage.mutateAsync({ listingId, imageId: reframe.id, crops });
        enqueueSnackbar('Frame saved', { variant: 'success' });
        onClose();
        return;
      }
      const fullNatural = {
        x: (rects.full.x / 100) * naturalSize.w,
        y: (rects.full.y / 100) * naturalSize.h,
        width: (rects.full.w / 100) * naturalSize.w,
        height: (rects.full.h / 100) * naturalSize.h,
      };
      const blob = await getEditedJpeg(src, {
        crop: fullNatural,
        adjustments: { brightness, contrast },
      });
      const crops = buildUploadCrops(rects.full, fullNatural.width, fullNatural.height);
      await uploadImage.mutateAsync({ id: listingId, file: blob, crops });
      enqueueSnackbar('Photo uploaded', { variant: 'success' });
      advanceOrClose(index);
    } catch {
      enqueueSnackbar(isReframe ? 'Could not save frame' : 'Upload failed', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const skipCurrent = async () => {
    const file = files[index];
    if (!file) return;
    setBusy(true);
    try {
      await uploadImage.mutateAsync({ id: listingId, file });
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
        await uploadImage.mutateAsync({ id: listingId, file });
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

  const visibleSlots: SlotId[] = isReframe ? ['main', 'grid', 'thumb'] : ['full', 'main', 'grid', 'thumb'];

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={700} noWrap>
            Frame photo
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {isReframe ? 'Reframe existing photo' : `${index + 1} of ${total}`}
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} disabled={busy} edge="end">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {!isReframe ? <LinearProgress variant="determinate" value={progress} /> : null}

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
            {visibleSlots.map((id) => (
              <ToggleButton key={id} value={id}>
                {id === 'full' ? 'Full' : id === 'main' ? 'Main' : id === 'grid' ? 'Grid' : 'Thumb'}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {!isReframe ? (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <IconButton aria-label="Rotate left" onClick={() => void bakeRotate(-90)} disabled={busy || rotating}>
                <RotateLeft />
              </IconButton>
              <IconButton aria-label="Rotate right" onClick={() => void bakeRotate(90)} disabled={busy || rotating}>
                <RotateRight />
              </IconButton>
              <Box sx={{ minWidth: 160, flex: 1 }}>
                <Typography variant="caption">Brightness</Typography>
                <Slider
                  size="small"
                  min={50}
                  max={150}
                  value={brightness}
                  onChange={(_, v) => setBrightness(v as number)}
                />
              </Box>
              <Box sx={{ minWidth: 160, flex: 1 }}>
                <Typography variant="caption">Contrast</Typography>
                <Slider
                  size="small"
                  min={50}
                  max={150}
                  value={contrast}
                  onChange={(_, v) => setContrast(v as number)}
                />
              </Box>
            </Stack>
          ) : null}

          <CropBox
            src={src}
            crop={toCropState(rects[slot])}
            aspect={SLOT_ASPECT[slot]}
            filter={isReframe ? undefined : cssFilter}
            rotating={rotating}
            onLoad={onImageLoad}
            onChange={(percentCrop) => {
              setDraft((prev) => applySlotCrop(prev, slot, fromCropState(percentCrop)));
            }}
          />

          {src ? (
            <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
              {visibleSlots.map((id) => {
                const aspect = id === 'thumb' ? '1 / 1' : id === 'full' ? `${imageAspect} / 1` : '4 / 3';
                const label =
                  id === 'full'
                    ? 'Full · any aspect'
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
                      within={id === 'full' ? undefined : rects.full}
                      aspect={aspect}
                      filter={isReframe ? undefined : cssFilter}
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
                        Reset to auto
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
        {!isReframe ? (
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
          onClick={() => void applyCurrent()}
          disabled={busy || rotating || !imageReady}
        >
          {busy ? 'Saving…' : isReframe ? 'Save frame' : 'Apply and next'}
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
          maxHeight: 380,
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
