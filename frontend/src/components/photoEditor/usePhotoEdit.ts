/**
 * The photo editor's Edit state for one picture (Dash #209). Keeps the unsaved edit, draws a live preview at screen
 * size with our own pixel math, and draws the full-size picture for Save as new version.
 *
 * While a crop is being set (`cropping`), the preview is the whole turned picture (the crop frame sits over it);
 * after Apply it is the cropped picture, and Light, Color, Looks and Background work on that.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { backdropOf, drawGeometry, editCaption, isDirty, renderFull, START, turn, turnedSize, type EditState, type Ratio } from './editState';
import { contentBox, processPixels, type BackdropInfo, type Rect } from './pixels';

export interface PhotoEdit {
  state: EditState;
  set: (patch: Partial<EditState>) => void;
  reset: () => void;
  dirty: boolean;
  /** The ratio of the crop being set, or null when not cropping. */
  cropping: Ratio | null;
  startCrop: (ratio: Ratio) => void;
  stopCrop: () => void;
  applyCrop: (rect: Rect) => void;
  turnBy: (dir: 1 | -1) => void;
  /** The turned picture's full size (crop coordinates). */
  size: [number, number];
  info: BackdropInfo | null;
  /** The processed preview (offscreen) and a counter that moves each time it is redrawn. */
  view: HTMLCanvasElement | null;
  tick: number;
  /** The preview has see-through pixels (shown on a checkerboard). */
  clear: boolean;
  /** The item's box in the turned picture's full-size pixels, for Crop to content. */
  findContent: () => Rect | null;
  /** The full-size picture and its caption; `pending` is a crop not applied yet (Save applies it first). */
  render: (pending: Rect | null) => Promise<{ blob: Blob; caption: string }>;
}

export function usePhotoEdit(img: HTMLImageElement | null, previewEdge = 1600): PhotoEdit {
  const [state, setState] = useState<EditState>(START);
  const [cropping, setCropping] = useState<Ratio | null>(null);
  const w = img?.naturalWidth ?? 0;
  const h = img?.naturalHeight ?? 0;
  const info = useMemo(() => (img && w && h ? backdropOf(img, w, h) : null), [img, w, h]);
  const size = turnedSize(w, h, state.turns);
  const croppingNow = cropping != null;

  // The preview's starting pixels: the turned picture (cropping) or the turned and cropped one, at screen size.
  const base = useMemo(() => {
    if (!img || !w || !h) return null;
    const [tw, th] = turnedSize(w, h, state.turns);
    const area = !croppingNow && state.crop ? state.crop : { x: 0, y: 0, w: tw, h: th };
    const scale = Math.min(1, previewEdge / Math.max(area.w, area.h));
    const canvas = drawGeometry(img, w, h, state.turns, croppingNow ? null : state.crop, scale);
    const ctx = canvas.getContext('2d');
    return ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
  }, [img, w, h, state.turns, state.crop, croppingNow, previewEdge]);

  const viewRef = useRef<HTMLCanvasElement | null>(null);
  const bufRef = useRef<ImageData | null>(null);
  const [tick, setTick] = useState(0);
  const [clear, setClear] = useState(false);
  const { adjust, look, backdrop } = state;

  useEffect(() => {
    if (!base || !info) return undefined;
    const frame = requestAnimationFrame(() => {
      const view = viewRef.current ?? document.createElement('canvas');
      viewRef.current = view;
      if (view.width !== base.width || view.height !== base.height) {
        view.width = base.width;
        view.height = base.height;
      }
      let buf = bufRef.current;
      if (!buf || buf.width !== base.width || buf.height !== base.height) {
        buf = new ImageData(base.width, base.height);
        bufRef.current = buf;
      }
      const isClear = processPixels(base.data, buf.data, { adjust, look, backdrop }, info);
      view.getContext('2d')?.putImageData(buf, 0, 0);
      setClear(isClear);
      setTick((t) => t + 1);
    });
    return () => cancelAnimationFrame(frame);
  }, [base, info, adjust, look, backdrop]);

  const set = useCallback((patch: Partial<EditState>) => setState((s) => ({ ...s, ...patch })), []);
  const reset = useCallback(() => {
    setState(START);
    setCropping(null);
  }, []);
  const startCrop = useCallback((ratio: Ratio) => setCropping(ratio), []);
  const stopCrop = useCallback(() => setCropping(null), []);
  const applyCrop = useCallback((rect: Rect) => {
    setState((s) => ({ ...s, crop: rect, ratio: cropping }));
    setCropping(null);
  }, [cropping]);
  const turnBy = useCallback((dir: 1 | -1) => setState((s) => turn(s, dir, w, h)), [w, h]);

  const findContent = useCallback(() => {
    if (!img || !info || !w || !h || (!info.plain && !info.seeThrough)) return null;
    const scale = Math.min(1, 512 / Math.max(w, h));
    const canvas = drawGeometry(img, w, h, state.turns, null, scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const box = contentBox(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, info);
    return box && { x: box.x / scale, y: box.y / scale, w: box.w / scale, h: box.h / scale };
  }, [img, info, w, h, state.turns]);

  const render = useCallback(async (pending: Rect | null) => {
    if (!img || !info) throw new Error('not_ready');
    const final: EditState = pending ? { ...state, crop: pending, ratio: cropping } : state;
    const blob = await renderFull(img, w, h, final, info);
    return { blob, caption: editCaption(final) };
  }, [img, info, w, h, state, cropping]);

  return {
    state,
    set,
    reset,
    dirty: isDirty(state) || croppingNow,
    cropping,
    startCrop,
    stopCrop,
    applyCrop,
    turnBy,
    size,
    info,
    view: viewRef.current,
    tick,
    clear,
    findContent,
    render,
  };
}
