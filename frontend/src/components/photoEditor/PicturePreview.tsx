/** The edited picture, fitted in the picture area (Dash #209); see-through parts show on a checkerboard. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';

export const CHECKER = 'conic-gradient(#d9d9d9 25%, #fff 0 50%, #d9d9d9 0 75%, #fff 0) 0 0 / 16px 16px';
export const PICTURE_PAD = 16;

export function PicturePreview({ view, tick, clear }: { view: HTMLCanvasElement | null; tick: number; clear: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [area, setArea] = useState<[number, number]>([0, 0]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setArea((old) => (old[0] === r.width && old[1] === r.height ? old : [r.width, r.height]));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !view) return;
    if (c.width !== view.width || c.height !== view.height) {
      c.width = view.width;
      c.height = view.height;
    }
    const ctx = c.getContext('2d');
    ctx?.clearRect(0, 0, c.width, c.height);
    ctx?.drawImage(view, 0, 0);
  }, [view, tick]);

  const vw = view?.width ?? 1;
  const vh = view?.height ?? 1;
  const k = Math.min((area[0] - 2 * PICTURE_PAD) / vw, (area[1] - 2 * PICTURE_PAD) / vh);
  const w = Math.max(1, vw * k);
  const h = Math.max(1, vh * k);
  return (
    <Box ref={boxRef} sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{ width: w, height: h, display: view && k > 0 ? 'block' : 'none', background: clear ? CHECKER : undefined, borderRadius: 4 }}
      />
    </Box>
  );
}
