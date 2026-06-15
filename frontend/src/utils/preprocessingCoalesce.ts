import type { PreprocessingReviewRow } from '../api/inventory.api';

function mStr(v: unknown): boolean {
  return v != null && String(v).trim() !== '';
}

function mDict(v: unknown): boolean {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v as object).length > 0;
}

function mList(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

/** Coalesce preview matching backend layer_helpers (before finalize snapshot). */
export function previewTitle(row: PreprocessingReviewRow): string {
  if (mStr(row.ai_title)) return String(row.ai_title).trim().slice(0, 300);
  return '';
}

export function previewCategory(row: PreprocessingReviewRow): string {
  if (mStr(row.ai_category)) return String(row.ai_category).trim().slice(0, 200);
  return '';
}

export function previewBrand(row: PreprocessingReviewRow): string {
  if (mStr(row.ai_brand)) return String(row.ai_brand).trim().slice(0, 200);
  return String(row.standard_brand ?? '').trim().slice(0, 200);
}

export function previewModel(row: PreprocessingReviewRow): string {
  if (mStr(row.ai_model)) return String(row.ai_model).trim().slice(0, 200);
  return String(row.standard_model ?? '').trim().slice(0, 200);
}

export function previewCondition(row: PreprocessingReviewRow): string {
  if (mStr(row.ai_condition)) return String(row.ai_condition).trim();
  return String(row.standard_condition ?? '').trim();
}

export function previewNotes(row: PreprocessingReviewRow): string {
  if (mStr(row.ai_notes)) return String(row.ai_notes).trim();
  return String(row.standard_notes ?? '').trim();
}

export function previewSpecifications(row: PreprocessingReviewRow): Record<string, unknown> {
  const ai = row.ai_specifications;
  if (mDict(ai)) return ai as Record<string, unknown>;
  return (row.standard_specifications ?? {}) as Record<string, unknown>;
}

export function previewSearchTags(row: PreprocessingReviewRow): string[] {
  const ai = row.ai_search_tags;
  if (mList(ai)) return [...(ai as string[])];
  const st = row.standard_search_tags;
  if (mList(st)) return [...(st as string[])];
  return [];
}

