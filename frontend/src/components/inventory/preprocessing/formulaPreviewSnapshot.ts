import type { ManifestRawRow, StandardColumnDefinition } from '../../../api/inventory.api';
import { prepS1 } from '../../../utils/preprocessingStep1Diag';
import { evaluateFormulaSafe } from './formulaEngine';

export interface FormulaEvalSnapshot {
  samples: Record<string, string>;
  sampleErrors: Record<string, string>;
  /** Standard-field keys with non-empty formula at snapshot time (preview columns order). */
  previewTargets: string[];
  previewRows: Array<{ row_number: number; cells: Record<string, string> }>;
}

export function emptyFormulaEvalSnapshot(): FormulaEvalSnapshot {
  return { samples: {}, sampleErrors: {}, previewTargets: [], previewRows: [] };
}

/** Stable UI / API bucket identifiers (matches backend `BUCKET_ORDER`). */
export const MANIFEST_BUCKET_ORDER = ['identifiers', 'taxonomy', 'specifications', 'tracking'] as const;

/** Internal sample map key for bucket row 1 previews (avoids colliding with flat field keys). */
export function manifestBucketSampleKey(bucketId: string): string {
  return `__manifest_bucket_${bucketId}`;
}

export function manifestBucketSampleKeyToId(key: string): string | null {
  const pref = '__manifest_bucket_';
  return key.startsWith(pref) ? key.slice(pref.length) : null;
}

export function bucketMappedFieldCount(formulas: Record<string, string>, bucketId: string): number {
  const p = `${bucketId}.`;
  return Object.entries(formulas).filter(([k, v]) => k.startsWith(p) && (v ?? '').trim()).length;
}

export function buildBucketPreviewDict(
  formulas: Record<string, string>,
  bucketPrefix: string,
  raw: Record<string, string>,
): { preview: Record<string, string>; combinedError: string | null } {
  const preview: Record<string, string> = {};
  const errs: string[] = [];
  const pref = `${bucketPrefix}.`;
  for (const [target, expr] of Object.entries(formulas)) {
    if (!target.startsWith(pref)) continue;
    const e = (expr ?? '').trim();
    if (!e) continue;
    const ev = evaluateFormulaSafe(e, raw);
    if (!ev.ok) errs.push(`${target}: ${ev.error}`);
    else if (String(ev.value ?? '').trim()) {
      const sub = target.slice(pref.length);
      preview[sub] = String(ev.value ?? '').trim();
    }
  }
  return {
    preview,
    combinedError: errs.length ? errs.join('; ') : null,
  };
}

/** Compact JSON string for tooltips (one line in table; pretty-print in Tooltip). */
export function buildBucketPreviewJson(
  formulas: Record<string, string>,
  bucketPrefix: string,
  raw: Record<string, string>,
): string {
  const { preview } = buildBucketPreviewDict(formulas, bucketPrefix, raw);
  return Object.keys(preview).length ? JSON.stringify(preview) : '';
}

/** Row 1 only — Sample Result card (debounced on formula edits in parent). */
export function computeSampleFormulaSnapshot(
  formulas: Record<string, string>,
  columns: StandardColumnDefinition[],
  manifestSampleRows: ManifestRawRow[],
  bucketIds: readonly string[] = MANIFEST_BUCKET_ORDER,
): Pick<FormulaEvalSnapshot, 'samples' | 'sampleErrors'> {
  if (import.meta.env.DEV) {
    prepS1('formulaPreview.computeSampleFormulaSnapshot enter', {
      rowCount: manifestSampleRows.length,
      columnCount: columns.length,
      nonEmptyFormulas: Object.entries(formulas).filter(([, v]) => (v ?? '').trim()).length,
      formulaTargetsSample: Object.entries(formulas)
        .filter(([, v]) => (v ?? '').trim())
        .slice(0, 8)
        .map(([k, v]) => `${k}=${String(v).slice(0, 48)}`),
    });
  }
  const row1 = manifestSampleRows[0];
  const raw1: Record<string, string> = {};
  if (row1?.raw) {
    for (const [k, v] of Object.entries(row1.raw)) raw1[k] = String(v ?? '');
  }

  const samples: Record<string, string> = {};
  const sampleErrors: Record<string, string> = {};
  for (const col of columns) {
    const expr = (formulas[col.key] ?? '').trim();
    if (!expr) continue;
    const r = evaluateFormulaSafe(expr, raw1);
    if (r.ok) samples[col.key] = r.value;
    else sampleErrors[col.key] = r.error;
  }
  for (const bid of bucketIds) {
    const key = manifestBucketSampleKey(bid);
    const { preview, combinedError } = buildBucketPreviewDict(formulas, bid, raw1);
    if (combinedError) sampleErrors[key] = combinedError;
    const json = Object.keys(preview).length ? JSON.stringify(preview) : '';
    if (json) samples[key] = json;
  }
  if (import.meta.env.DEV) {
    prepS1('formulaPreview.computeSampleFormulaSnapshot exit', {
      row1_raw_keys: Object.keys(raw1).length,
      samplesFilled: Object.keys(samples).length,
      sampleErrorFields: sampleErrors,
    });
  }
  return { samples, sampleErrors };
}

/** All sample rows × mapped columns (+ JSON bucket columns when sub-formulas exist). */
export function computeFormulaPreviewGrid(
  formulas: Record<string, string>,
  columns: StandardColumnDefinition[],
  manifestSampleRows: ManifestRawRow[],
  bucketOrder: readonly string[] = [],
): Pick<FormulaEvalSnapshot, 'previewTargets' | 'previewRows'> {
  const flatTargets = columns
    .map((c) => c.key)
    .filter((key) => (formulas[key]?.trim() ?? '').length > 0);

  const bucketTargets: string[] = [];
  for (const bid of bucketOrder) {
    if (bucketMappedFieldCount(formulas, bid) === 0) continue;
    bucketTargets.push(manifestBucketSampleKey(bid));
  }

  const previewTargets = [...flatTargets, ...bucketTargets];

  if (import.meta.env.DEV) {
    prepS1('formulaPreview.computeFormulaPreviewGrid enter', {
      rowCount: manifestSampleRows.length,
      nonEmptyFormulas: Object.entries(formulas).filter(([, v]) => (v ?? '').trim()).length,
      previewTargetKeys: previewTargets,
    });
  }

  const previewRows = manifestSampleRows.map((mr) => {
    const rawStrings: Record<string, string> = {};
    for (const [k, v] of Object.entries(mr.raw ?? {})) rawStrings[k] = String(v ?? '');
    const cells: Record<string, string> = {};
    for (const t of previewTargets) {
      const bucketId = manifestBucketSampleKeyToId(t);
      if (bucketId !== null) {
        const { preview, combinedError } = buildBucketPreviewDict(formulas, bucketId, rawStrings);
        if (combinedError) {
          cells[t] = `⚠ ${combinedError}`;
        } else {
          cells[t] =
            Object.keys(preview).length > 0 ? JSON.stringify(preview) : '';
        }
        continue;
      }
      const expr = formulas[t] ?? '';
      const ev = evaluateFormulaSafe(expr, rawStrings);
      cells[t] = ev.ok ? ev.value : `⚠ ${ev.error}`;
    }
    return { row_number: mr.row_number, cells };
  });

  if (import.meta.env.DEV) {
    prepS1('formulaPreview.computeFormulaPreviewGrid exit', {
      previewTargetsCount: previewTargets.length,
      previewTargets,
      previewRowsBuilt: previewRows.length,
    });
  }

  return { previewTargets, previewRows };
}

/** Evaluate formulas against manifest sample rows for Sample Result + Formula Preview snapshots. */
export function computeFormulaEvalSnapshot(
  formulas: Record<string, string>,
  columns: StandardColumnDefinition[],
  manifestSampleRows: ManifestRawRow[],
  bucketIds: readonly string[] = MANIFEST_BUCKET_ORDER,
): FormulaEvalSnapshot {
  return {
    ...computeSampleFormulaSnapshot(formulas, columns, manifestSampleRows, bucketIds),
    ...computeFormulaPreviewGrid(formulas, columns, manifestSampleRows, bucketIds),
  };
}
