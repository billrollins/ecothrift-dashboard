import type {
  PlanConfigMeta,
  PlanDocument,
  PlanElement,
  PlanInfoBlock,
  PlanLabel,
  PlanLayers,
  PlanObjectKind,
  PlanPath,
  PlanZone,
} from '../../types/floorplan.types';
import { pathBounds, rawRectFromVisual, rotatedBounds, type Rect } from './geometry';

export type Tool = 'select' | 'pan' | 'zone' | 'draw' | 'label';

export interface SelectionRef {
  kind: PlanObjectKind;
  id: string;
}

export interface EditorState {
  doc: PlanDocument;
  selection: SelectionRef[];
  tool: Tool;
  /** True when doc differs from the last saved snapshot */
  dirty: boolean;
  past: PlanDocument[];
  future: PlanDocument[];
  /** Snapshot at the start of an in-flight drag gesture (not yet in history) */
  gestureBase: PlanDocument | null;
}

const HISTORY_LIMIT = 100;

export type EditorAction =
  | { type: 'load'; doc: PlanDocument }
  | { type: 'markSaved' }
  /** Replace the doc as a single undoable step */
  | { type: 'commit'; doc: PlanDocument }
  /** Transient doc update during a gesture (drag/resize/draw); not undoable itself */
  | { type: 'gestureUpdate'; doc: PlanDocument }
  | { type: 'gestureStart' }
  /** Finish a gesture; pushes the gesture base onto the undo stack if the doc changed */
  | { type: 'gestureEnd' }
  | { type: 'gestureCancel' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'setTool'; tool: Tool }
  | { type: 'setSelection'; selection: SelectionRef[] };

export function initialEditorState(doc: PlanDocument): EditorState {
  return {
    doc,
    selection: [],
    tool: 'select',
    dirty: false,
    past: [],
    future: [],
    gestureBase: null,
  };
}

function pushHistory(past: PlanDocument[], doc: PlanDocument): PlanDocument[] {
  const next = [...past, doc];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load':
      return initialEditorState(action.doc);

    case 'markSaved':
      return { ...state, dirty: false };

    case 'commit':
      if (action.doc === state.doc) return state;
      return {
        ...state,
        doc: action.doc,
        past: pushHistory(state.past, state.doc),
        future: [],
        dirty: true,
      };

    case 'gestureStart':
      return { ...state, gestureBase: state.doc };

    case 'gestureUpdate':
      return { ...state, doc: action.doc };

    case 'gestureEnd': {
      if (!state.gestureBase) return state;
      if (state.gestureBase === state.doc) return { ...state, gestureBase: null };
      return {
        ...state,
        past: pushHistory(state.past, state.gestureBase),
        future: [],
        dirty: true,
        gestureBase: null,
      };
    }

    case 'gestureCancel':
      if (!state.gestureBase) return state;
      return { ...state, doc: state.gestureBase, gestureBase: null };

    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        dirty: true,
        selection: pruneSelection(state.selection, previous),
      };
    }

    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        ...state,
        doc: next,
        past: pushHistory(state.past, state.doc),
        future: rest,
        dirty: true,
        selection: pruneSelection(state.selection, next),
      };
    }

    case 'setTool':
      return { ...state, tool: action.tool, selection: action.tool === 'select' ? state.selection : [] };

    case 'setSelection':
      return { ...state, selection: action.selection };

    default:
      return state;
  }
}

// ── Document helpers (pure) ──────────────────────────────────────────────────

const COLLECTION_FOR_KIND: Record<PlanObjectKind, keyof PlanDocument> = {
  element: 'elements',
  zone: 'zones',
  path: 'paths',
  label: 'labels',
  infoBlock: 'infoBlocks',
};

export function collectionKeyFor(kind: PlanObjectKind): 'elements' | 'zones' | 'paths' | 'labels' | 'infoBlocks' {
  return COLLECTION_FOR_KIND[kind] as 'elements' | 'zones' | 'paths' | 'labels' | 'infoBlocks';
}

function pruneSelection(selection: SelectionRef[], doc: PlanDocument): SelectionRef[] {
  return selection.filter((ref) => {
    const list = doc[collectionKeyFor(ref.kind)] as { id: string }[];
    return list.some((o) => o.id === ref.id);
  });
}

let idCounter = 0;

export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function getObject(doc: PlanDocument, ref: SelectionRef) {
  const list = doc[collectionKeyFor(ref.kind)] as { id: string }[];
  return list.find((o) => o.id === ref.id);
}

/** Immutably patch one object identified by ref. */
export function updateObject<T extends object>(
  doc: PlanDocument,
  ref: SelectionRef,
  patch: Partial<T>,
): PlanDocument {
  const key = collectionKeyFor(ref.kind);
  const list = doc[key] as { id: string }[];
  const idx = list.findIndex((o) => o.id === ref.id);
  if (idx === -1) return doc;
  const nextList = [...list];
  nextList[idx] = { ...nextList[idx], ...patch };
  return { ...doc, [key]: nextList };
}

export function deleteObjects(doc: PlanDocument, refs: SelectionRef[]): PlanDocument {
  if (refs.length === 0) return doc;
  const byKind = new Map<PlanObjectKind, Set<string>>();
  for (const ref of refs) {
    if (!byKind.has(ref.kind)) byKind.set(ref.kind, new Set());
    byKind.get(ref.kind)!.add(ref.id);
  }
  let next = doc;
  for (const [kind, ids] of byKind) {
    const key = collectionKeyFor(kind);
    const list = next[key] as { id: string }[];
    next = { ...next, [key]: list.filter((o) => !ids.has(o.id)) };
  }
  return next;
}

export function addElement(doc: PlanDocument, element: PlanElement): PlanDocument {
  return { ...doc, elements: [...doc.elements, element] };
}

export function addZone(doc: PlanDocument, zone: PlanZone): PlanDocument {
  return { ...doc, zones: [...doc.zones, zone] };
}

export function addPath(doc: PlanDocument, path: PlanPath): PlanDocument {
  return { ...doc, paths: [...doc.paths, path] };
}

export function addLabel(doc: PlanDocument, label: PlanLabel): PlanDocument {
  return { ...doc, labels: [...doc.labels, label] };
}

export function addInfoBlock(doc: PlanDocument, block: PlanInfoBlock): PlanDocument {
  return { ...doc, infoBlocks: [...doc.infoBlocks, block] };
}

/**
 * Deep-copy the referenced objects into the document with fresh ids, offset by
 * (dx, dy). Group ids are remapped so pasted copies form their own group(s).
 */
export function cloneObjects(
  doc: PlanDocument,
  refs: SelectionRef[],
  dx: number,
  dy: number,
): { doc: PlanDocument; newRefs: SelectionRef[] } {
  const groupMap = new Map<string, string>();
  const remapGroup = (group?: string): string | undefined => {
    if (!group) return undefined;
    if (!groupMap.has(group)) groupMap.set(group, newId('gr'));
    return groupMap.get(group);
  };

  let next = doc;
  const newRefs: SelectionRef[] = [];
  for (const ref of refs) {
    const source = getObject(doc, ref);
    if (!source) continue;
    const copy = JSON.parse(JSON.stringify(source)) as Record<string, unknown> & { id: string };
    copy.id = newId(ref.kind === 'infoBlock' ? 'ib' : ref.kind.slice(0, 2));
    const remapped = remapGroup((source as { group?: string }).group);
    if (remapped) copy.group = remapped;
    else delete copy.group;

    if (ref.kind === 'path') {
      const path = copy as unknown as PlanPath;
      path.points = path.points.map(([x, y]) => [x + dx, y + dy] as [number, number]);
    } else {
      const rectish = copy as unknown as { x: number; y: number };
      rectish.x += dx;
      rectish.y += dy;
    }

    const key = collectionKeyFor(ref.kind);
    next = { ...next, [key]: [...(next[key] as object[]), copy] };
    newRefs.push({ kind: ref.kind, id: copy.id });
  }
  return { doc: next, newRefs };
}

/** Assign a shared group id to all referenced objects. Returns the group id. */
export function groupObjects(doc: PlanDocument, refs: SelectionRef[]): { doc: PlanDocument; groupId: string } {
  const groupId = newId('gr');
  let next = doc;
  for (const ref of refs) {
    next = updateObject(next, ref, { group: groupId });
  }
  return { doc: next, groupId };
}

/** Clear the group id on all referenced objects. */
export function ungroupObjects(doc: PlanDocument, refs: SelectionRef[]): PlanDocument {
  let next = doc;
  for (const ref of refs) {
    next = updateObject(next, ref, { group: undefined });
  }
  return next;
}

const ALL_KINDS: PlanObjectKind[] = ['element', 'zone', 'path', 'label', 'infoBlock'];

/**
 * Expand a selection so that if any member of a group is included, all
 * members of that group are included.
 */
export function expandSelectionToGroups(doc: PlanDocument, refs: SelectionRef[]): SelectionRef[] {
  const groups = new Set<string>();
  for (const ref of refs) {
    const obj = getObject(doc, ref) as { group?: string } | undefined;
    if (obj?.group) groups.add(obj.group);
  }
  if (groups.size === 0) return refs;

  const result: SelectionRef[] = [...refs];
  const seen = new Set(refs.map((r) => `${r.kind}:${r.id}`));
  for (const kind of ALL_KINDS) {
    const list = doc[collectionKeyFor(kind)] as { id: string; group?: string }[];
    for (const obj of list) {
      if (obj.group && groups.has(obj.group) && !seen.has(`${kind}:${obj.id}`)) {
        seen.add(`${kind}:${obj.id}`);
        result.push({ kind, id: obj.id });
      }
    }
  }
  return result;
}

/** True when every referenced object shares one common group id. */
export function selectionIsGrouped(doc: PlanDocument, refs: SelectionRef[]): boolean {
  if (refs.length === 0) return false;
  let shared: string | undefined;
  for (const ref of refs) {
    const obj = getObject(doc, ref) as { group?: string } | undefined;
    if (!obj?.group) return false;
    if (shared === undefined) shared = obj.group;
    else if (obj.group !== shared) return false;
  }
  return true;
}

/**
 * Rotate all referenced objects 90° clockwise as one rigid unit about the
 * center of their combined bounding box. Elements keep their own w/h and get
 * their `rotation` bumped; zones/info blocks swap w/h; paths and label anchor
 * points are rotated point-wise.
 */
export function rotateObjects90(doc: PlanDocument, refs: SelectionRef[]): PlanDocument {
  if (refs.length === 0) return doc;

  // Combined bounds (visual footprints)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (x0: number, y0: number, x1: number, y1: number) => {
    if (x0 < minX) minX = x0;
    if (y0 < minY) minY = y0;
    if (x1 > maxX) maxX = x1;
    if (y1 > maxY) maxY = y1;
  };
  for (const ref of refs) {
    const obj = getObject(doc, ref);
    if (!obj) continue;
    if (ref.kind === 'path') {
      for (const [x, y] of (obj as PlanPath).points) extend(x, y, x, y);
    } else if (ref.kind === 'label') {
      const l = obj as unknown as { x: number; y: number };
      extend(l.x, l.y, l.x, l.y);
    } else if (ref.kind === 'element') {
      const el = obj as PlanElement;
      const rot = ((el.rotation % 360) + 360) % 360;
      const swap = rot === 90 || rot === 270;
      const cx = el.x + el.w / 2;
      const cy = el.y + el.h / 2;
      const hw = (swap ? el.h : el.w) / 2;
      const hh = (swap ? el.w : el.h) / 2;
      extend(cx - hw, cy - hh, cx + hw, cy + hh);
    } else {
      const r = obj as unknown as { x: number; y: number; w: number; h: number };
      extend(r.x, r.y, r.x + r.w, r.y + r.h);
    }
  }
  if (!Number.isFinite(minX)) return doc;
  const px = (minX + maxX) / 2;
  const py = (minY + maxY) / 2;

  // 90° clockwise in y-down coordinates: (dx, dy) → (-dy, dx)
  const rotPoint = (x: number, y: number): [number, number] => [px - (y - py), py + (x - px)];

  let next = doc;
  for (const ref of refs) {
    const obj = getObject(next, ref);
    if (!obj) continue;
    if (ref.kind === 'path') {
      const path = obj as PlanPath;
      next = updateObject<PlanPath>(next, ref, {
        points: path.points.map(([x, y]) => rotPoint(x, y)),
      });
    } else if (ref.kind === 'label') {
      const l = obj as unknown as { x: number; y: number };
      const [nx, ny] = rotPoint(l.x, l.y);
      next = updateObject(next, ref, { x: nx, y: ny });
    } else if (ref.kind === 'element') {
      const el = obj as PlanElement;
      const [ncx, ncy] = rotPoint(el.x + el.w / 2, el.y + el.h / 2);
      next = updateObject<PlanElement>(next, ref, {
        x: ncx - el.w / 2,
        y: ncy - el.h / 2,
        rotation: (el.rotation + 90) % 360,
      });
    } else {
      const r = obj as unknown as { x: number; y: number; w: number; h: number };
      const [ncx, ncy] = rotPoint(r.x + r.w / 2, r.y + r.h / 2);
      // Rects without a rotation field rotate by swapping their footprint
      next = updateObject(next, ref, {
        x: ncx - r.h / 2,
        y: ncy - r.w / 2,
        w: r.h,
        h: r.w,
      });
    }
  }
  return next;
}

/**
 * On-floor (visual) bounding box of any object — elements account for their
 * rotation, labels use the same width heuristic as the canvas overlay.
 */
export function visualBounds(doc: PlanDocument, ref: SelectionRef): Rect | null {
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

export type AlignMode = 'left' | 'centerH' | 'right' | 'top' | 'middleV' | 'bottom';

/**
 * Align the visual bounds of all referenced objects (translation only, so
 * element rotation and path shapes are preserved). Needs ≥ 2 objects.
 */
export function alignObjects(doc: PlanDocument, refs: SelectionRef[], mode: AlignMode): PlanDocument {
  const items = refs
    .map((ref) => ({ ref, bounds: visualBounds(doc, ref) }))
    .filter((it): it is { ref: SelectionRef; bounds: Rect } => it.bounds != null);
  if (items.length < 2) return doc;

  const minX = Math.min(...items.map((it) => it.bounds.x));
  const maxX = Math.max(...items.map((it) => it.bounds.x + it.bounds.w));
  const minY = Math.min(...items.map((it) => it.bounds.y));
  const maxY = Math.max(...items.map((it) => it.bounds.y + it.bounds.h));

  let next = doc;
  for (const { ref, bounds } of items) {
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case 'left': dx = minX - bounds.x; break;
      case 'centerH': dx = (minX + maxX) / 2 - (bounds.x + bounds.w / 2); break;
      case 'right': dx = maxX - (bounds.x + bounds.w); break;
      case 'top': dy = minY - bounds.y; break;
      case 'middleV': dy = (minY + maxY) / 2 - (bounds.y + bounds.h / 2); break;
      case 'bottom': dy = maxY - (bounds.y + bounds.h); break;
    }
    if (dx !== 0 || dy !== 0) next = moveObjects(next, [ref], dx, dy);
  }
  return next;
}

/**
 * Distribute the referenced objects along an axis with equal gaps between
 * their visual bounds. The outermost objects stay put. Needs ≥ 3 objects.
 */
export function distributeObjects(doc: PlanDocument, refs: SelectionRef[], axis: 'h' | 'v'): PlanDocument {
  const items = refs
    .map((ref) => ({ ref, bounds: visualBounds(doc, ref) }))
    .filter((it): it is { ref: SelectionRef; bounds: Rect } => it.bounds != null);
  if (items.length < 3) return doc;

  const pos = (b: Rect) => (axis === 'h' ? b.x : b.y);
  const size = (b: Rect) => (axis === 'h' ? b.w : b.h);
  const sorted = [...items].sort((a, b) => (pos(a.bounds) + size(a.bounds) / 2) - (pos(b.bounds) + size(b.bounds) / 2));

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = pos(last.bounds) + size(last.bounds) - pos(first.bounds);
  const totalSize = sorted.reduce((sum, it) => sum + size(it.bounds), 0);
  const gap = (span - totalSize) / (sorted.length - 1);

  let next = doc;
  let cursor = pos(first.bounds) + size(first.bounds) + gap;
  for (const it of sorted.slice(1, -1)) {
    const delta = cursor - pos(it.bounds);
    if (delta !== 0) {
      next = moveObjects(next, [it.ref], axis === 'h' ? delta : 0, axis === 'h' ? 0 : delta);
    }
    cursor += size(it.bounds) + gap;
  }
  return next;
}

/**
 * Rotate each referenced object 90° clockwise IN PLACE about its own center
 * (unlike rotateObjects90, which rotates the selection as one rigid unit).
 * Text labels have no rotation and are left untouched.
 */
export function rotateObjectsEachInPlace(doc: PlanDocument, refs: SelectionRef[]): PlanDocument {
  let next = doc;
  for (const ref of refs) {
    const obj = getObject(next, ref);
    if (!obj) continue;
    if (ref.kind === 'element') {
      const el = obj as PlanElement;
      next = updateObject<PlanElement>(next, ref, { rotation: (el.rotation + 90) % 360 });
    } else if (ref.kind === 'zone' || ref.kind === 'infoBlock') {
      const r = obj as unknown as Rect;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      next = updateObject(next, ref, { x: cx - r.h / 2, y: cy - r.w / 2, w: r.h, h: r.w });
    } else if (ref.kind === 'path') {
      const path = obj as PlanPath;
      const b = pathBounds(path.points);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      next = updateObject<PlanPath>(next, ref, {
        points: path.points.map(([x, y]) => [cx - (y - cy), cy + (x - cx)] as [number, number]),
      });
    }
  }
  return next;
}

/**
 * Mirror the referenced objects across the selection's center line. Elements
 * toggle their content flip flag (rotation-aware: mirroring a 90°-rotated
 * element across a vertical axis mirrors its pre-rotation vertical content);
 * paths mirror point-wise; other objects just move to the mirrored position.
 */
export function flipObjects(doc: PlanDocument, refs: SelectionRef[], axis: 'h' | 'v'): PlanDocument {
  const items = refs
    .map((ref) => ({ ref, bounds: visualBounds(doc, ref) }))
    .filter((it): it is { ref: SelectionRef; bounds: Rect } => it.bounds != null);
  if (items.length === 0) return doc;

  const minX = Math.min(...items.map((it) => it.bounds.x));
  const maxX = Math.max(...items.map((it) => it.bounds.x + it.bounds.w));
  const minY = Math.min(...items.map((it) => it.bounds.y));
  const maxY = Math.max(...items.map((it) => it.bounds.y + it.bounds.h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  let next = doc;
  for (const { ref, bounds } of items) {
    const dx = axis === 'h' ? 2 * cx - (bounds.x + bounds.w) - bounds.x : 0;
    const dy = axis === 'v' ? 2 * cy - (bounds.y + bounds.h) - bounds.y : 0;

    if (ref.kind === 'path') {
      const path = getObject(next, ref) as PlanPath;
      next = updateObject<PlanPath>(next, ref, {
        points: path.points.map(([x, y]) =>
          (axis === 'h' ? [2 * cx - x, y] : [x, 2 * cy - y]) as [number, number]),
      });
      continue;
    }
    if (dx !== 0 || dy !== 0) next = moveObjects(next, [ref], dx, dy);
    if (ref.kind === 'element') {
      const el = getObject(next, ref) as PlanElement;
      const rot = ((el.rotation % 360) + 360) % 360;
      const swapAxes = rot === 90 || rot === 270;
      const flipContentH = axis === 'h' ? !swapAxes : swapAxes;
      next = updateObject<PlanElement>(
        next,
        ref,
        flipContentH
          ? { flipH: el.flipH ? undefined : true }
          : { flipV: el.flipV ? undefined : true },
      );
    }
  }
  return next;
}

/**
 * Scale the referenced objects' visual bounds about `origin` by (sx, sy).
 * Wall-like thin elements (aspect ratio ≥ 3) keep their thin dimension —
 * scaling a room outline lengthens the walls without fattening them.
 */
export function scaleObjects(
  doc: PlanDocument,
  refs: SelectionRef[],
  origin: { x: number; y: number },
  sx: number,
  sy: number,
  minSize = 2,
): PlanDocument {
  const mapX = (x: number) => origin.x + (x - origin.x) * sx;
  const mapY = (y: number) => origin.y + (y - origin.y) * sy;

  let next = doc;
  for (const ref of refs) {
    const obj = getObject(next, ref);
    if (!obj) continue;
    if (ref.kind === 'path') {
      const path = obj as PlanPath;
      next = updateObject<PlanPath>(next, ref, {
        points: path.points.map(([x, y]) => [mapX(x), mapY(y)] as [number, number]),
      });
      continue;
    }
    if (ref.kind === 'label') {
      const label = obj as PlanLabel;
      next = updateObject(next, ref, { x: mapX(label.x), y: mapY(label.y) });
      continue;
    }
    const bounds = visualBounds(next, ref);
    if (!bounds) continue;
    let w = Math.max(minSize, bounds.w * sx);
    let h = Math.max(minSize, bounds.h * sy);
    if (ref.kind === 'element') {
      const thin = Math.max(bounds.w, bounds.h) / Math.max(1, Math.min(bounds.w, bounds.h)) >= 3;
      if (thin) {
        // Preserve the depth of wall-like elements; only their length scales.
        if (bounds.w <= bounds.h) w = bounds.w;
        else h = bounds.h;
      }
    }
    // Anchor each object by its scaled center so the arrangement stays true
    const centerX = mapX(bounds.x + bounds.w / 2);
    const centerY = mapY(bounds.y + bounds.h / 2);
    const nextVisual: Rect = { x: centerX - w / 2, y: centerY - h / 2, w, h };
    if (ref.kind === 'element') {
      const rotation = (obj as PlanElement).rotation;
      next = updateObject(next, ref, rawRectFromVisual(nextVisual, rotation));
    } else {
      next = updateObject(next, ref, nextVisual);
    }
  }
  return next;
}

// ── Locked (inert) objects ───────────────────────────────────────────────────

export function setObjectsLocked(doc: PlanDocument, refs: SelectionRef[], locked: boolean): PlanDocument {
  let next = doc;
  for (const ref of refs) {
    next = updateObject(next, ref, { locked: locked || undefined });
  }
  return next;
}

export interface LockedObjectInfo {
  ref: SelectionRef;
  /** Human-readable description for the unlock list */
  label: string;
}

export function listLockedObjects(doc: PlanDocument): LockedObjectInfo[] {
  const out: LockedObjectInfo[] = [];
  for (const el of doc.elements) {
    if (el.locked) out.push({ ref: { kind: 'element', id: el.id }, label: el.label || el.kind });
  }
  for (const zone of doc.zones) {
    if (zone.locked) out.push({ ref: { kind: 'zone', id: zone.id }, label: `Zone: ${zone.label || 'untitled'}` });
  }
  for (const path of doc.paths) {
    if (path.locked) out.push({ ref: { kind: 'path', id: path.id }, label: `Drawing (${path.points.length} pts)` });
  }
  for (const label of doc.labels) {
    if (label.locked) out.push({ ref: { kind: 'label', id: label.id }, label: `Label: ${label.text.slice(0, 24)}` });
  }
  for (const block of doc.infoBlocks) {
    if (block.locked) out.push({ ref: { kind: 'infoBlock', id: block.id }, label: `Info: ${block.type}` });
  }
  return out;
}

export function isObjectLocked(doc: PlanDocument, ref: SelectionRef): boolean {
  return Boolean((getObject(doc, ref) as { locked?: boolean } | undefined)?.locked);
}

// ── Layout configurations (tabs) ─────────────────────────────────────────────

const LAYER_KEYS = ['elements', 'zones', 'paths', 'labels', 'infoBlocks'] as const;

function extractLayers(doc: PlanDocument): PlanLayers {
  return {
    elements: doc.elements,
    zones: doc.zones,
    paths: doc.paths,
    labels: doc.labels,
    infoBlocks: doc.infoBlocks,
  };
}

function cloneLayers(layers: PlanLayers): PlanLayers {
  return JSON.parse(JSON.stringify(layers)) as PlanLayers;
}

function emptyLayers(): PlanLayers {
  return { elements: [], zones: [], paths: [], labels: [], infoBlocks: [] };
}

/** Tab metadata; docs without configs behave as one implicit config. */
export function configMetas(doc: PlanDocument): PlanConfigMeta[] {
  return doc.settings.configs?.length ? doc.settings.configs : [{ id: 'cfg_default', name: '1' }];
}

export function activeConfigId(doc: PlanDocument): string {
  return doc.settings.activeConfigId ?? configMetas(doc)[0].id;
}

/** Materialize the implicit single config so config operations have ids to work with. */
function ensureConfigs(doc: PlanDocument): PlanDocument {
  if (doc.settings.configs?.length) return doc;
  const metas = configMetas(doc);
  return { ...doc, settings: { ...doc.settings, configs: metas, activeConfigId: metas[0].id } };
}

/** Add a new configuration (duplicating the current layout) and switch to it. */
export function addConfig(doc: PlanDocument, name?: string, duplicate = true): PlanDocument {
  const base = ensureConfigs(doc);
  const metas = base.settings.configs!;
  const meta: PlanConfigMeta = { id: newId('cfg'), name: (name ?? '').trim() || String(metas.length + 1) };
  const currentId = activeConfigId(base);
  // Stash the current layout, then make the new config active. New ids for
  // duplicated objects so the two configs never share object identity.
  const stashed = { ...(base.configStore ?? {}), [currentId]: extractLayers(base) };
  const newLayers = duplicate ? remapLayerIds(cloneLayers(extractLayers(base))) : emptyLayers();
  return {
    ...base,
    ...newLayers,
    configStore: stashed,
    settings: { ...base.settings, configs: [...metas, meta], activeConfigId: meta.id },
  };
}

function remapLayerIds(layers: PlanLayers): PlanLayers {
  const groupMap = new Map<string, string>();
  const remapGroup = (group?: string): string | undefined => {
    if (!group) return undefined;
    if (!groupMap.has(group)) groupMap.set(group, newId('gr'));
    return groupMap.get(group);
  };
  const remap = <T extends { id: string; group?: string }>(list: T[], prefix: string): T[] =>
    list.map((obj) => {
      const copy = { ...obj, id: newId(prefix) };
      const group = remapGroup(obj.group);
      if (group) copy.group = group;
      else delete copy.group;
      return copy;
    });
  return {
    elements: remap(layers.elements, 'el'),
    zones: remap(layers.zones, 'zn'),
    paths: remap(layers.paths, 'pa'),
    labels: remap(layers.labels, 'lb'),
    infoBlocks: remap(layers.infoBlocks, 'ib'),
  };
}

/** Switch the active configuration (no-op for unknown/current ids). */
export function switchConfig(doc: PlanDocument, id: string): PlanDocument {
  const base = ensureConfigs(doc);
  const currentId = activeConfigId(base);
  if (id === currentId) return doc;
  if (!base.settings.configs!.some((c) => c.id === id)) return doc;
  const store = { ...(base.configStore ?? {}) };
  const incoming = store[id] ?? emptyLayers();
  delete store[id];
  store[currentId] = extractLayers(base);
  return {
    ...base,
    ...incoming,
    configStore: store,
    settings: { ...base.settings, activeConfigId: id },
  };
}

export function renameConfig(doc: PlanDocument, id: string, name: string): PlanDocument {
  const base = ensureConfigs(doc);
  const trimmed = name.trim();
  if (!trimmed) return doc;
  return {
    ...base,
    settings: {
      ...base.settings,
      configs: base.settings.configs!.map((c) => (c.id === id ? { ...c, name: trimmed.slice(0, 20) } : c)),
    },
  };
}

/** Delete a configuration (never the last one); switches away first if active. */
export function deleteConfig(doc: PlanDocument, id: string): PlanDocument {
  const base = ensureConfigs(doc);
  const metas = base.settings.configs!;
  if (metas.length <= 1 || !metas.some((c) => c.id === id)) return doc;
  let next = base;
  if (activeConfigId(base) === id) {
    const fallback = metas.find((c) => c.id !== id)!;
    next = switchConfig(base, fallback.id);
  }
  const store = { ...(next.configStore ?? {}) };
  delete store[id];
  return {
    ...next,
    configStore: store,
    settings: { ...next.settings, configs: next.settings.configs!.filter((c) => c.id !== id) },
  };
}

/** Total object count across the active layout and every stored config. */
export function totalObjectCount(doc: PlanDocument): number {
  const layerCount = (layers: PlanLayers) => LAYER_KEYS.reduce((sum, key) => sum + layers[key].length, 0);
  let total = layerCount(extractLayers(doc));
  for (const layers of Object.values(doc.configStore ?? {})) total += layerCount(layers);
  return total;
}

/** Translate all selected objects by (dx, dy) inches. */
export function moveObjects(doc: PlanDocument, refs: SelectionRef[], dx: number, dy: number): PlanDocument {
  let next = doc;
  for (const ref of refs) {
    if (ref.kind === 'path') {
      const path = getObject(next, ref) as PlanPath | undefined;
      if (!path) continue;
      next = updateObject<PlanPath>(next, ref, {
        points: path.points.map(([x, y]) => [x + dx, y + dy] as [number, number]),
      });
    } else {
      const obj = getObject(next, ref) as { x: number; y: number } | undefined;
      if (!obj) continue;
      next = updateObject(next, ref, { x: obj.x + dx, y: obj.y + dy });
    }
  }
  return next;
}
