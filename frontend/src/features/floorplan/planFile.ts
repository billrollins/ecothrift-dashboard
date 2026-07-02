/**
 * Floorplan file export/import.
 *
 * Export format is JSON — the plan document is natively JSON, so JSON gives
 * exact round-trip fidelity. Import additionally accepts YAML (handy for
 * hand-written or AI-generated layouts). Imported documents are normalized:
 * missing collections default to empty, missing object ids are generated,
 * and the document then passes through the normal schema migration. The
 * backend validator still gates the eventual save.
 */
import { load as yamlLoad } from 'js-yaml';
import type { PlanDocument } from '../../types/floorplan.types';
import { newId } from './editorState';
import { migratePlanDocument } from './migrations';

export interface PlanExportFile {
  kind: 'ecothrift-floorplan';
  name: string;
  document: PlanDocument;
}

export function serializePlanExport(doc: PlanDocument, name: string): string {
  const file: PlanExportFile = { kind: 'ecothrift-floorplan', name, document: doc };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export interface ParsedPlanFile {
  name: string;
  document: PlanDocument;
  objectCount: number;
}

const COLLECTION_PREFIX: Record<string, string> = {
  elements: 'el',
  zones: 'zn',
  paths: 'pa',
  labels: 'lb',
  infoBlocks: 'ib',
};

/**
 * Parse a plan file (JSON or YAML; wrapped export or a bare plan document).
 * Throws Error with a readable message on malformed input.
 */
export function parsePlanFile(text: string): ParsedPlanFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    try {
      raw = yamlLoad(text);
    } catch {
      throw new Error('File is neither valid JSON nor valid YAML.');
    }
  }
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('File must contain a floorplan object.');
  }
  const outer = raw as Record<string, unknown>;
  if (outer.kind != null && outer.kind !== 'ecothrift-floorplan') {
    throw new Error(`Not a floorplan file (kind: ${String(outer.kind)}).`);
  }
  const name = typeof outer.name === 'string' ? outer.name.trim() : '';
  const docRaw = (outer.kind === 'ecothrift-floorplan' || outer.document != null ? outer.document : outer) as unknown;
  if (docRaw == null || typeof docRaw !== 'object' || Array.isArray(docRaw)) {
    throw new Error('Missing plan "document" object.');
  }
  const doc = normalizeDocument(docRaw as Record<string, unknown>);
  // Run the standard load pipeline (schema migration + defaults). Throws
  // UnsupportedSchemaError for documents newer than this client.
  const migrated = migratePlanDocument(doc);
  const objectCount =
    migrated.elements.length + migrated.zones.length + migrated.paths.length +
    migrated.labels.length + migrated.infoBlocks.length;
  return { name, document: migrated, objectCount };
}

function normalizeDocument(raw: Record<string, unknown>): PlanDocument {
  const settingsRaw = (raw.settings ?? {}) as Record<string, unknown>;
  const planWidth = numberOr(settingsRaw.planWidth, 1200);
  const planHeight = numberOr(settingsRaw.planHeight, 720);
  if (planWidth <= 0 || planHeight <= 0) throw new Error('settings.planWidth/planHeight must be positive.');
  const gridRaw = (settingsRaw.grid ?? {}) as Record<string, unknown>;

  const doc: Record<string, unknown> = {
    ...raw,
    schema_version: typeof raw.schema_version === 'number' ? raw.schema_version : 1,
    settings: {
      ...settingsRaw,
      planWidth,
      planHeight,
      grid: {
        visible: gridRaw.visible !== false,
        minor: numberOr(gridRaw.minor, 6),
        major: numberOr(gridRaw.major, 12),
        ...(typeof gridRaw.style === 'string' ? { style: gridRaw.style } : {}),
      },
      snap: numberOr(settingsRaw.snap, 1),
    },
  };

  for (const [key, prefix] of Object.entries(COLLECTION_PREFIX)) {
    const listRaw = raw[key];
    const list = Array.isArray(listRaw) ? listRaw : [];
    doc[key] = list.map((objRaw, i) => {
      if (objRaw == null || typeof objRaw !== 'object') {
        throw new Error(`${key}[${i}] must be an object.`);
      }
      const obj = { ...(objRaw as Record<string, unknown>) };
      if (typeof obj.id !== 'string' || !obj.id) obj.id = newId(prefix);
      if (key === 'paths') {
        if (!Array.isArray(obj.points) || obj.points.length === 0) {
          throw new Error(`paths[${i}] needs a non-empty "points" list.`);
        }
      } else {
        for (const dim of ['x', 'y']) {
          if (typeof obj[dim] !== 'number') throw new Error(`${key}[${i}].${dim} must be a number.`);
        }
      }
      return obj;
    });
  }
  return doc as unknown as PlanDocument;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
