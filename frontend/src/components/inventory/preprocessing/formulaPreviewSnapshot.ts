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

/** Row 1 only — Sample Result card (debounced on formula edits in parent). */
export function computeSampleFormulaSnapshot(
  formulas: Record<string, string>,
  columns: StandardColumnDefinition[],
  manifestSampleRows: ManifestRawRow[],
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
  if (import.meta.env.DEV) {
    prepS1('formulaPreview.computeSampleFormulaSnapshot exit', {
      row1_raw_keys: Object.keys(raw1).length,
      samplesFilled: Object.keys(samples).length,
      sampleErrorFields: sampleErrors,
    });
  }
  return { samples, sampleErrors };
}

/** All sample rows × mapped columns — Formula Preview grid (expand / refresh only). */
export function computeFormulaPreviewGrid(
  formulas: Record<string, string>,
  columns: StandardColumnDefinition[],
  manifestSampleRows: ManifestRawRow[],
): Pick<FormulaEvalSnapshot, 'previewTargets' | 'previewRows'> {
  if (import.meta.env.DEV) {
    prepS1('formulaPreview.computeFormulaPreviewGrid enter', {
      rowCount: manifestSampleRows.length,
      nonEmptyFormulas: Object.entries(formulas).filter(([, v]) => (v ?? '').trim()).length,
      previewTargetKeys: columns
        .map((c) => c.key)
        .filter((key) => (formulas[key]?.trim() ?? '').length > 0),
    });
  }
  const previewTargets = columns
    .map((c) => c.key)
    .filter((key) => (formulas[key]?.trim() ?? '').length > 0);

  const previewRows = manifestSampleRows.map((mr) => {
    const rawStrings: Record<string, string> = {};
    for (const [k, v] of Object.entries(mr.raw ?? {})) rawStrings[k] = String(v ?? '');
    const cells: Record<string, string> = {};
    for (const t of previewTargets) {
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
): FormulaEvalSnapshot {
  return {
    ...computeSampleFormulaSnapshot(formulas, columns, manifestSampleRows),
    ...computeFormulaPreviewGrid(formulas, columns, manifestSampleRows),
  };
}
