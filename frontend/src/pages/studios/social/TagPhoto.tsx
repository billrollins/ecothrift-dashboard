/**
 * Library photos as drawable images, and the live preview of one post photo with its tag overlay (tagOverlay.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { fetchSocialPhotoBlob, type PhotoSize, type SocialPhoto } from '../../../api/marketing.api';
import logoUrl from '../../../assets/logo-full-white-quartersize.png';
import { drawTagPhoto, loadImage, PHOTO_HEIGHTS, PHOTO_WIDTH } from './tagOverlay';

type PhotoRef = Pick<SocialPhoto, 'id' | 'edited_at'>;

const keyOf = (p: PhotoRef) => `${p.id}:${p.edited_at ?? ''}`;

/** Photos as drawable images, fetched once each from our own address (so the canvas can export). An edited photo
 * is fetched again (its `edited_at` is part of the key). */
export function usePhotoImages(photos: PhotoRef[]): Map<number, HTMLImageElement> {
  const cache = useRef(new Map<string, { img: HTMLImageElement; url: string }>());
  const [version, setVersion] = useState(0);
  const key = photos.map(keyOf).join(',');
  useEffect(() => {
    let alive = true;
    photos.filter((p) => !cache.current.has(keyOf(p))).forEach((p) => {
      fetchSocialPhotoBlob(p.id, p.edited_at)
        .then(async (blob) => {
          const url = URL.createObjectURL(blob);
          const img = await loadImage(url);
          cache.current.set(keyOf(p), { img, url });
          if (alive) setVersion((v) => v + 1);
        })
        .catch(() => { /* the preview stays blank; the editor still works */ });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => {
    cache.current.forEach(({ url }) => URL.revokeObjectURL(url));
  }, []);
  return useMemo(() => {
    const out = new Map<number, HTMLImageElement>();
    photos.forEach((p) => {
      const hit = cache.current.get(keyOf(p));
      if (hit) out.set(p.id, hit.img);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, key]);
}

let logoPromise: Promise<HTMLImageElement | null> | null = null;
export function loadLogo(): Promise<HTMLImageElement | null> {
  if (!logoPromise) logoPromise = loadImage(logoUrl).catch(() => null);
  return logoPromise;
}

let fontsPromise: Promise<unknown> | null = null;
export function loadTagFonts(): Promise<unknown> {
  if (!fontsPromise) {
    fontsPromise = typeof document !== 'undefined' && document.fonts
      ? Promise.all(['800 92px Inter', '600 28px Inter', '800 24px Inter'].map((f) => document.fonts.load(f))).catch(() => null)
      : Promise.resolve(null);
  }
  return fontsPromise;
}

/** The logo and fonts, ready for drawing. */
export function useTagAssets(): { logo: HTMLImageElement | null; ready: boolean } {
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([loadLogo(), loadTagFonts()]).then(([img]) => {
      if (!alive) return;
      setLogo(img);
      setReady(true);
    });
    return () => { alive = false; };
  }, []);
  return { logo, ready };
}

/** One post photo as it goes out: the photo at the post's size, the store mark, and the tag on a product photo. */
export function TagPhoto({
  photo,
  image,
  size,
  overlay,
  corner,
}: {
  photo: SocialPhoto;
  image: HTMLImageElement | null;
  size: PhotoSize;
  /** Override the photo's own setting (the editor's live switch). */
  overlay?: boolean;
  corner?: SocialPhoto['tag_corner'];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { logo, ready } = useTagAssets();
  const height = PHOTO_HEIGHTS[size];
  const on = overlay ?? photo.tag_overlay;
  const at = corner ?? photo.tag_corner;
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    drawTagPhoto(ctx, { size, photo: image, tag: photo.tag, overlay: on, corner: at, logo });
  }, [size, image, photo.tag, on, at, logo, ready]);
  return (
    <Box sx={{ width: '100%' }}>
      {/* A plain canvas: on a Box, width and height would become CSS, not the drawing size. */}
      <canvas
        ref={canvas}
        width={PHOTO_WIDTH}
        height={height}
        role="img"
        aria-label={photo.tag ? `Photo of ${photo.tag.title} with its tag` : 'Photo'}
        style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: `${PHOTO_WIDTH} / ${height}`, borderRadius: 10, background: '#eef3ef' }}
      />
    </Box>
  );
}
