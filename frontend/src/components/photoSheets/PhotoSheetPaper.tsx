import JsBarcode from 'jsbarcode';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { PhotoSheetFields, PhotoSheetItem } from '../../api/photoSheets.api';
import { cropOf, dragCrop, placePicture, zoomCrop, type Crop } from './sheetCrop';
import {
  PAPER, TITLE_FIT, contrastCurve, factLabel, fitTitle, paperSize, printedFacts, sheetMoney, titleFitFor,
  type SheetOrientation, type SheetPhoto,
} from './sheetLayouts';
import { FACTS_GAP, SIDE_WIDTHS, planSheet, type Rect, type SheetPlan } from './sheetPlan';

/** Inter (already loaded for Dash): plain, wide open letters, and its zero has no slash, so "$210.00" reads as money. */
export const SHEET_FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';
const TITLE_LINE = 1.08;
const PX_PER_IN = 96;
const PX_PER_PT = 96 / 72;
/** Word sizes (points). No word on the sheet is smaller than 12 pt: a shopper reads it standing up. */
const TYPE = { brand: 15, fullTitle: 15, condition: 23, caption: 12.5, label: 13, value: 22, price: 30, sku: 13 };
/** The line under the photos that says what they are. */
const CAPTION_H = 0.32;
const CAPTION_TEXT = { product: 'Product picture', item: 'Photo of this item' } as const;

export interface PhotoSheetPaperProps {
  fields: PhotoSheetFields;
  item?: PhotoSheetItem | null;
  /** The photo to show for a saved photo id (an object URL), or null while it loads. */
  photoUrl: (file: number) => string | null;
  /** On screen only: an empty sheet shows where the photos go, and a tap picks a photo. Never on paper. */
  editing?: boolean;
  /** The picture picked on the sheet (#108): outlined, and a drag moves it in its frame, a wheel or pinch zooms it. */
  picked?: number | null;
  onSlot?: (index: number) => void;
  /** A picked picture moved or zoomed in its frame (#108). Without it the pictures cannot be moved. */
  onCrop?: (index: number, crop: Crop) => void;
  /** Called with how the title settled (for the editor's note). */
  onTitleFit?: (fit: { pt: number; lines: number }) => void;
  /** Called with where each photo landed on the paper, in inches (for the editor's "may print fuzzy"). */
  onPlan?: (rects: Rect[]) => void;
}

/** The brand prints small above the title, once: not when the title already starts with it. */
export function brandLine(brand: string, title: string): string {
  const b = brand.trim();
  if (!b) return '';
  return title.trim().toLowerCase().startsWith(b.toLowerCase()) ? '' : b;
}

/** What prints big: the short plain name when there is one, else the full title. The full title then prints under it. */
export function titleLines(fields: Pick<PhotoSheetFields, 'title' | 'name'>): { big: string; full: string } {
  const title = fields.title.trim();
  const name = (fields.name ?? '').trim();
  if (name && name.toLowerCase() !== title.toLowerCase()) return { big: name, full: title };
  return { big: title, full: '' };
}

/**
 * One photo sheet at its true size, in inches (D22, D23, D24). The editor shows this same sheet scaled down; the print
 * window prints it at full size. White paper, black words, no fills. The photos take the paper the words leave, each
 * in a space the shape of the photo (sheetPlan.ts).
 */
export function PhotoSheetPaper({ fields, item, photoUrl, editing = false, picked = null, onSlot, onCrop, onTitleFit, onPlan }: PhotoSheetPaperProps) {
  const { width, height } = paperSize(fields.orientation);
  const facts = printedFacts({ ...fields.facts, condition: '' }, fields.labels);
  const conditionLabel = factLabel('condition', fields.labels);
  // One contrast filter per sheet (the preview and the print copy are both on the page, so the ids differ).
  const filterId = `ps-contrast-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const curve = contrastCurve(fields.contrast);
  const photoFilter = curve ? `url(#${filterId}) saturate(${curve.saturate})` : undefined;
  const condition = (fields.facts.condition ?? '').trim();
  const price = fields.show_price && item ? sheetMoney(item.price) : '';
  const sku = fields.show_item_number && item ? item.sku : '';
  const { big, full } = titleLines(fields);
  const brand = brandLine(fields.brand, big);
  const fit = useTitleFit(big, fields.orientation);
  const onFit = useRef(onTitleFit);
  onFit.current = onTitleFit;
  useEffect(() => {
    onFit.current?.(fit.result);
  }, [fit.result]);

  const { bodyRef, belowRef, besideRefs, plan, body, scale } = useSheetPlan(fields, facts.length > 0, fit.result.pt);
  const caption = fields.photos.length ? CAPTION_TEXT[fields.caption] ?? CAPTION_TEXT.product : '';
  const planned = JSON.stringify(plan.photos.rects);
  const onPlanRef = useRef(onPlan);
  onPlanRef.current = onPlan;
  useEffect(() => {
    onPlanRef.current?.(JSON.parse(planned) as Rect[]);
  }, [planned]);

  return (
    <div
      className="ps-paper"
      data-testid="photo-sheet-paper"
      data-layout={fields.layout}
      data-orientation={fields.orientation}
      data-arrangement={plan.photos.arrangement}
      data-facts={plan.facts}
      style={{
        width: `${width}in`,
        // A hair under the page, so the print window never spills onto a second sheet.
        height: `${height - 0.02}in`,
        padding: `${PAPER.margin}in`,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#fff',
        color: '#000',
        fontFamily: SHEET_FONT,
      }}
    >
      <header style={{ flex: '0 0 auto' }}>
        {brand ? (
          <div data-testid="photo-sheet-brand" style={{ fontSize: `${TYPE.brand}pt`, fontWeight: 700, letterSpacing: '0.06em', lineHeight: 1.15, marginBottom: '0.04in', textTransform: 'uppercase' }}>
            {brand}
          </div>
        ) : null}
        <h1
          ref={fit.ref}
          data-testid="photo-sheet-title"
          data-pt={fit.result.pt}
          style={{
            margin: 0,
            fontSize: `${fit.result.pt}pt`,
            lineHeight: TITLE_LINE,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            overflowWrap: 'anywhere',
            textWrap: 'balance',
          } as CSSProperties}
        >
          {big || (editing ? <span style={{ color: '#9a9a9a' }}>Type the title</span> : null)}
        </h1>
        {full ? (
          <div data-testid="photo-sheet-full-title" style={{ fontSize: `${TYPE.fullTitle}pt`, lineHeight: 1.25, marginTop: '0.06in', overflowWrap: 'anywhere' }}>
            {full}
          </div>
        ) : null}
        {condition || fields.not_assembled ? (
          <div data-testid="photo-sheet-condition" style={{ fontSize: `${TYPE.condition}pt`, lineHeight: 1.2, marginTop: '0.1in', fontWeight: 600, overflowWrap: 'anywhere' }}>
            {condition ? <><span style={{ fontWeight: 800 }}>{conditionLabel}:</span> {condition}{fields.not_assembled ? ' ' : ''}</> : null}
            {/* The picture shows it put together; the box holds it in pieces. The shopper must not miss that. */}
            {fields.not_assembled ? <span data-testid="photo-sheet-not-assembled" style={{ fontWeight: 800 }}>In the box, not assembled.</span> : null}
          </div>
        ) : null}
      </header>

      <div ref={bodyRef} data-testid="photo-sheet-body" style={{ flex: '1 1 auto', minHeight: 0, position: 'relative', marginTop: '0.18in' }}>
        {curve ? (
          // A gamma curve on each colour: the middle tones print darker on a weak printer, white and black stay put.
          <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', width: 0, height: 0 }} data-testid="photo-sheet-contrast" data-step={fields.contrast}>
            <filter id={filterId} colorInterpolationFilters="sRGB">
              <feComponentTransfer>
                <feFuncR type="gamma" amplitude="1" exponent={curve.exponent} offset="0" />
                <feFuncG type="gamma" amplitude="1" exponent={curve.exponent} offset="0" />
                <feFuncB type="gamma" amplitude="1" exponent={curve.exponent} offset="0" />
              </feComponentTransfer>
            </filter>
          </svg>
        ) : null}
        {plan.photos.rects.map((rect, index) => {
          const photo = fields.photos[index];
          return (
            <PhotoSpace
              key={`${photo.file}-${index}`}
              index={index}
              rect={rect}
              photo={photo}
              url={photoUrl(photo.file)}
              editing={editing}
              picked={picked === index}
              onSlot={onSlot}
              onCrop={onCrop}
              filter={photoFilter}
            />
          );
        })}
        {editing && !fields.photos.length ? (
          <div
            className="ps-screen-only"
            style={{
              position: 'absolute', left: 0, top: 0, width: `${plan.box.w}in`, height: `${plan.box.h}in`, border: '3px dashed #b9b9b9',
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a8a8a', fontSize: '22pt',
            }}
          >
            The photos go here
          </div>
        ) : null}
        {caption ? (
          <div
            data-testid="photo-sheet-caption"
            style={{ position: 'absolute', left: 0, top: `${plan.photos.height + 0.06}in`, fontSize: `${TYPE.caption}pt`, fontWeight: 600, lineHeight: 1.2 }}
          >
            {caption}
          </div>
        ) : null}
        {facts.length && plan.facts !== 'none' ? (
          <div
            data-testid="photo-sheet-facts"
            style={{
              position: 'absolute',
              ...(plan.facts === 'beside'
                ? { left: `${plan.photos.width + FACTS_GAP}in`, top: 0, width: `${body.w - plan.photos.width - FACTS_GAP}in` }
                : { left: 0, top: `${plan.photos.height + CAPTION_H + FACTS_GAP}in`, width: `${body.w}in` }),
            }}
          >
            <Facts facts={facts} beside={plan.facts === 'beside'} scale={scale} />
          </div>
        ) : null}
        {/* Measured, never seen: how tall the facts are under the photos and in a column beside them. */}
        {facts.length ? (
          <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, height: 0, overflow: 'hidden', visibility: 'hidden', pointerEvents: 'none' }}>
            <div ref={belowRef} style={{ width: `${body.w || width - 2 * PAPER.margin}in` }}><Facts facts={facts} beside={false} scale={1} /></div>
            {SIDE_WIDTHS.map((side, n) => (
              <div key={side} ref={(node) => { besideRefs.current[n] = node; }} style={{ width: `${side}in` }}><Facts facts={facts} beside scale={1} /></div>
            ))}
          </div>
        ) : null}
      </div>

      {price || sku ? (
        <div
          data-testid="photo-sheet-tag"
          style={{ flex: '0 0 auto', marginTop: '0.16in', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '0.3in' }}
        >
          <div>
            {price ? (
              <>
                <div style={{ fontSize: `${TYPE.label}pt`, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Price</div>
                <div data-testid="photo-sheet-price" style={{ fontSize: `${TYPE.price}pt`, fontWeight: 800, lineHeight: 1 }}>{price}</div>
              </>
            ) : null}
          </div>
          {sku ? <ItemNumber sku={sku} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Size, In the box, Good to know: big enough to read standing up, under the photos or in a column beside them. */
function Facts({ facts, beside, scale }: { facts: { key: string; label: string; value: string }[]; beside: boolean; scale: number }) {
  const short = facts.every((fact) => fact.value.length <= 30);
  const columns = beside || facts.length === 1 ? 1 : short ? facts.length : 2;
  return (
    <div
      style={{
        borderTop: '1.5pt solid #000',
        paddingTop: '0.12in',
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: `${0.12 * scale}in 0.3in`,
      }}
    >
      {facts.map((fact) => (
        <div key={fact.key} data-testid={`photo-sheet-fact-${fact.key}`} style={{ minWidth: 0 }}>
          <div style={{ fontSize: `${TYPE.label * scale}pt`, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', lineHeight: 1.2 }}>
            {fact.label}
          </div>
          <div style={{ fontSize: `${TYPE.value * scale}pt`, lineHeight: 1.18, overflowWrap: 'anywhere' }}>{fact.value}</div>
        </div>
      ))}
    </div>
  );
}

function PhotoSpace({ index, rect, photo, url, editing, picked, onSlot, onCrop, filter }: {
  index: number;
  rect: Rect;
  photo: SheetPhoto;
  url: string | null;
  editing: boolean;
  picked: boolean;
  onSlot?: (index: number) => void;
  onCrop?: (index: number, crop: Crop) => void;
  filter?: string;
}) {
  const quarter = ((photo.turn % 180) + 180) % 180 === 90;
  const cover = photo.fit === 'fill' || Boolean(rect.crop);
  const placed = placePicture(photo, rect, cover);
  const frameRef = useRef<HTMLDivElement>(null);
  const movable = editing && picked && Boolean(onCrop);
  useCropGestures(frameRef, movable, index, photo, rect, cover, onCrop);
  let inner: ReactNode = null;
  if (url) {
    inner = (
      <img
        src={url}
        alt=""
        draggable={false}
        decoding="sync"
        data-testid={`photo-sheet-picture-${index}`}
        style={{
          position: 'absolute',
          // The picture's own box, its centre shifted by the crop (sheetCrop.ts). A quarter turn swaps its sides first.
          left: `calc(50% + ${placed.dx}in)`,
          top: `calc(50% + ${placed.dy}in)`,
          width: `${quarter ? placed.h : placed.w}in`,
          height: `${quarter ? placed.w : placed.h}in`,
          maxWidth: 'none',
          transform: `translate(-50%, -50%) rotate(${photo.turn}deg)`,
          // The box has the picture's shape; cover only hides a pixel's rounding at an edge.
          objectFit: 'cover',
          display: 'block',
          filter,
          pointerEvents: 'none',
        }}
      />
    );
  } else if (editing) {
    inner = <div className="ps-screen-only" style={{ position: 'absolute', inset: 0, background: '#eee' }} />;
  }
  return (
    <div
      ref={frameRef}
      data-testid={`photo-sheet-slot-${index}`}
      data-zoom={placed.crop.zoom}
      onClick={onSlot && !movable ? () => onSlot(index) : undefined}
      style={{
        position: 'absolute',
        left: `${rect.x}in`,
        top: `${rect.y}in`,
        width: `${rect.w}in`,
        height: `${rect.h}in`,
        overflow: 'hidden',
        cursor: movable ? 'grab' : onSlot ? 'pointer' : undefined,
        // A picked picture takes every touch: a finger drags it, it does not scroll the page.
        touchAction: movable ? 'none' : undefined,
      }}
    >
      {inner}
      {/* The picked ring sits over the picture: a zoomed picture would cover an outline. Screen only. */}
      {editing && picked ? (
        <div className="ps-screen-only" style={{ position: 'absolute', inset: 0, border: '7px solid #1f6feb', pointerEvents: 'none' }} />
      ) : null}
    </div>
  );
}

/**
 * Drag to move the picked picture in its frame, the mouse wheel or a two-finger pinch to zoom it (#108). Moves are
 * measured as a share of the frame on screen, so the preview's scale does not matter.
 */
function useCropGestures(
  frameRef: React.RefObject<HTMLDivElement | null>,
  movable: boolean,
  index: number,
  photo: SheetPhoto,
  frame: Rect,
  cover: boolean,
  onCrop?: (index: number, crop: Crop) => void,
) {
  const live = useRef({ photo, frame, cover, onCrop, index });
  live.current = { photo, frame, cover, onCrop, index };
  useEffect(() => {
    const node = frameRef.current;
    if (!node || !movable) return undefined;
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { crop: Crop; x: number; y: number; spread: number } | null = null;
    const spreadOf = () => {
      const [a, b] = Array.from(pointers.values());
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const centre = () => {
      const all = Array.from(pointers.values());
      return { x: all.reduce((t, p) => t + p.x, 0) / all.length, y: all.reduce((t, p) => t + p.y, 0) / all.length };
    };
    const begin = () => {
      const c = centre();
      start = { crop: cropOf(live.current.photo), x: c.x, y: c.y, spread: spreadOf() };
    };
    const down = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      node.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      node.style.cursor = 'grabbing';
      begin();
    };
    const move = (event: PointerEvent) => {
      if (!start || !pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const { photo: p, frame: f, cover: cv, onCrop: emit, index: i } = live.current;
      const c = centre();
      let crop = start.crop;
      if (pointers.size > 1 && start.spread > 0) crop = zoomCrop(p, crop, crop.zoom * (spreadOf() / start.spread), f, cv);
      crop = dragCrop(p, crop, (c.x - start.x) / box.width, (c.y - start.y) / box.height, f, cv);
      emit?.(i, crop);
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      node.style.cursor = 'grab';
      if (pointers.size) begin();
      else start = null;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const { photo: p, frame: f, cover: cv, onCrop: emit, index: i } = live.current;
      const crop = cropOf(p);
      emit?.(i, zoomCrop(p, crop, crop.zoom * Math.exp(-event.deltaY * 0.0015), f, cv));
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    // Not passive: the wheel zooms the picture, it does not scroll the page.
    node.addEventListener('wheel', wheel, { passive: false });
    return () => {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      node.removeEventListener('wheel', wheel);
    };
  }, [frameRef, movable]);
}

/** The item number with its barcode (D25), drawn the way the price tags draw theirs. */
function ItemNumber({ sku }: { sku: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, sku, { format: 'CODE128', displayValue: false, height: 46, width: 2, margin: 0, background: '#ffffff', lineColor: '#000000' });
    } catch {
      // A number the barcode cannot hold still prints as words.
    }
  }, [sku]);
  return (
    <div data-testid="photo-sheet-item-number" style={{ textAlign: 'right' }}>
      <svg ref={ref} style={{ height: '0.5in', width: 'auto', display: 'block', marginLeft: 'auto' }} />
      <div style={{ fontSize: `${TYPE.sku}pt`, fontWeight: 700, letterSpacing: '0.06em', marginTop: '0.03in' }}>{sku}</div>
    </div>
  );
}

function useFontsReady(): number {
  const [ready, setReady] = useState(0);
  useEffect(() => {
    let live = true;
    const fonts = typeof document !== 'undefined' ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
    fonts?.ready.then(() => {
      if (live) setReady((n) => n + 1);
    }).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

/**
 * The title's size (D23): the biggest that keeps it on two lines, else three, never cut. Measured on the title itself
 * at its true width, again once the sheet's font has loaded.
 */
function useTitleFit(title: string, orientation: SheetOrientation) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [result, setResult] = useState<{ pt: number; lines: number }>({ pt: TITLE_FIT.max, lines: 1 });
  const fontsReady = useFontsReady();
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const before = node.style.fontSize;
    const linesAt = (pt: number) => {
      node.style.fontSize = `${pt}pt`;
      const line = pt * TITLE_LINE * PX_PER_PT;
      return node.offsetHeight ? Math.round(node.offsetHeight / line) : 1;
    };
    const fit = titleFitFor(orientation);
    const next = title ? fitTitle(linesAt, fit) : { pt: fit.max, lines: 1 };
    node.style.fontSize = before;
    setResult((current) => (current.pt === next.pt && current.lines === next.lines ? current : next));
  }, [title, orientation, fontsReady]);
  return { ref, result };
}

/** Measure the space left for the photos and the facts, and plan them (sheetPlan.ts). */
function useSheetPlan(fields: PhotoSheetFields, hasFacts: boolean, titlePt: number) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const belowRef = useRef<HTMLDivElement>(null);
  const besideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fontsReady = useFontsReady();
  const paper = paperSize(fields.orientation);
  const guess = { w: paper.width - 2 * PAPER.margin, h: paper.height - 2 * PAPER.margin - 2 };
  const [measured, setMeasured] = useState({ body: guess, below: 1.4, beside: SIDE_WIDTHS.map(() => 3.5) });
  const factsKey = JSON.stringify(fields.facts);
  useLayoutEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    const inches = (px: number) => Math.round((px / PX_PER_IN) * 1000) / 1000;
    const body = node.clientWidth && node.clientHeight ? { w: inches(node.clientWidth), h: inches(node.clientHeight) } : guess;
    const below = belowRef.current?.offsetHeight ? inches(belowRef.current.offsetHeight) : 1.4;
    const beside = SIDE_WIDTHS.map((_, n) => {
      const node = besideRefs.current[n];
      return node?.offsetHeight ? inches(node.offsetHeight) : 3.5;
    });
    setMeasured((current) => (
      current.body.w === body.w && current.body.h === body.h && current.below === below && current.beside.join() === beside.join()
        ? current : { body, below, beside }
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.orientation, fields.title, fields.name, fields.brand, factsKey, fields.show_price, fields.show_item_number, fields.not_assembled, titlePt, fontsReady]);

  const plan: SheetPlan = planSheet({
    layout: fields.layout,
    orientation: fields.orientation,
    photos: fields.photos,
    body: fields.photos.length ? { w: measured.body.w, h: Math.max(0, measured.body.h - CAPTION_H) } : measured.body,
    factsBelow: measured.below,
    factsBeside: measured.beside,
    hasFacts,
  });
  // The facts grow into paper the photos could not use (round 1: "the bottom of the page is empty").
  let scale = 1;
  if (plan.facts === 'below') {
    const room = measured.body.h - plan.photos.height - FACTS_GAP - (fields.photos.length ? CAPTION_H : 0);
    scale = [1.35, 1.2, 1.1].find((s) => measured.below * s <= room * 0.88) ?? 1;
  } else if (plan.facts === 'beside') {
    // Measured at the narrowest width the column is at least as wide as.
    const width = measured.body.w - plan.photos.width - FACTS_GAP;
    const n = Math.max(0, SIDE_WIDTHS.filter((side) => side <= width + 0.01).length - 1);
    scale = [1.35, 1.2, 1.1].find((s) => measured.beside[n] * s <= measured.body.h * 0.85) ?? 1;
  }
  return { bodyRef, belowRef, besideRefs, plan, body: measured.body, scale };
}
