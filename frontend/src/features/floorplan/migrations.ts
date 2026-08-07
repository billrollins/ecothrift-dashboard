import { DEFAULT_LABEL_SETTINGS, PLAN_SCHEMA_VERSION, type PlanDocument } from '../../types/floorplan.types';

/**
 * Plan document migration pipeline.
 *
 * Each entry upgrades a document from version N to N+1. When the schema
 * changes, bump PLAN_SCHEMA_VERSION, add a migration keyed by the OLD
 * version, and update the backend validator. Migrations run on load so old
 * documents keep working; the upgraded document is written back on next save.
 */
const MIGRATIONS: Record<number, (doc: PlanDocument) => PlanDocument> = {
  // Example for the future:
  // 1: (doc) => ({ ...doc, schema_version: 2, newField: defaultValue }),
};

export class UnsupportedSchemaError extends Error {
  constructor(version: unknown) {
    super(`Unsupported floorplan schema version: ${String(version)}`);
    this.name = 'UnsupportedSchemaError';
  }
}

export function migratePlanDocument(raw: PlanDocument): PlanDocument {
  let doc = raw;
  let guard = 0;
  while (doc.schema_version < PLAN_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[doc.schema_version];
    if (!migrate) throw new UnsupportedSchemaError(doc.schema_version);
    doc = migrate(doc);
    if (++guard > 100) throw new UnsupportedSchemaError('migration loop');
  }
  if (doc.schema_version !== PLAN_SCHEMA_VERSION) {
    // Newer than this client understands - refuse rather than corrupt.
    throw new UnsupportedSchemaError(doc.schema_version);
  }
  return applyDefaults(doc);
}

/** Fill in optional settings introduced after a document was saved. */
function applyDefaults(doc: PlanDocument): PlanDocument {
  if (doc.settings.labels) return doc;
  return { ...doc, settings: { ...doc.settings, labels: { ...DEFAULT_LABEL_SETTINGS } } };
}
