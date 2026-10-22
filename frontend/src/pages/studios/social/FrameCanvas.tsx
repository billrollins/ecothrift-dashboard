import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import type { SocialLayout } from '../../../api/marketing.api';
import { fetchSocialPhotoBlob } from '../../../api/marketing.api';
import logoUrl from '../../../assets/logo-full-white-quartersize.png';
import {
  drawFrame,
  FRAME_HEIGHTS,
  FRAME_WIDTH,
  frameGeometry,
  loadImage,
  zoneAt,
  type FrameSize,
} from './socialFrame';

/** Library photos as drawable images, fetched once from our own address (so the canvas can export). */
export function usePhotoImages(ids: number[]): Map<number, HTMLImageElement> {
  const cache = useRef(new Map<number, { img: HTMLImageElement; url: string }>());
  const [version, setVersion] = useState(0);
  const key = ids.join(',');
  useEffect(() => {
    let alive = true;
    ids.filter((id) => !cache.current.has(id)).forEach((id) => {
      fetchSocialPhotoBlob(id)
        .then(async (blob) => {
          const url = URL.createObjectURL(blob);
          const img = await loadImage(url);
          cache.current.set(id, { img, url });
          if (alive) setVersion((v) => v + 1);
        })
        .catch(() => { /* the zone stays empty; the editor still works */ });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => {
    cache.current.forEach(({ url }) => URL.revokeObjectURL(url));
  }, []);
  return useMemo(() => {
    const out = new Map<number, HTMLImageElement>();
    cache.current.forEach(({ img }, id) => out.set(id, img));
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
export function loadFrameFonts(): Promise<unknown> {
  if (!fontsPromise) {
    fontsPromise = typeof document !== 'undefined' && document.fonts
      ? Promise.all(['800 80px Inter', '700 28px Inter', '600 26px Inter', '500 23px Inter'].map((f) => document.fonts.load(f))).catch(() => null)
      : Promise.resolve(null);
  }
  return fontsPromise;
}

/**
 * The live frame. Tap (or click) a zone to fill it; drop a library photo on a zone to put it there.
 * Drawn at 1080 px wide and shown scaled to fit, as tall as the screen allows on a desk.
 */
export function FrameCanvas({
  layout,
  size,
  hook,
  address,
  hours,
  photoIds,
  activeZone,
  onZone,
  onDropPhoto,
  maxHeight,
}: {
  layout: SocialLayout;
  size: FrameSize;
  hook: string;
  address: string;
  hours: string;
  photoIds: number[];
  activeZone?: number;
  onZone?: (zone: number) => void;
  onDropPhoto?: (zone: number, photoId: number) => void;
  /** CSS max height (desk: the viewport less the header). */
  maxHeight?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const images = usePhotoImages(photoIds);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [hover, setHover] = useState(-1);
  const height = FRAME_HEIGHTS[size];

  useEffect(() => {
    loadLogo().then(setLogo);
    loadFrameFonts().then(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    drawFrame(ctx, {
      layout,
      size,
      hook: hook || 'Your hook line goes here',
      address,
      hours,
      logo,
      photos: photoIds.map((id) => images.get(id) ?? null),
      activeZone: hover >= 0 ? hover : activeZone,
    });
  }, [layout, size, hook, address, hours, logo, images, photoIds, activeZone, hover, fontsReady]);

  const zoneFromEvent = (clientX: number, clientY: number) => {
    const el = canvas.current;
    if (!el) return -1;
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * FRAME_WIDTH;
    const py = ((clientY - rect.top) / rect.height) * height;
    return zoneAt(frameGeometry(layout, size), px, py);
  };

  const fitWidth = maxHeight ? `min(100%, calc(${maxHeight} * ${FRAME_WIDTH / height}))` : '100%';
  return (
    <Box sx={{ width: fitWidth, mx: 'auto' }}>
      {/* A plain canvas: on a Box, width and height would become CSS, not the drawing size. */}
      <canvas
        ref={canvas}
        width={FRAME_WIDTH}
        height={height}
        role="img"
        aria-label="Post preview. Tap a photo spot to fill it."
        onClick={(e) => {
          const zone = zoneFromEvent(e.clientX, e.clientY);
          if (zone >= 0) onZone?.(zone);
        }}
        onDragOver={(e) => {
          if (!onDropPhoto) return;
          e.preventDefault();
          setHover(zoneFromEvent(e.clientX, e.clientY));
        }}
        onDragLeave={() => setHover(-1)}
        onDrop={(e) => {
          e.preventDefault();
          setHover(-1);
          const id = Number(e.dataTransfer.getData('text/x-social-photo'));
          const zone = zoneFromEvent(e.clientX, e.clientY);
          if (id && zone >= 0) onDropPhoto?.(zone, id);
        }}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          aspectRatio: `${FRAME_WIDTH} / ${height}`,
          borderRadius: 12,
          boxShadow: '0 6px 24px rgba(16,24,32,.12)',
          cursor: onZone ? 'pointer' : 'default',
          background: '#fff',
        }}
      />
    </Box>
  );
}
