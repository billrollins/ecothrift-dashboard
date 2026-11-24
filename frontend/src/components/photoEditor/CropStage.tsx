/**
 * The crop frame (Dash #209, owner's correction 2026-11-24): "the ratio crop is stationary until you hit apply".
 *
 * A ratio frame is as large as fits, centred, and does not move; the photo moves behind it: drag to move, pinch with
 * two fingers or turn the mouse wheel to zoom (desk also has a zoom slider). Zoom runs from "the whole photo fits in
 * the frame" (the gap shows the Background choice) to 5x; a ratio starts with the photo filling the frame. Free: the
 * frame's corners and edges drag too, and the photo still moves and zooms. Nothing is cropped here: the editor reads
 * `getCrop()` on Apply or Save.
 *
 * Written by hand rather than with react-easy-crop: that library always centres the frame, so Free could not drag
 * one edge while the other stays put.
 */
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, Slider } from '@mui/material';
import type { Rect } from './pixels';

export interface CropStageHandle {
  /** The crop now, in the picture's full-size pixels (it may reach past the picture). */
  getCrop: () => Rect;
}

interface View {
  /** Screen pixels per picture pixel. */
  s: number;
  /** The picture's top-left corner on screen. */
  tx: number;
  ty: number;
}

interface Props {
  view: HTMLCanvasElement | null;
  tick: number;
  /** The picture's full size: the crop's coordinates. */
  size: [number, number];
  /** Width / height of the frame; null = Free. */
  aspect: number | null;
  /** Start from this crop (the same ratio picked again). */
  initial: Rect | null;
  /** Crop to content: place this box (picture pixels) in the frame; `nonce` changes on each press. */
  fit: { box: Rect; nonce: number } | null;
  /** CSS background of a gap inside the frame (the Background choice, or a checkerboard). */
  fill: string;
  /** Desk: a zoom slider under the frame. */
  zoomSlider: boolean;
}

const PAD = 16;
const MIN_FRAME = 40;
const MAX_ZOOM = 5;
const MARGIN = 0.05;
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

function fitRect(aspect: number, aw: number, ah: number): Rect {
  let w = Math.max(1, aw - 2 * PAD);
  let h = w / aspect;
  if (h > ah - 2 * PAD) {
    h = Math.max(1, ah - 2 * PAD);
    w = h * aspect;
  }
  return { x: (aw - w) / 2, y: (ah - h) / 2, w, h };
}

function zoomRange(frame: Rect, size: [number, number]): [number, number] {
  const fitIn = Math.min(frame.w / size[0], frame.h / size[1]);
  const cover = Math.max(frame.w / size[0], frame.h / size[1]);
  return [fitIn, cover * MAX_ZOOM];
}

/** Keep the frame's centre on the photo, so the photo can never be pushed out of the frame. */
function keepOn(v: View, frame: Rect, size: [number, number]): View {
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  return { s: v.s, tx: clamp(v.tx, cx - size[0] * v.s, cx), ty: clamp(v.ty, cy - size[1] * v.s, cy) };
}

function zoomAt(v: View, k: number, px: number, py: number, frame: Rect, size: [number, number]): View {
  const [lo, hi] = zoomRange(frame, size);
  const s = clamp(v.s * k, lo, hi);
  const r = s / v.s;
  return keepOn({ s, tx: px - (px - v.tx) * r, ty: py - (py - v.ty) * r }, frame, size);
}

/** Frame and view that show `crop` exactly in a frame of its own shape (or `aspect`). */
function showCrop(crop: Rect, aspect: number | null, aw: number, ah: number) {
  const frame = fitRect(aspect ?? crop.w / crop.h, aw, ah);
  const s = frame.w / crop.w;
  return { frame, v: { s, tx: frame.x - crop.x * s, ty: frame.y - crop.y * s } };
}

export const CropStage = forwardRef<CropStageHandle, Props>(function CropStage(
  { view, tick, size, aspect, initial, fit, fill, zoomSlider },
  ref,
) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [area, setArea] = useState<[number, number]>([0, 0]);
  const [frame, setFrame] = useState<Rect | null>(null);
  const [v, setV] = useState<View | null>(null);
  const frameRef = useRef<Rect | null>(null);
  const vRef = useRef<View | null>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const sessionRef = useRef('');
  const fitDone = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const handle = useRef<{ kind: Handle; id: number } | null>(null);

  const put = (f: Rect, next: View) => {
    frameRef.current = f;
    vRef.current = next;
    setFrame(f);
    setV(next);
  };

  const cropNow = (): Rect => {
    const f = frameRef.current;
    const cur = vRef.current;
    if (!f || !cur) return { x: 0, y: 0, w: sizeRef.current[0], h: sizeRef.current[1] };
    return { x: (f.x - cur.tx) / cur.s, y: (f.y - cur.ty) / cur.s, w: f.w / cur.s, h: f.h / cur.s };
  };

  useImperativeHandle(ref, () => ({ getCrop: cropNow }), []);

  const applyFit = (box: Rect) => {
    const [aw, ah] = area;
    const m = MARGIN * Math.max(box.w, box.h);
    const want = { x: box.x - m, y: box.y - m, w: box.w + 2 * m, h: box.h + 2 * m };
    const f = frameRef.current;
    if (aspect && f) {
      const [lo, hi] = zoomRange(f, size);
      const s = clamp(Math.min(f.w / want.w, f.h / want.h), lo, hi);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      put(f, keepOn({ s, tx: f.x + f.w / 2 - cx * s, ty: f.y + f.h / 2 - cy * s }, f, size));
    } else {
      const next = showCrop(want, null, aw, ah);
      put(next.frame, next.v);
    }
  };

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

  // Lay the frame out: a new ratio or picture starts fresh; a resized screen keeps the crop as it is.
  const session = `${aspect}|${size[0]}x${size[1]}|${initial ? [initial.x, initial.y, initial.w, initial.h].join(',') : ''}`;
  useEffect(() => {
    const [aw, ah] = area;
    if (aw < 2 || ah < 2 || !size[0] || !size[1]) return;
    let next: { frame: Rect; v: View };
    if (sessionRef.current === session && frameRef.current) {
      next = showCrop(cropNow(), aspect, aw, ah);
    } else if (initial) {
      next = showCrop(initial, aspect, aw, ah);
    } else if (aspect) {
      const f = fitRect(aspect, aw, ah);
      const s = Math.max(f.w / size[0], f.h / size[1]);
      next = { frame: f, v: { s, tx: f.x + (f.w - size[0] * s) / 2, ty: f.y + (f.h - size[1] * s) / 2 } };
    } else {
      next = showCrop({ x: 0, y: 0, w: size[0], h: size[1] }, null, aw, ah);
    }
    sessionRef.current = session;
    put(next.frame, next.v);
    if (fit && fit.nonce !== fitDone.current) {
      fitDone.current = fit.nonce;
      applyFit(fit.box);
    }
  }, [area, session]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fit || fit.nonce === fitDone.current || !frameRef.current) return;
    fitDone.current = fit.nonce;
    applyFit(fit.box);
  }, [fit?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [view, tick, frame != null]); // eslint-disable-line react-hooks/exhaustive-deps

  const local = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  // Mouse wheel zooms (not the page), and iPhone pinch never zooms the page.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = frameRef.current;
      const cur = vRef.current;
      if (!f || !cur) return;
      const p = local(e);
      const next = zoomAt(cur, Math.exp(-e.deltaY * 0.0015), p.x, p.y, f, sizeRef.current);
      vRef.current = next;
      setV(next);
    };
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', stop);
    el.addEventListener('gesturechange', stop);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', stop);
      el.removeEventListener('gesturechange', stop);
    };
  }, []);

  const onDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    boxRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
  };

  const onMove = (e: ReactPointerEvent) => {
    const map = pointers.current;
    const before = map.get(e.pointerId);
    const f = frameRef.current;
    const cur = vRef.current;
    if (!before || !f || !cur) return;
    const now = local(e);
    let next: View;
    if (map.size === 1) {
      map.set(e.pointerId, now);
      next = keepOn({ s: cur.s, tx: cur.tx + now.x - before.x, ty: cur.ty + now.y - before.y }, f, size);
    } else {
      const [[idA, a0], [idB, b0]] = [...map.entries()];
      map.set(e.pointerId, now);
      const a1 = map.get(idA) ?? a0;
      const b1 = map.get(idB) ?? b0;
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
      const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
      const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
      const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
      const zoomed = zoomAt(cur, d0 > 0 ? d1 / d0 : 1, m0.x, m0.y, f, size);
      next = keepOn({ s: zoomed.s, tx: zoomed.tx + m1.x - m0.x, ty: zoomed.ty + m1.y - m0.y }, f, size);
    }
    vRef.current = next;
    setV(next);
  };

  const onUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  const onHandleDown = (kind: Handle) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    handle.current = { kind, id: e.pointerId };
  };

  const onHandleMove = (e: ReactPointerEvent) => {
    const h = handle.current;
    const f = frameRef.current;
    const cur = vRef.current;
    if (!h || h.id !== e.pointerId || !f || !cur) return;
    e.stopPropagation();
    const p = local(e);
    const [aw, ah] = area;
    let { x, y, w, h: fh } = f;
    const right = x + w;
    const bottom = y + fh;
    if (h.kind.includes('w')) {
      x = clamp(p.x, 2, right - MIN_FRAME);
      w = right - x;
    }
    if (h.kind.includes('e')) w = clamp(p.x, x + MIN_FRAME, aw - 2) - x;
    if (h.kind.includes('n')) {
      y = clamp(p.y, 2, bottom - MIN_FRAME);
      fh = bottom - y;
    }
    if (h.kind.includes('s')) fh = clamp(p.y, y + MIN_FRAME, ah - 2) - y;
    const nf = { x, y, w, h: fh };
    put(nf, keepOn(cur, nf, size));
  };

  const onHandleUp = (e: ReactPointerEvent) => {
    if (handle.current?.id === e.pointerId) handle.current = null;
    e.stopPropagation();
  };

  const [lo, hi] = frame ? zoomRange(frame, size) : [1, 1];
  const zoomPos = v && hi > lo ? Math.log(v.s / lo) / Math.log(hi / lo) : 0;
  const setZoom = (t: number) => {
    const f = frameRef.current;
    const cur = vRef.current;
    if (!f || !cur) return;
    const s = lo * (hi / lo) ** t;
    const next = zoomAt(cur, s / cur.s, f.x + f.w / 2, f.y + f.h / 2, f, size);
    vRef.current = next;
    setV(next);
  };

  return (
    <Box
      ref={boxRef}
      data-testid="crop-stage"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      sx={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none', userSelect: 'none', cursor: 'grab', '&:active': { cursor: 'grabbing' } }}
    >
      {frame && v ? (
        <>
          <Box sx={{ position: 'absolute', left: frame.x, top: frame.y, width: frame.w, height: frame.h, background: fill }} />
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: size[0] * v.s,
              height: size[1] * v.s,
              transform: `translate(${v.tx}px, ${v.ty}px)`,
              transformOrigin: '0 0',
            }}
          />
          <Box
            sx={{
              position: 'absolute', left: frame.x, top: frame.y, width: frame.w, height: frame.h, pointerEvents: 'none',
              outline: '2px solid #fff', boxShadow: '0 0 0 9999px rgba(0,0,0,0.38)',
            }}
          >
            {(aspect ? (['nw', 'ne', 'se', 'sw'] as Handle[]) : HANDLES).map((kind) => (
              <Box
                key={kind}
                data-handle={kind}
                onPointerDown={aspect ? undefined : onHandleDown(kind)}
                onPointerMove={aspect ? undefined : onHandleMove}
                onPointerUp={aspect ? undefined : onHandleUp}
                onPointerCancel={aspect ? undefined : onHandleUp}
                sx={{
                  position: 'absolute',
                  width: 34,
                  height: 34,
                  left: kind.includes('w') ? -17 : kind.includes('e') ? 'calc(100% - 17px)' : 'calc(50% - 17px)',
                  top: kind.includes('n') ? -17 : kind.includes('s') ? 'calc(100% - 17px)' : 'calc(50% - 17px)',
                  pointerEvents: aspect ? 'none' : 'auto',
                  cursor: aspect ? undefined : `${kind}-resize`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  touchAction: 'none',
                }}
              >
                <Box sx={{ width: 14, height: 14, bgcolor: '#fff', border: '2px solid #2e7d32', borderRadius: '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
              </Box>
            ))}
          </Box>
          {zoomSlider ? (
            <Box
              onPointerDown={(e) => e.stopPropagation()}
              sx={{ position: 'absolute', left: '50%', bottom: 8, transform: 'translateX(-50%)', width: 220, px: 2, py: 0.25, borderRadius: 99, bgcolor: 'rgba(255,255,255,0.9)', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}
            >
              <Slider
                size="small"
                aria-label="Zoom"
                min={0}
                max={1}
                step={0.001}
                value={zoomPos}
                onChange={(_, t) => setZoom(t as number)}
              />
            </Box>
          ) : null}
        </>
      ) : null}
    </Box>
  );
});
