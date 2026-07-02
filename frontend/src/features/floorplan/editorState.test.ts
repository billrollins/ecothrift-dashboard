import { describe, expect, it } from 'vitest';
import type { PlanDocument, PlanElement } from '../../types/floorplan.types';
import {
  addElement,
  alignObjects,
  cloneObjects,
  deleteObjects,
  distributeObjects,
  editorReducer,
  expandSelectionToGroups,
  groupObjects,
  initialEditorState,
  moveObjects,
  rotateObjects90,
  selectionIsGrouped,
  ungroupObjects,
  updateObject,
  type EditorState,
} from './editorState';

function emptyDoc(): PlanDocument {
  return {
    schema_version: 1,
    settings: { planWidth: 1200, planHeight: 720, grid: { visible: true, minor: 6, major: 12 }, snap: 1 },
    elements: [],
    zones: [],
    paths: [],
    labels: [],
    infoBlocks: [],
  };
}

function el(id: string, x = 0, y = 0): PlanElement {
  return { id, kind: 'gondola', x, y, w: 48, h: 144, rotation: 0, label: '', active: true };
}

describe('editorReducer undo/redo', () => {
  it('commit pushes history and marks dirty', () => {
    let state = initialEditorState(emptyDoc());
    expect(state.dirty).toBe(false);
    state = editorReducer(state, { type: 'commit', doc: addElement(state.doc, el('a')) });
    expect(state.doc.elements).toHaveLength(1);
    expect(state.past).toHaveLength(1);
    expect(state.dirty).toBe(true);
  });

  it('undo/redo restores documents exactly', () => {
    let state = initialEditorState(emptyDoc());
    const doc0 = state.doc;
    state = editorReducer(state, { type: 'commit', doc: addElement(state.doc, el('a')) });
    const doc1 = state.doc;
    state = editorReducer(state, { type: 'commit', doc: addElement(state.doc, el('b')) });

    state = editorReducer(state, { type: 'undo' });
    expect(state.doc).toBe(doc1);
    state = editorReducer(state, { type: 'undo' });
    expect(state.doc).toBe(doc0);
    expect(editorReducer(state, { type: 'undo' }).doc).toBe(doc0); // no-op at floor

    state = editorReducer(state, { type: 'redo' });
    expect(state.doc).toBe(doc1);
  });

  it('a new commit clears the redo stack', () => {
    let state = initialEditorState(emptyDoc());
    state = editorReducer(state, { type: 'commit', doc: addElement(state.doc, el('a')) });
    state = editorReducer(state, { type: 'undo' });
    state = editorReducer(state, { type: 'commit', doc: addElement(state.doc, el('c')) });
    expect(state.future).toHaveLength(0);
  });

  it('undo prunes selection of deleted objects', () => {
    let state = initialEditorState(emptyDoc());
    state = editorReducer(state, { type: 'commit', doc: addElement(state.doc, el('a')) });
    state = editorReducer(state, { type: 'setSelection', selection: [{ kind: 'element', id: 'a' }] });
    state = editorReducer(state, { type: 'undo' });
    expect(state.selection).toHaveLength(0);
  });
});

describe('gesture lifecycle', () => {
  function withOneElement(): EditorState {
    let state = initialEditorState(emptyDoc());
    state = editorReducer(state, { type: 'commit', doc: addElement(state.doc, el('a', 10, 10)) });
    return state;
  }

  it('a drag gesture is a single undo step', () => {
    let state = withOneElement();
    const beforeDrag = state.doc;
    state = editorReducer(state, { type: 'gestureStart' });
    // several transient updates
    for (const dx of [1, 2, 3, 4, 5]) {
      state = editorReducer(state, {
        type: 'gestureUpdate',
        doc: moveObjects(beforeDrag, [{ kind: 'element', id: 'a' }], dx, 0),
      });
    }
    state = editorReducer(state, { type: 'gestureEnd' });
    expect((state.doc.elements[0]).x).toBe(15);

    state = editorReducer(state, { type: 'undo' });
    expect(state.doc).toBe(beforeDrag);
  });

  it('gestureCancel restores the base document', () => {
    let state = withOneElement();
    const base = state.doc;
    state = editorReducer(state, { type: 'gestureStart' });
    state = editorReducer(state, {
      type: 'gestureUpdate',
      doc: moveObjects(base, [{ kind: 'element', id: 'a' }], 99, 99),
    });
    state = editorReducer(state, { type: 'gestureCancel' });
    expect(state.doc).toBe(base);
  });

  it('a no-op gesture adds no history', () => {
    let state = withOneElement();
    const pastLen = state.past.length;
    state = editorReducer(state, { type: 'gestureStart' });
    state = editorReducer(state, { type: 'gestureEnd' });
    expect(state.past).toHaveLength(pastLen);
  });
});

describe('document helpers', () => {
  it('updateObject patches immutably', () => {
    const doc = addElement(emptyDoc(), el('a', 5, 5));
    const next = updateObject<PlanElement>(doc, { kind: 'element', id: 'a' }, { x: 42 });
    expect(next.elements[0].x).toBe(42);
    expect(doc.elements[0].x).toBe(5);
  });

  it('deleteObjects removes across collections', () => {
    let doc = addElement(emptyDoc(), el('a'));
    doc = { ...doc, labels: [{ id: 'l1', text: 'hi', x: 0, y: 0, fontSize: 12, color: '#000' }] };
    const next = deleteObjects(doc, [
      { kind: 'element', id: 'a' },
      { kind: 'label', id: 'l1' },
    ]);
    expect(next.elements).toHaveLength(0);
    expect(next.labels).toHaveLength(0);
  });

  it('moveObjects translates paths point-wise', () => {
    const doc: PlanDocument = {
      ...emptyDoc(),
      paths: [{ id: 'p1', points: [[0, 0], [10, 5]], stroke: '#000', width: 2 }],
    };
    const next = moveObjects(doc, [{ kind: 'path', id: 'p1' }], 3, -2);
    expect(next.paths[0].points).toEqual([[3, -2], [13, 3]]);
  });
});

describe('cloneObjects', () => {
  function docWithMixed(): PlanDocument {
    let doc = addElement(emptyDoc(), el('a', 10, 20));
    doc = {
      ...doc,
      paths: [{ id: 'p1', points: [[0, 0], [10, 5]], stroke: '#000', width: 2 }],
      labels: [{ id: 'l1', text: 'hi', x: 5, y: 6, fontSize: 12, color: '#000' }],
    };
    return doc;
  }

  it('creates copies with fresh ids, offset, leaving the source untouched', () => {
    const doc = docWithMixed();
    const { doc: next, newRefs } = cloneObjects(doc, [
      { kind: 'element', id: 'a' },
      { kind: 'path', id: 'p1' },
      { kind: 'label', id: 'l1' },
    ], 12, 12);

    expect(newRefs).toHaveLength(3);
    expect(next.elements).toHaveLength(2);
    expect(next.paths).toHaveLength(2);
    expect(next.labels).toHaveLength(2);
    // Source untouched
    expect(doc.elements).toHaveLength(1);

    const copyEl = next.elements[1];
    expect(copyEl.id).not.toBe('a');
    expect(copyEl.x).toBe(22);
    expect(copyEl.y).toBe(32);

    const copyPath = next.paths[1];
    expect(copyPath.points).toEqual([[12, 12], [22, 17]]);

    const copyLabel = next.labels[1];
    expect(copyLabel.x).toBe(17);
    expect(copyLabel.text).toBe('hi');

    // All new ids are unique
    const ids = [...next.elements, ...next.paths, ...next.labels].map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('remaps group ids so copies form their own group', () => {
    let doc = addElement(addElement(emptyDoc(), el('a')), el('b'));
    ({ doc } = groupObjects(doc, [
      { kind: 'element', id: 'a' },
      { kind: 'element', id: 'b' },
    ]));
    const originalGroup = doc.elements[0].group!;
    const { doc: next } = cloneObjects(doc, [
      { kind: 'element', id: 'a' },
      { kind: 'element', id: 'b' },
    ], 12, 12);

    const copies = next.elements.slice(2);
    expect(copies[0].group).toBeDefined();
    expect(copies[0].group).toBe(copies[1].group);
    expect(copies[0].group).not.toBe(originalGroup);
  });
});

describe('rotateObjects90', () => {
  it('rotates a multi-selection as a rigid unit about its combined center', () => {
    // Two 10x10 squares side by side: bounds (0,0)-(30,10), pivot (15,5)
    let doc = emptyDoc();
    doc = addElement(doc, { ...el('a'), x: 0, y: 0, w: 10, h: 10 });
    doc = addElement(doc, { ...el('b'), x: 20, y: 0, w: 10, h: 10 });
    const refs = [
      { kind: 'element' as const, id: 'a' },
      { kind: 'element' as const, id: 'b' },
    ];
    const next = rotateObjects90(doc, refs);

    // Centers (5,5) and (25,5) rotate 90° CW about (15,5) → (15,-5) and (15,15)
    const a = next.elements[0];
    const b = next.elements[1];
    expect([a.x + a.w / 2, a.y + a.h / 2]).toEqual([15, -5]);
    expect([b.x + b.w / 2, b.y + b.h / 2]).toEqual([15, 15]);
    expect(a.rotation).toBe(90);
    expect(b.rotation).toBe(90);
  });

  it('four rotations return everything to the start', () => {
    let doc = emptyDoc();
    doc = addElement(doc, { ...el('a'), x: 0, y: 0, w: 20, h: 10 });
    doc = {
      ...doc,
      zones: [{ id: 'z1', label: 'z', x: 40, y: 0, w: 30, h: 10, color: '#000', opacity: 0.2 }],
      paths: [{ id: 'p1', points: [[0, 20], [10, 30]], stroke: '#000', width: 2 }],
      labels: [{ id: 'l1', text: 'hi', x: 50, y: 25, fontSize: 12, color: '#000' }],
    };
    const refs = [
      { kind: 'element' as const, id: 'a' },
      { kind: 'zone' as const, id: 'z1' },
      { kind: 'path' as const, id: 'p1' },
      { kind: 'label' as const, id: 'l1' },
    ];
    let next = doc;
    for (let i = 0; i < 4; i++) next = rotateObjects90(next, refs);

    expect(next.elements[0].x).toBeCloseTo(0, 9);
    expect(next.elements[0].y).toBeCloseTo(0, 9);
    expect(next.elements[0].rotation).toBe(0);
    expect(next.zones[0]).toMatchObject({ x: 40, y: 0, w: 30, h: 10 });
    expect(next.paths[0].points[0][0]).toBeCloseTo(0, 9);
    expect(next.paths[0].points[0][1]).toBeCloseTo(20, 9);
    expect(next.labels[0].x).toBeCloseTo(50, 9);
    expect(next.labels[0].y).toBeCloseTo(25, 9);
  });

  it('swaps zone footprint on rotation', () => {
    const doc: PlanDocument = {
      ...emptyDoc(),
      zones: [{ id: 'z1', label: 'z', x: 0, y: 0, w: 40, h: 20, color: '#000', opacity: 0.2 }],
    };
    const next = rotateObjects90(doc, [{ kind: 'zone', id: 'z1' }]);
    expect(next.zones[0].w).toBe(20);
    expect(next.zones[0].h).toBe(40);
    // Center preserved (pivot is the zone's own center)
    expect(next.zones[0].x + next.zones[0].w / 2).toBeCloseTo(20);
    expect(next.zones[0].y + next.zones[0].h / 2).toBeCloseTo(10);
  });
});

describe('grouping', () => {
  function twoElements(): PlanDocument {
    return addElement(addElement(emptyDoc(), el('a')), el('b', 100, 100));
  }

  it('groupObjects assigns a shared id; ungroupObjects clears it', () => {
    const refs = [
      { kind: 'element' as const, id: 'a' },
      { kind: 'element' as const, id: 'b' },
    ];
    const { doc } = groupObjects(twoElements(), refs);
    expect(doc.elements[0].group).toBeDefined();
    expect(doc.elements[0].group).toBe(doc.elements[1].group);
    expect(selectionIsGrouped(doc, refs)).toBe(true);

    const cleared = ungroupObjects(doc, refs);
    expect(cleared.elements[0].group).toBeUndefined();
    expect(selectionIsGrouped(cleared, refs)).toBe(false);
  });

  it('expandSelectionToGroups pulls in all members of a touched group', () => {
    const refs = [
      { kind: 'element' as const, id: 'a' },
      { kind: 'element' as const, id: 'b' },
    ];
    const { doc } = groupObjects(twoElements(), refs);
    const expanded = expandSelectionToGroups(doc, [{ kind: 'element', id: 'a' }]);
    expect(expanded).toHaveLength(2);
    expect(expanded.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('expandSelectionToGroups is identity for ungrouped selections', () => {
    const doc = twoElements();
    const refs = [{ kind: 'element' as const, id: 'a' }];
    expect(expandSelectionToGroups(doc, refs)).toBe(refs);
  });

  it('selectionIsGrouped is false for mixed or partial groups', () => {
    const refs = [
      { kind: 'element' as const, id: 'a' },
      { kind: 'element' as const, id: 'b' },
    ];
    const { doc } = groupObjects(twoElements(), [refs[0]]);
    expect(selectionIsGrouped(doc, refs)).toBe(false);
    expect(selectionIsGrouped(doc, [])).toBe(false);
  });
});

describe('alignObjects / distributeObjects', () => {
  function threeElements(): PlanDocument {
    let doc = emptyDoc();
    doc = addElement(doc, { ...el('a', 0, 0), w: 10, h: 10 });
    doc = addElement(doc, { ...el('b', 40, 30), w: 20, h: 20 });
    doc = addElement(doc, { ...el('c', 100, 80), w: 10, h: 40 });
    return doc;
  }
  const refs = [
    { kind: 'element' as const, id: 'a' },
    { kind: 'element' as const, id: 'b' },
    { kind: 'element' as const, id: 'c' },
  ];

  it('aligns left edges to the leftmost object', () => {
    const doc = alignObjects(threeElements(), refs, 'left');
    expect(doc.elements.map((e) => e.x)).toEqual([0, 0, 0]);
    // y untouched
    expect(doc.elements.map((e) => e.y)).toEqual([0, 30, 80]);
  });

  it('aligns right edges to the rightmost extent', () => {
    const doc = alignObjects(threeElements(), refs, 'right');
    expect(doc.elements.map((e) => e.x + e.w)).toEqual([110, 110, 110]);
  });

  it('aligns bottom edges and vertical centers', () => {
    const bottom = alignObjects(threeElements(), refs, 'bottom');
    expect(bottom.elements.map((e) => e.y + e.h)).toEqual([120, 120, 120]);
    const mid = alignObjects(threeElements(), refs, 'middleV');
    expect(mid.elements.map((e) => e.y + e.h / 2)).toEqual([60, 60, 60]);
  });

  it('uses the rotated footprint of elements', () => {
    let doc = emptyDoc();
    // 10×40 element rotated 90° occupies a 40×10 visual footprint centered on (20, 20)
    doc = addElement(doc, { ...el('rot', 15, 0), w: 10, h: 40, rotation: 90 });
    doc = addElement(doc, { ...el('flat', 100, 100), w: 10, h: 10 });
    const aligned = alignObjects(doc, [
      { kind: 'element', id: 'rot' },
      { kind: 'element', id: 'flat' },
    ], 'left');
    const rot = aligned.elements.find((e) => e.id === 'rot')!;
    // Visual left edge of the rotated element is x_center - h/2 = 20 - 20 = 0 → already leftmost
    expect(rot.x).toBe(15);
    const flat = aligned.elements.find((e) => e.id === 'flat')!;
    expect(flat.x).toBe(0);
  });

  it('distributes with equal gaps keeping outer objects fixed', () => {
    const doc = distributeObjects(threeElements(), refs, 'h');
    const [a, b, c] = doc.elements;
    expect(a.x).toBe(0);
    expect(c.x).toBe(100);
    // span 0..110, total widths 40 → free 70 → gap 35; middle starts at 10+35=45
    expect(b.x).toBe(45);
  });

  it('distribute is a no-op with fewer than 3 objects', () => {
    const doc = threeElements();
    expect(distributeObjects(doc, refs.slice(0, 2), 'h')).toBe(doc);
  });
});
