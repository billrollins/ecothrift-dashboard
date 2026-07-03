import { describe, expect, it } from 'vitest';
import type { PlanDocument, PlanElement } from '../../types/floorplan.types';
import {
  activeConfigId,
  addConfig,
  addElement,
  alignObjects,
  cloneObjects,
  configMetas,
  deleteConfig,
  deleteObjects,
  distributeObjects,
  editorReducer,
  expandSelectionToGroups,
  flipObjects,
  groupObjects,
  initialEditorState,
  listLockedObjects,
  moveObjects,
  rotateObjects90,
  rotateObjectsEachInPlace,
  scaleObjects,
  selectionIsGrouped,
  setObjectsLocked,
  switchConfig,
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

describe('rotateObjectsEachInPlace', () => {
  it('rotates each element about its own center without moving it', () => {
    let doc = emptyDoc();
    doc = addElement(doc, { ...el('a', 0, 0), w: 10, h: 40 });
    doc = addElement(doc, { ...el('b', 100, 100), w: 20, h: 20 });
    const next = rotateObjectsEachInPlace(doc, [
      { kind: 'element', id: 'a' },
      { kind: 'element', id: 'b' },
    ]);
    const [a, b] = next.elements;
    expect(a.rotation).toBe(90);
    expect(b.rotation).toBe(90);
    // Raw rect untouched (rotation happens about the center at render time)
    expect({ x: a.x, y: a.y, w: a.w, h: a.h }).toEqual({ x: 0, y: 0, w: 10, h: 40 });
  });
});

describe('locked objects', () => {
  it('locks, lists, and unlocks', () => {
    let doc = addElement(emptyDoc(), el('a'));
    doc = setObjectsLocked(doc, [{ kind: 'element', id: 'a' }], true);
    expect(listLockedObjects(doc)).toHaveLength(1);
    expect(listLockedObjects(doc)[0].ref).toEqual({ kind: 'element', id: 'a' });
    doc = setObjectsLocked(doc, [{ kind: 'element', id: 'a' }], false);
    expect(listLockedObjects(doc)).toHaveLength(0);
    expect((doc.elements[0] as { locked?: boolean }).locked).toBeUndefined();
  });
});

describe('layout configurations', () => {
  it('adds a duplicate config and switches back and forth losslessly', () => {
    let doc = addElement(emptyDoc(), el('a', 10, 10));
    doc = addConfig(doc, 'Holiday');
    // New config is active, duplicated, with fresh ids
    expect(configMetas(doc)).toHaveLength(2);
    expect(configMetas(doc)[1].name).toBe('Holiday');
    expect(doc.elements).toHaveLength(1);
    expect(doc.elements[0].id).not.toBe('a');
    // Mutate the new config only
    doc = moveObjects(doc, [{ kind: 'element', id: doc.elements[0].id }], 50, 0);
    expect(doc.elements[0].x).toBe(60);
    // Switch back to the original: element 'a' untouched
    const firstId = configMetas(doc)[0].id;
    doc = switchConfig(doc, firstId);
    expect(activeConfigId(doc)).toBe(firstId);
    expect(doc.elements[0].id).toBe('a');
    expect(doc.elements[0].x).toBe(10);
    // And forward again: the moved duplicate is preserved
    doc = switchConfig(doc, configMetas(doc)[1].id);
    expect(doc.elements[0].x).toBe(60);
  });

  it('deleteConfig removes the layout and never deletes the last config', () => {
    let doc = addElement(emptyDoc(), el('a'));
    const single = doc;
    expect(deleteConfig(single, configMetas(single)[0].id)).toBe(single);
    doc = addConfig(doc);
    const secondId = activeConfigId(doc);
    doc = deleteConfig(doc, secondId);
    expect(configMetas(doc)).toHaveLength(1);
    expect(doc.elements[0].id).toBe('a');
    expect(doc.configStore?.[secondId]).toBeUndefined();
  });
});

describe('flipObjects', () => {
  it('mirrors positions about the selection center and toggles content flip', () => {
    let doc = emptyDoc();
    doc = addElement(doc, { ...el('a', 0, 0), w: 10, h: 10 });
    doc = addElement(doc, { ...el('b', 90, 0), w: 10, h: 10 });
    const next = flipObjects(doc, [
      { kind: 'element', id: 'a' },
      { kind: 'element', id: 'b' },
    ], 'h');
    const a = next.elements.find((e) => e.id === 'a')!;
    const b = next.elements.find((e) => e.id === 'b')!;
    // Selection spans 0..100; a (0..10) mirrors to 90..100 and vice versa
    expect(a.x).toBe(90);
    expect(b.x).toBe(0);
    expect(a.flipH).toBe(true);
    expect(b.flipH).toBe(true);
    // Flip back restores everything
    const back = flipObjects(next, [
      { kind: 'element', id: 'a' },
      { kind: 'element', id: 'b' },
    ], 'h');
    expect(back.elements.find((e) => e.id === 'a')!.x).toBe(0);
    expect(back.elements.find((e) => e.id === 'a')!.flipH).toBeUndefined();
  });

  it('a 90°-rotated element flips its pre-rotation vertical content on horizontal flip', () => {
    let doc = emptyDoc();
    doc = addElement(doc, { ...el('rot', 0, 0), w: 10, h: 40, rotation: 90 });
    const next = flipObjects(doc, [{ kind: 'element', id: 'rot' }], 'h');
    const rot = next.elements[0];
    expect(rot.flipV).toBe(true);
    expect(rot.flipH).toBeUndefined();
  });

  it('mirrors path points', () => {
    const doc: PlanDocument = {
      ...emptyDoc(),
      paths: [{ id: 'p1', points: [[0, 0], [10, 5]], stroke: '#000', width: 2 }],
    };
    const next = flipObjects(doc, [{ kind: 'path', id: 'p1' }], 'h');
    // Bounds 0..10, center 5: x mirrors as 10-x
    expect(next.paths[0].points).toEqual([[10, 0], [0, 5]]);
  });
});

describe('scaleObjects', () => {
  it('scales positions and sizes about the origin', () => {
    let doc = emptyDoc();
    doc = addElement(doc, { ...el('sq', 10, 10), w: 20, h: 20 });
    const next = scaleObjects(doc, [{ kind: 'element', id: 'sq' }], { x: 0, y: 0 }, 2, 2);
    const sq = next.elements[0];
    expect({ x: sq.x, y: sq.y, w: sq.w, h: sq.h }).toEqual({ x: 20, y: 20, w: 40, h: 40 });
  });

  it('keeps the depth of wall-like elements while lengths scale', () => {
    let doc = emptyDoc();
    // A 96x6 wall (aspect 16) and a 20x20 table
    doc = addElement(doc, { ...el('wall', 0, 0), w: 96, h: 6 });
    doc = addElement(doc, { ...el('table', 0, 50), w: 20, h: 20 });
    const next = scaleObjects(doc, [
      { kind: 'element', id: 'wall' },
      { kind: 'element', id: 'table' },
    ], { x: 0, y: 0 }, 2, 2);
    const wall = next.elements.find((e) => e.id === 'wall')!;
    const table = next.elements.find((e) => e.id === 'table')!;
    expect(wall.w).toBe(192); // length doubles
    expect(wall.h).toBe(6);   // depth preserved
    expect(table.w).toBe(40); // regular elements scale fully
    expect(table.h).toBe(40);
  });
});

describe('scaleObjects with a kind catalog', () => {
  const wallIndex = {
    wall: { kind: 'wall', label: 'Wall', category: 'Structural', w: 96, h: 6, color: '#455a64', resizable: true, isWall: true },
    binTable: { kind: 'binTable', label: 'Bin', category: 'Fixtures', w: 48, h: 48, color: '#ffb74d', resizable: true },
  };

  it('a rotated (vertical) wall keeps its thickness when scaling', () => {
    let doc = emptyDoc();
    // Vertical wall: raw 96 long x 6 thick, rotated 90 → visual 6 wide x 96 tall
    doc = addElement(doc, { ...el('vwall', 0, 0), kind: 'wall', w: 96, h: 6, rotation: 90 });
    const next = scaleObjects(doc, [{ kind: 'element', id: 'vwall' }], { x: 0, y: 0 }, 2, 2, 2, wallIndex);
    const wall = next.elements[0];
    expect(wall.w).toBe(192); // raw length doubles
    expect(wall.h).toBe(6);   // raw thickness (visual width) preserved
  });

  it('catalog says not-a-wall: a thin element scales fully (no heuristic)', () => {
    let doc = emptyDoc();
    doc = addElement(doc, { ...el('shelf', 0, 0), kind: 'binTable', w: 96, h: 6 });
    const next = scaleObjects(doc, [{ kind: 'element', id: 'shelf' }], { x: 0, y: 0 }, 2, 2, 2, wallIndex);
    expect(next.elements[0].w).toBe(192);
    expect(next.elements[0].h).toBe(12); // scales — catalog overrides the aspect guess
  });
});
