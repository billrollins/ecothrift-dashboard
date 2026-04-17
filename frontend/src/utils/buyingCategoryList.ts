import type { BuyingAuctionListItem } from '../types/buying.types';

/** First word-like token of a taxonomy / category label. */
export function firstWordCategory(name: string): string {
  const t = name.trim();
  if (!t) return '—';
  const m = t.match(/[\w][\w'-]*/u);
  return m ? m[0] : t.split(/\s+/)[0] ?? '—';
}

/**
 * Retail-weighted mix when present (`manifest_category_distribution`), else AI estimates.
 * Sorted by pct descending — matches `AuctionListSerializer.get_top_categories` source.
 */
export function getRetailWeightedCategoryEntries(row: BuyingAuctionListItem): { name: string; pct: number }[] {
  const raw = row.manifest_category_distribution ?? row.ai_category_estimates;
  if (!raw || typeof raw !== 'object') return [];
  const pairs: { name: string; pct: number }[] = [];
  for (const [k, v] of Object.entries(raw)) {
    const pct = typeof v === 'number' ? v : Number.parseFloat(String(v));
    if (!Number.isFinite(pct)) continue;
    pairs.push({ name: String(k), pct });
  }
  pairs.sort((a, b) => b.pct - a.pct);
  return pairs;
}

/** Label for hover: matches list mix source (manifest retail-weighted vs AI). */
export function getCategoryMixHeading(row: BuyingAuctionListItem): string {
  if (row.valuation_source === 'manifest') return 'From Manifest';
  if (row.valuation_source === 'ai') return 'AI Estimate';
  const m = row.manifest_category_distribution;
  if (m && typeof m === 'object' && Object.keys(m).length > 0) return 'From Manifest';
  return 'AI Estimate';
}
