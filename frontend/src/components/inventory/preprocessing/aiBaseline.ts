import type {
  PreprocessingReviewRow,
  PreprocessingReviewRowPatch,
} from '../../../api/inventory.api';

/** Snapshot of AI cleanup outcome for Reset-to-AI (no DB migration). */
export interface PreprocessingAiBaselinePatch {
  title: string;
  brand: string;
  model: string;
  category: string;
  condition: string;
  proposed_price: string | '';
  final_price: string | '';
}

export function buildAiBaselinePatch(row: PreprocessingReviewRow): PreprocessingAiBaselinePatch {
  const fp =
    row.final_price != null && String(row.final_price).trim() !== ''
      ? String(row.final_price)
      : row.proposed_price != null && String(row.proposed_price).trim() !== ''
        ? String(row.proposed_price)
        : '';
  return {
    title: row.ai_title?.trim() ? row.ai_title : row.title,
    brand: row.ai_brand?.trim() ? row.ai_brand : row.brand,
    model: row.ai_model?.trim() ? row.ai_model : row.model,
    category: row.category,
    condition: row.condition,
    proposed_price: row.proposed_price ?? '',
    final_price: fp,
  };
}

export function baselineToRowPatch(b: PreprocessingAiBaselinePatch): PreprocessingReviewRowPatch {
  return {
    title: b.title,
    brand: b.brand,
    model: b.model,
    category: b.category,
    condition: b.condition as PreprocessingReviewRow['condition'],
    proposed_price: b.proposed_price ? b.proposed_price : undefined,
    final_price: b.final_price,
  };
}
