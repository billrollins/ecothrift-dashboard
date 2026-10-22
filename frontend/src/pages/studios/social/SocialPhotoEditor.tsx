/**
 * Edit one library photo (owner 2026-10-22: the standard photo editing from Online Sales): crop (to the post's size or
 * free), rotate, brightness and contrast, with the same tools as the listing photo editor (`utils/imageEdit`). Saving
 * replaces the photo for every post that uses it. A photo of an item also gets its tag overlay switch and corner, with
 * a live look at the photo as it goes out.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Slider,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import RotateLeft from '@mui/icons-material/RotateLeft';
import RotateRight from '@mui/icons-material/RotateRight';
import ReactCrop, { type Crop as CropState } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useSnackbar } from 'notistack';
import {
  fetchSocialPhotoBlob,
  lookupSocialTag,
  patchSocialPhoto,
  replaceSocialPhotoImage,
  type SocialPhoto,
  type SocialSize,
  type SocialTag,
  type TagCorner,
} from '../../../api/marketing.api';
import { ccTokens } from '../../../theme';
import { getEditedJpeg, getRotatedJpeg } from '../../../utils/imageEdit';
import { TagPhoto } from './TagPhoto';
import { CORNER_LABELS, loadImage } from './tagOverlay';

type Aspect = 'post' | 'free';
const WHOLE: CropState = { unit: '%', x: 0, y: 0, width: 100, height: 100 };

/** The biggest centred crop of `aspect` (width / height) in an image of `imageAspect`, in percent. */
export function centredCrop(aspect: number, imageAspect: number): CropState {
  if (imageAspect > aspect) {
    const width = (aspect / imageAspect) * 100;
    return { unit: '%', x: (100 - width) / 2, y: 0, width, height: 100 };
  }
  const height = (imageAspect / aspect) * 100;
  return { unit: '%', x: 0, y: (100 - height) / 2, width: 100, height };
}

const isWhole = (c: CropState) => c.x <= 0.05 && c.y <= 0.05 && c.width >= 99.9 && c.height >= 99.9;

export default function SocialPhotoEditor({
  photo,
  size,
  onClose,
  onSaved,
}: {
  photo: SocialPhoto;
  /** The post's size: the crop's default shape and the preview. */
  size: SocialSize;
  onClose: () => void;
  onSaved: (photo: SocialPhoto) => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const { enqueueSnackbar } = useSnackbar();
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [rotated, setRotated] = useState(false);
  const [aspect, setAspect] = useState<Aspect>('free');
  const [crop, setCrop] = useState<CropState>(WHOLE);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [overlay, setOverlay] = useState(photo.tag_overlay);
  const [corner, setCorner] = useState<TagCorner>(photo.tag_corner);
  const [busy, setBusy] = useState(false);
  const urls = useRef<string[]>([]);
  const [preview, setPreview] = useState<HTMLImageElement | null>(null);
  // A photo from the library list has no tag facts with it: look its tag up.
  const [tag, setTag] = useState<SocialTag | null | undefined>(photo.tag);
  useEffect(() => {
    if (photo.tag !== undefined) return;
    if (!photo.sku) { setTag(null); return; }
    let alive = true;
    lookupSocialTag(photo.sku)
      .then((res) => { if (alive) setTag(res.status === 'found' ? res.item : null); })
      .catch(() => { if (alive) setTag(null); });
    return () => { alive = false; };
  }, [photo.tag, photo.sku]);
  const shown = { ...photo, tag };

  const ratio = size === '1:1' ? 1 : 4 / 5;
  const showBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    setSrc(url);
    return url;
  };

  useEffect(() => {
    let alive = true;
    fetchSocialPhotoBlob(photo.id, photo.edited_at)
      .then((blob) => { if (alive) showBlob(blob); })
      .catch(() => enqueueSnackbar('Could not open the photo.', { variant: 'error' }));
    return () => {
      alive = false;
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.id]);

  useEffect(() => {
    if (!src) return;
    let alive = true;
    loadImage(src).then((img) => {
      if (!alive) return;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setPreview(img);
      setCrop(aspect === 'post' ? centredCrop(ratio, img.naturalWidth / img.naturalHeight) : WHOLE);
    }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const pickAspect = (next: Aspect | null) => {
    if (!next) return;
    setAspect(next);
    if (natural) setCrop(next === 'post' ? centredCrop(ratio, natural.w / natural.h) : WHOLE);
  };

  const rotate = async (turn: number) => {
    if (!src) return;
    setBusy(true);
    try {
      showBlob(await getRotatedJpeg(src, turn));
      setRotated(true);
    } catch {
      enqueueSnackbar('Could not turn the photo.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const imageChanged = rotated || !isWhole(crop) || brightness !== 100 || contrast !== 100;
  const tagChanged = overlay !== photo.tag_overlay || corner !== photo.tag_corner;

  const save = async () => {
    if (!src || !natural) return;
    setBusy(true);
    try {
      let saved = photo;
      if (imageChanged) {
        const blob = await getEditedJpeg(src, {
          crop: {
            x: (crop.x / 100) * natural.w,
            y: (crop.y / 100) * natural.h,
            width: (crop.width / 100) * natural.w,
            height: (crop.height / 100) * natural.h,
          },
          adjustments: { brightness, contrast },
        });
        saved = await replaceSocialPhotoImage(photo.id, blob);
      }
      if (tagChanged && tag) saved = await patchSocialPhoto(photo.id, { tag_overlay: overlay, tag_corner: corner });
      enqueueSnackbar('Photo saved', { variant: 'success' });
      onSaved(saved);
    } catch {
      enqueueSnackbar('Could not save the photo.', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const filter = `brightness(${brightness}%) contrast(${contrast}%)`;

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={phone} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>Edit photo{tag ? ` · ${tag.title}` : ''}</Box>
        <IconButton aria-label="Close" onClick={onClose} disabled={busy}><CloseRounded /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.4fr) minmax(300px, 1fr)' }, gap: 2, alignItems: 'start' }}>
          <Box sx={{ minWidth: 0 }}>
            {src ? (
              <Box sx={{ bgcolor: '#1d2420', borderRadius: '10px', p: 1, display: 'flex', justifyContent: 'center' }}>
                <ReactCrop
                  crop={crop}
                  aspect={aspect === 'post' ? ratio : undefined}
                  keepSelection
                  onChange={(_px, pct) => setCrop(pct)}
                >
                  <Box
                    component="img"
                    src={src}
                    alt=""
                    sx={{ display: 'block', maxWidth: '100%', maxHeight: { xs: '52vh', md: '64vh' }, filter }}
                  />
                </ReactCrop>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            )}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mt: 1.25 }}>
              <ToggleButtonGroup exclusive size="small" value={aspect} onChange={(_e, v: Aspect | null) => pickAspect(v)}>
                <ToggleButton value="post" sx={{ textTransform: 'none' }}>Post size {size}</ToggleButton>
                <ToggleButton value="free" sx={{ textTransform: 'none' }}>Free</ToggleButton>
              </ToggleButtonGroup>
              <IconButton aria-label="Turn left" onClick={() => rotate(-90)} disabled={busy || !src}><RotateLeft /></IconButton>
              <IconButton aria-label="Turn right" onClick={() => rotate(90)} disabled={busy || !src}><RotateRight /></IconButton>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 3, mt: 1 }}>
              <Box>
                <Typography sx={{ fontSize: 13, color: ccTokens.ink2 }}>Brightness</Typography>
                <Slider size="small" min={50} max={160} value={brightness} onChange={(_e, v) => setBrightness(v as number)} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: 13, color: ccTokens.ink2 }}>Contrast</Typography>
                <Slider size="small" min={50} max={160} value={contrast} onChange={(_e, v) => setContrast(v as number)} />
              </Box>
            </Box>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, mb: 0.75 }}>As it goes out</Typography>
            <Box sx={{ maxWidth: 360, mx: { xs: 'auto', md: 0 } }}>
              <TagPhoto photo={shown} image={preview} size={size} overlay={overlay} corner={corner} />
            </Box>
            {imageChanged ? (
              <Typography sx={{ fontSize: 12.5, color: ccTokens.ink3, mt: 0.5 }}>The crop and light show here after you save.</Typography>
            ) : null}
            {tag ? (
              <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <FormControlLabel
                  control={<Switch checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />}
                  label="Show the tag on this photo"
                />
                <TextField select size="small" label="Tag corner" value={corner} disabled={!overlay} onChange={(e) => setCorner(e.target.value as TagCorner)} sx={{ maxWidth: 240 }}>
                  {(Object.keys(CORNER_LABELS) as TagCorner[]).map((c) => <MenuItem key={c} value={c}>{CORNER_LABELS[c]}</MenuItem>)}
                </TextField>
                {!tag.available ? (
                  <Typography sx={{ fontSize: 13, color: ccTokens.badText }}>This item is sold or off the floor.</Typography>
                ) : null}
              </Box>
            ) : (
              <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mt: 1.5 }}>
                {tag === undefined ? 'Looking up the tag…' : 'No item on this photo, so no tag. Add its tag number in the photo\'s details.'}
              </Typography>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={busy || !src || (!imageChanged && !tagChanged)}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
