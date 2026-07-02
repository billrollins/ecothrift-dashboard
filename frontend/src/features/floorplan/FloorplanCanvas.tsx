import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { Box } from '@mui/material';
import type {
  PlanDocument,
  PlanElement,
  PlanInfoBlock,
  PlanLabel,
  PlanLabelSettings,
  PlanPath,
  PlanZone,
} from '../../types/floorplan.types';
import { DEFAULT_LABEL_SETTINGS } from '../../types/floorplan.types';
import {
  addLabel,
  addPath,
  addZone,
  collectionKeyFor,
  expandSelectionToGroups,
  getObject,
  moveObjects,
  newId,
  updateObject,
  type EditorAction,
  type EditorState,
  type SelectionRef,
} from './editorState';
import {
  normalizeRect,
  pathBounds,
  rectsIntersect,
  rotatedBounds,
  screenToWorld,
  zoomAt,
  type Point,
  type Rect,
  type Viewport,
} from './geometry';
import { snapPoint, snapSize, snapValue } from './snapping';
import type { PaletteEntry, PaletteIndex } from './palette';
import { ElementShape, InfoBlockShape, LabelShape, PathShape, ZoneShape } from './objectRenderers';

const MIN_SIZE = 2; // inches
const DRAG_THRESHOLD_PX = 3;

export interface DrawStroke {
  color: string;
  width: number;
}

interface FloorplanCanvasProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  viewport: Viewport;
  onViewportChange: (vp: Viewport) => void;
  /** Palette entry being placed (ghost follows cursor; click to drop) */
  pendingPlacement: PaletteEntry | null;
  onPlace: (entry: PaletteEntry, position: Point, keepPlacing?: boolean) => void;
  drawStroke: DrawStroke;
  svgRef: RefObject<SVGSVGElement | null>;
  readOnly: boolean;
  /** Asset id -> data URI, for elements with an assigned image */
  assets?: Map<number, string>;
  /** Element kind catalog for shape/color resolution (legend, footprints) */
  kindIndex?: PaletteIndex;
}

type HandleId = 'nw' | 'ne' | 'sw' | 'se';

type DragState =
  | { mode: 'pan'; startClient: Point; startVp: Viewport }
  | { mode: 'maybeMove'; startClient: Point; startWorld: Point; ref: SelectionRef; additive: boolean }
  | { mode: 'move'; startWorld: Point; baseDoc: PlanDocument; refs: SelectionRef[] }
  | { mode: 'resize'; ref: SelectionRef; handle: HandleId; baseRect: Rect; baseDoc: PlanDocument }
  | { mode: 'marquee'; startWorld: Point }
  | { mode: 'zone'; startWorld: Point; id: string; baseDoc: PlanDocument }
  | { mode: 'draw'; id: string; points: [number, number][]; baseDoc: PlanDocument };

/** Grid line rendering presets, from least to most visually prominent. */
const GRID_STYLES: Record<'faint' | 'normal' | 'strong', {
  minorColor: string; majorColor: string; minorWidth: number; majorWidth: number; opacity: number;
}> = {
  faint: { minorColor: '#eef1f3', majorColor: '#dde3e7', minorWidth: 0.5, majorWidth: 0.8, opacity: 0.8 },
  normal: { minorColor: '#e0e5e8', majorColor: '#b0bec5', minorWidth: 0.6, majorWidth: 1, opacity: 1 },
  strong: { minorColor: '#cfd8dc', majorColor: '#90a4ae', minorWidth: 0.8, majorWidth: 1.3, opacity: 1 },
};

type ObjectPointerDown = (e: ReactPointerEvent, ref: SelectionRef) => void;

/**
 * Memoized per-object rows: during drags only the moved objects get new
 * references (updateObject/moveObjects preserve identity for the rest), so
 * unchanged objects skip re-rendering entirely.
 */
const ZoneRow = memo(function ZoneRow({ zone, selected, labelSettings, onObjectPointerDown }: {
  zone: PlanZone; selected: boolean; labelSettings: PlanLabelSettings; onObjectPointerDown: ObjectPointerDown;
}) {
  return (
    <g onPointerDown={(e) => onObjectPointerDown(e, { kind: 'zone', id: zone.id })}>
      <ZoneShape zone={zone} selected={selected} labelSettings={labelSettings} />
    </g>
  );
});

const ElementRow = memo(function ElementRow({ element, selected, labelSettings, imageHref, kindIndex, onObjectPointerDown }: {
  element: PlanElement; selected: boolean; labelSettings: PlanLabelSettings; imageHref?: string; kindIndex?: PaletteIndex; onObjectPointerDown: ObjectPointerDown;
}) {
  return (
    <g onPointerDown={(e) => onObjectPointerDown(e, { kind: 'element', id: element.id })}>
      <ElementShape element={element} selected={selected} labelSettings={labelSettings} imageHref={imageHref} kindIndex={kindIndex} />
    </g>
  );
});

const PathRow = memo(function PathRow({ path, selected, hitWidth, onObjectPointerDown }: {
  path: PlanPath; selected: boolean; hitWidth: number; onObjectPointerDown: ObjectPointerDown;
}) {
  return (
    <g onPointerDown={(e) => onObjectPointerDown(e, { kind: 'path', id: path.id })}>
      <path
        d={path.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')}
        fill="none"
        stroke="transparent"
        strokeWidth={hitWidth}
      />
      <PathShape path={path} selected={selected} />
    </g>
  );
});

const LabelRow = memo(function LabelRow({ label, selected, onObjectPointerDown }: {
  label: PlanLabel; selected: boolean; onObjectPointerDown: ObjectPointerDown;
}) {
  return (
    <g onPointerDown={(e) => onObjectPointerDown(e, { kind: 'label', id: label.id })}>
      <LabelShape label={label} selected={selected} />
    </g>
  );
});

const InfoBlockRow = memo(function InfoBlockRow({ block, elements, selected, kindIndex, onObjectPointerDown }: {
  block: PlanInfoBlock; elements: PlanElement[]; selected: boolean; kindIndex?: PaletteIndex; onObjectPointerDown: ObjectPointerDown;
}) {
  return (
    <g onPointerDown={(e) => onObjectPointerDown(e, { kind: 'infoBlock', id: block.id })}>
      <InfoBlockShape block={block} elements={elements} selected={selected} kindIndex={kindIndex} />
    </g>
  );
});

function objectBounds(doc: PlanDocument, ref: SelectionRef): Rect | null {
  const obj = getObject(doc, ref);
  if (!obj) return null;
  if (ref.kind === 'path') return pathBounds((obj as PlanPath).points);
  if (ref.kind === 'label') {
    const label = obj as PlanLabel;
    return { x: label.x, y: label.y, w: label.text.length * label.fontSize * 0.55, h: label.fontSize * 1.2 };
  }
  const r = obj as unknown as Rect;
  if (ref.kind === 'element') return rotatedBounds(r, (obj as PlanElement).rotation);
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

export default function FloorplanCanvas({
  state,
  dispatch,
  viewport,
  onViewportChange,
  pendingPlacement,
  onPlace,
  drawStroke,
  svgRef,
  readOnly,
  assets,
  kindIndex,
}: FloorplanCanvasProps) {
  const { doc, selection, tool } = state;
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [ghost, setGhost] = useState<Point | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);

  const snap = doc.settings.snap;

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const el = svgRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return screenToWorld({ x: clientX - rect.left, y: clientY - rect.top }, viewportRef.current);
    },
    [svgRef],
  );

  // Wheel zoom (non-passive so preventDefault works)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      onViewportChange(
        zoomAt(viewportRef.current, { x: e.clientX - rect.left, y: e.clientY - rect.top }, factor),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onViewportChange, svgRef]);

  // Track spacebar for temporary pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setSpaceDown(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const isPanGesture = (e: ReactPointerEvent) =>
    tool === 'pan' || spaceDown || e.button === 1;

  const labelSettings = doc.settings.labels ?? DEFAULT_LABEL_SETTINGS;

  // ── Pointer handlers ────────────────────────────────────────────────────

  const onObjectPointerDown = (e: ReactPointerEvent, ref: SelectionRef) => {
    if (isPanGesture(e) || tool !== 'select' || readOnly) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const additive = e.shiftKey;
    const already = selection.some((s) => s.kind === ref.kind && s.id === ref.id);
    // Clicking any member of a group targets the whole group.
    const clicked = expandSelectionToGroups(doc, [ref]);
    if (additive) {
      const clickedKeys = new Set(clicked.map((r) => `${r.kind}:${r.id}`));
      dispatch({
        type: 'setSelection',
        selection: already
          ? selection.filter((s) => !clickedKeys.has(`${s.kind}:${s.id}`))
          : [...selection, ...clicked.filter((c) => !selection.some((s) => s.kind === c.kind && s.id === c.id))],
      });
      return;
    }
    if (!already) dispatch({ type: 'setSelection', selection: clicked });
    dragRef.current = {
      mode: 'maybeMove',
      startClient: { x: e.clientX, y: e.clientY },
      startWorld: clientToWorld(e.clientX, e.clientY),
      ref,
      additive,
    };
  };

  // Stable identity so memoized rows don't re-render when this closure changes.
  const objectPointerDownRef = useRef<ObjectPointerDown>(onObjectPointerDown);
  objectPointerDownRef.current = onObjectPointerDown;
  const stableObjectPointerDown = useCallback<ObjectPointerDown>((e, ref) => {
    objectPointerDownRef.current(e, ref);
  }, []);

  const onHandlePointerDown = (e: ReactPointerEvent, ref: SelectionRef, handle: HandleId) => {
    if (readOnly) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const obj = getObject(doc, ref) as unknown as Rect | undefined;
    if (!obj) return;
    dispatch({ type: 'gestureStart' });
    dragRef.current = {
      mode: 'resize',
      ref,
      handle,
      baseRect: { x: obj.x, y: obj.y, w: obj.w, h: obj.h },
      baseDoc: doc,
    };
  };

  const onBackgroundPointerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const world = clientToWorld(e.clientX, e.clientY);

    if (isPanGesture(e)) {
      dragRef.current = {
        mode: 'pan',
        startClient: { x: e.clientX, y: e.clientY },
        startVp: viewportRef.current,
      };
      return;
    }
    if (e.button !== 0) return;

    if (pendingPlacement && !readOnly) {
      onPlace(pendingPlacement, snapPoint(world, snap), e.shiftKey);
      return;
    }

    if (readOnly) return;

    switch (tool) {
      case 'select':
        if (!e.shiftKey) dispatch({ type: 'setSelection', selection: [] });
        dragRef.current = { mode: 'marquee', startWorld: world };
        setMarquee({ x: world.x, y: world.y, w: 0, h: 0 });
        break;
      case 'zone': {
        const id = newId('zn');
        dispatch({ type: 'gestureStart' });
        dragRef.current = { mode: 'zone', startWorld: snapPoint(world, snap), id, baseDoc: doc };
        break;
      }
      case 'draw': {
        const id = newId('pa');
        const start: [number, number] = [world.x, world.y];
        dispatch({ type: 'gestureStart' });
        dragRef.current = { mode: 'draw', id, points: [start], baseDoc: doc };
        break;
      }
      case 'label': {
        const p = snapPoint(world, snap);
        const label: PlanLabel = {
          id: newId('lb'),
          text: 'Label',
          x: p.x,
          y: p.y,
          fontSize: 12,
          color: '#263238',
        };
        dispatch({ type: 'commit', doc: addLabel(doc, label) });
        dispatch({ type: 'setSelection', selection: [{ kind: 'label', id: label.id }] });
        dispatch({ type: 'setTool', tool: 'select' });
        break;
      }
      default:
        break;
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (pendingPlacement) {
      setGhost(snapPoint(clientToWorld(e.clientX, e.clientY), snap));
    }
    const drag = dragRef.current;
    if (!drag) return;
    const world = clientToWorld(e.clientX, e.clientY);

    switch (drag.mode) {
      case 'pan': {
        const dx = (e.clientX - drag.startClient.x) / drag.startVp.scale;
        const dy = (e.clientY - drag.startClient.y) / drag.startVp.scale;
        onViewportChange({ ...drag.startVp, x: drag.startVp.x - dx, y: drag.startVp.y - dy });
        break;
      }
      case 'maybeMove': {
        const dist = Math.hypot(e.clientX - drag.startClient.x, e.clientY - drag.startClient.y);
        if (dist < DRAG_THRESHOLD_PX) return;
        const refs = selection.length > 0 ? selection : [drag.ref];
        dispatch({ type: 'gestureStart' });
        dragRef.current = { mode: 'move', startWorld: drag.startWorld, baseDoc: doc, refs };
        break;
      }
      case 'move': {
        const dx = snapValue(world.x - drag.startWorld.x, snap);
        const dy = snapValue(world.y - drag.startWorld.y, snap);
        dispatch({ type: 'gestureUpdate', doc: moveObjects(drag.baseDoc, drag.refs, dx, dy) });
        break;
      }
      case 'resize': {
        const { baseRect, handle } = drag;
        const px = snapValue(world.x, snap);
        const py = snapValue(world.y, snap);
        const anchorX = handle === 'nw' || handle === 'sw' ? baseRect.x + baseRect.w : baseRect.x;
        const anchorY = handle === 'nw' || handle === 'ne' ? baseRect.y + baseRect.h : baseRect.y;
        const raw = normalizeRect({ x: anchorX, y: anchorY, w: px - anchorX, h: py - anchorY });
        const next: Rect = {
          ...raw,
          w: snapSize(raw.w, snap, MIN_SIZE),
          h: snapSize(raw.h, snap, MIN_SIZE),
        };
        dispatch({
          type: 'gestureUpdate',
          doc: updateObject(drag.baseDoc, drag.ref, next),
        });
        break;
      }
      case 'marquee': {
        setMarquee(
          normalizeRect({
            x: drag.startWorld.x,
            y: drag.startWorld.y,
            w: world.x - drag.startWorld.x,
            h: world.y - drag.startWorld.y,
          }),
        );
        break;
      }
      case 'zone': {
        const p = snapPoint(world, snap);
        const rect = normalizeRect({
          x: drag.startWorld.x,
          y: drag.startWorld.y,
          w: p.x - drag.startWorld.x,
          h: p.y - drag.startWorld.y,
        });
        const zone: PlanZone = {
          id: drag.id,
          label: 'Zone',
          ...rect,
          color: '#4caf50',
          opacity: 0.25,
        };
        dispatch({ type: 'gestureUpdate', doc: addZone(drag.baseDoc, zone) });
        break;
      }
      case 'draw': {
        const last = drag.points[drag.points.length - 1];
        const minSegment = 1.5 / viewportRef.current.scale; // avoid megapoint paths
        if (Math.hypot(world.x - last[0], world.y - last[1]) < minSegment) return;
        drag.points.push([world.x, world.y]);
        const path: PlanPath = {
          id: drag.id,
          points: [...drag.points],
          stroke: drawStroke.color,
          width: drawStroke.width,
        };
        dispatch({ type: 'gestureUpdate', doc: addPath(drag.baseDoc, path) });
        break;
      }
      default:
        break;
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    switch (drag.mode) {
      case 'maybeMove':
        // Plain click on an already-selected object: collapse selection to it (or its group)
        if (!drag.additive) {
          dispatch({ type: 'setSelection', selection: expandSelectionToGroups(doc, [drag.ref]) });
        }
        break;
      case 'move':
      case 'resize':
        dispatch({ type: 'gestureEnd' });
        break;
      case 'zone': {
        const world = clientToWorld(e.clientX, e.clientY);
        const w = Math.abs(world.x - drag.startWorld.x);
        const h = Math.abs(world.y - drag.startWorld.y);
        if (w < MIN_SIZE && h < MIN_SIZE) {
          dispatch({ type: 'gestureCancel' });
        } else {
          dispatch({ type: 'gestureEnd' });
          dispatch({ type: 'setSelection', selection: [{ kind: 'zone', id: drag.id }] });
          dispatch({ type: 'setTool', tool: 'select' });
        }
        break;
      }
      case 'draw':
        if (drag.points.length < 2) {
          dispatch({ type: 'gestureCancel' });
        } else {
          dispatch({ type: 'gestureEnd' });
        }
        break;
      case 'marquee': {
        if (marquee && (marquee.w > 0.5 || marquee.h > 0.5)) {
          const hits: SelectionRef[] = [];
          const collect = (kind: SelectionRef['kind'], list: { id: string }[]) => {
            for (const obj of list) {
              const bounds = objectBounds(doc, { kind, id: obj.id });
              if (bounds && rectsIntersect(marquee, bounds)) hits.push({ kind, id: obj.id });
            }
          };
          collect('element', doc.elements);
          collect('zone', doc.zones);
          collect('path', doc.paths);
          collect('label', doc.labels);
          collect('infoBlock', doc.infoBlocks);
          const expanded = expandSelectionToGroups(doc, hits);
          dispatch({
            type: 'setSelection',
            selection: e.shiftKey ? [...selection, ...expanded.filter((h) => !selection.some((s) => s.kind === h.kind && s.id === h.id))] : expanded,
          });
        }
        setMarquee(null);
        break;
      }
      default:
        break;
    }
  };

  // ── Grid ──────────────────────────────────────────────────────────────────

  const { planWidth, planHeight, grid } = doc.settings;
  const gridStyle = GRID_STYLES[grid.style ?? 'normal'];
  const gridLines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
  if (grid.visible) {
    const showMinor = grid.minor * viewport.scale >= 4;
    const step = showMinor ? grid.minor : grid.major;
    for (let x = 0; x <= planWidth + 0.001; x += step) {
      gridLines.push({ x1: x, y1: 0, x2: x, y2: planHeight, major: x % grid.major === 0 });
    }
    for (let y = 0; y <= planHeight + 0.001; y += step) {
      gridLines.push({ x1: 0, y1: y, x2: planWidth, y2: y, major: y % grid.major === 0 });
    }
  }

  // ── Selection overlay ─────────────────────────────────────────────────────

  const single = selection.length === 1 ? selection[0] : null;
  const singleRectRef =
    single && (single.kind === 'element' || single.kind === 'zone' || single.kind === 'infoBlock')
      ? single
      : null;
  const singleRect = singleRectRef ? (getObject(doc, singleRectRef) as unknown as Rect | undefined) : undefined;
  const handleSize = 9 / viewport.scale;

  const isSelected = (kind: SelectionRef['kind'], id: string) =>
    selection.some((s) => s.kind === kind && s.id === id);

  const cursor = pendingPlacement
    ? 'copy'
    : tool === 'pan' || spaceDown
      ? 'grab'
      : tool === 'draw'
        ? 'crosshair'
        : tool === 'zone' || tool === 'label'
          ? 'crosshair'
          : 'default';

  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const viewW = containerSize.w / viewport.scale;
  const viewH = containerSize.h / viewport.scale;

  return (
    <Box
      ref={containerRef}
      sx={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        bgcolor: '#eceff1',
        position: 'relative',
        touchAction: 'none',
      }}
    >
      <svg
        ref={svgRef}
        data-floorplan-svg
        width="100%"
        height="100%"
        viewBox={`${viewport.x} ${viewport.y} ${viewW} ${viewH}`}
        style={{ display: 'block', cursor }}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setGhost(null)}
        role="application"
        aria-label="Floorplan canvas"
      >
        {/* Plan area */}
        <rect x={0} y={0} width={planWidth} height={planHeight} fill="#fff" stroke="#90a4ae" strokeWidth={1} />

        {/* Grid */}
        {gridLines.map((line, i) => (
          <line
            key={i}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={line.major ? gridStyle.majorColor : gridStyle.minorColor}
            strokeWidth={(line.major ? gridStyle.majorWidth : gridStyle.minorWidth) / viewport.scale}
            opacity={gridStyle.opacity}
          />
        ))}

        {/* Zones under everything else */}
        {doc.zones.map((zone) => (
          <ZoneRow key={zone.id} zone={zone} selected={isSelected('zone', zone.id)} labelSettings={labelSettings} onObjectPointerDown={stableObjectPointerDown} />
        ))}

        {/* Elements */}
        {doc.elements.map((element) => (
          <ElementRow key={element.id} element={element} selected={isSelected('element', element.id)} labelSettings={labelSettings} imageHref={element.image != null ? assets?.get(element.image) : undefined} kindIndex={kindIndex} onObjectPointerDown={stableObjectPointerDown} />
        ))}

        {/* Freehand paths (with a wide invisible hit stroke) */}
        {doc.paths.map((path) => (
          <PathRow key={path.id} path={path} selected={isSelected('path', path.id)} hitWidth={Math.max(path.width, 12 / viewport.scale)} onObjectPointerDown={stableObjectPointerDown} />
        ))}

        {/* Labels */}
        {doc.labels.map((label) => (
          <LabelRow key={label.id} label={label} selected={isSelected('label', label.id)} onObjectPointerDown={stableObjectPointerDown} />
        ))}

        {/* Info blocks */}
        {doc.infoBlocks.map((block) => (
          <InfoBlockRow key={block.id} block={block} elements={doc.elements} selected={isSelected('infoBlock', block.id)} kindIndex={kindIndex} onObjectPointerDown={stableObjectPointerDown} />
        ))}

        {/* Editor-only overlays (stripped from PNG export) */}
        <g data-editor-overlay>
          {/* Selection outlines */}
          {selection.map((ref) => {
            const bounds = objectBounds(doc, ref);
            if (!bounds) return null;
            return (
              <rect
                key={`${ref.kind}:${ref.id}`}
                x={bounds.x - 1}
                y={bounds.y - 1}
                width={bounds.w + 2}
                height={bounds.h + 2}
                fill="none"
                stroke="#1565c0"
                strokeWidth={1.5 / viewport.scale}
                strokeDasharray={`${4 / viewport.scale} ${3 / viewport.scale}`}
                pointerEvents="none"
              />
            );
          })}

          {/* Resize handles for single rect selection */}
          {singleRectRef && singleRect && !readOnly && (
            <>
              {(['nw', 'ne', 'sw', 'se'] as HandleId[]).map((h) => {
                const hx = h === 'nw' || h === 'sw' ? singleRect.x : singleRect.x + singleRect.w;
                const hy = h === 'nw' || h === 'ne' ? singleRect.y : singleRect.y + singleRect.h;
                return (
                  <rect
                    key={h}
                    x={hx - handleSize / 2}
                    y={hy - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill="#fff"
                    stroke="#1565c0"
                    strokeWidth={1.2 / viewport.scale}
                    style={{ cursor: h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                    onPointerDown={(e) => onHandlePointerDown(e, singleRectRef, h)}
                  />
                );
              })}
            </>
          )}

          {/* Marquee */}
          {marquee && (
            <rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="#1565c0"
              fillOpacity={0.08}
              stroke="#1565c0"
              strokeWidth={1 / viewport.scale}
              pointerEvents="none"
            />
          )}

          {/* Placement ghost */}
          {pendingPlacement && ghost && (
            pendingPlacement.shape === 'circle' ? (
              <ellipse
                cx={ghost.x}
                cy={ghost.y}
                rx={pendingPlacement.w / 2}
                ry={pendingPlacement.h / 2}
                fill={pendingPlacement.color}
                fillOpacity={0.4}
                stroke={pendingPlacement.color}
                strokeWidth={1 / viewport.scale}
                strokeDasharray={`${4 / viewport.scale} ${3 / viewport.scale}`}
                pointerEvents="none"
              />
            ) : (
              <rect
                x={ghost.x - pendingPlacement.w / 2}
                y={ghost.y - pendingPlacement.h / 2}
                width={pendingPlacement.w}
                height={pendingPlacement.h}
                rx={pendingPlacement.cornerRadius || 0}
                fill={pendingPlacement.color}
                fillOpacity={0.4}
                stroke={pendingPlacement.color}
                strokeWidth={1 / viewport.scale}
                strokeDasharray={`${4 / viewport.scale} ${3 / viewport.scale}`}
                pointerEvents="none"
              />
            )
          )}
        </g>
      </svg>
    </Box>
  );
}

/** Info block helpers reused by the page (placement of new blocks). */
export function defaultInfoBlock(type: PlanInfoBlock['type'], at: Point): PlanInfoBlock {
  const sizes: Record<PlanInfoBlock['type'], { w: number; h: number }> = {
    titleBlock: { w: 140, h: 48 },
    notes: { w: 120, h: 90 },
    legend: { w: 110, h: 110 },
    northArrow: { w: 36, h: 36 },
    scaleBar: { w: 140, h: 36 },
  };
  const props: Record<PlanInfoBlock['type'], Record<string, unknown>> = {
    titleBlock: { title: 'Untitled plan', subtitle: '', date: new Date().toLocaleDateString() },
    notes: { text: 'Notes…' },
    legend: {},
    northArrow: { rotation: 0 },
    scaleBar: { length: 120 },
  };
  return { id: newId('ib'), type, x: at.x, y: at.y, ...sizes[type], props: props[type] };
}

export { collectionKeyFor };
