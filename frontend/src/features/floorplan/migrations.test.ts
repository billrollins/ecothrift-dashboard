import { describe, expect, it } from 'vitest';
import { PLAN_SCHEMA_VERSION, type PlanDocument } from '../../types/floorplan.types';
import { migratePlanDocument, UnsupportedSchemaError } from './migrations';

function docWithVersion(version: number): PlanDocument {
  return {
    schema_version: version,
    settings: {
      planWidth: 1200,
      planHeight: 720,
      grid: { visible: true, minor: 6, major: 12 },
      snap: 1,
      labels: { show: true, fontSize: 8 },
    },
    elements: [],
    zones: [],
    paths: [],
    labels: [],
    infoBlocks: [],
  };
}

describe('migratePlanDocument', () => {
  it('returns current-version documents unchanged', () => {
    const doc = docWithVersion(PLAN_SCHEMA_VERSION);
    expect(migratePlanDocument(doc)).toBe(doc);
  });

  it('fills in default label settings for older documents that lack them', () => {
    const doc = docWithVersion(PLAN_SCHEMA_VERSION);
    delete doc.settings.labels;
    const migrated = migratePlanDocument(doc);
    expect(migrated.settings.labels).toEqual({ show: true, fontSize: 8 });
    // original untouched
    expect(doc.settings.labels).toBeUndefined();
  });

  it('rejects documents newer than this client', () => {
    expect(() => migratePlanDocument(docWithVersion(PLAN_SCHEMA_VERSION + 1))).toThrow(UnsupportedSchemaError);
  });

  it('rejects unknown old versions with no migration path', () => {
    expect(() => migratePlanDocument(docWithVersion(0))).toThrow(UnsupportedSchemaError);
  });

  it('serialization round-trip preserves the document exactly', () => {
    const doc: PlanDocument = {
      ...docWithVersion(PLAN_SCHEMA_VERSION),
      elements: [{ id: 'e1', kind: 'gondola', x: 120.5, y: 48.25, w: 48, h: 144, rotation: 270, label: 'A', active: false }],
      paths: [{ id: 'p1', points: [[0.125, 0.375], [10, 12]], stroke: '#333', width: 2 }],
    };
    const roundTripped = JSON.parse(JSON.stringify(doc)) as PlanDocument;
    expect(migratePlanDocument(roundTripped)).toEqual(doc);
  });
});
