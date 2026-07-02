import type {
  PlanDocument,
  PlanElement,
  PlanInfoBlock,
  PlanLabel,
  PlanObjectKind,
  PlanPath,
  PlanZone,
} from '../../types/floorplan.types';

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
