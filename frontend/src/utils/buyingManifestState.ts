import type { BuyingAuctionListItem } from '../types/buying.types';

export type AuctionManifestColumnState = 'verified' | 'ai_estimate' | 'empty';

/** List row: verified manifest rows vs listing/AI retail vs no usable retail signal. */
export function getAuctionManifestColumnState(row: BuyingAuctionListItem): AuctionManifestColumnState {
  if (row.has_manifest) return 'verified';
  const hasDisplayRetail =
    row.total_retail_display != null && String(row.total_retail_display).trim() !== '';
  const hasListingRetail = row.total_retail_value != null && String(row.total_retail_value).trim() !== '';
  const rawAi = row.ai_category_estimates;
  const hasAiEstimates =
    rawAi != null &&
    typeof rawAi === 'object' &&
    !Array.isArray(rawAi) &&
    Object.keys(rawAi as Record<string, unknown>).length > 0;
  if (hasDisplayRetail || hasListingRetail || hasAiEstimates) return 'ai_estimate';
  return 'empty';
}

export function auctionManifestColumnAriaLabel(state: AuctionManifestColumnState): string {
  switch (state) {
    case 'verified':
      return 'Manifest verified';
    case 'ai_estimate':
      return 'AI estimate';
    default:
      return 'No manifest available';
  }
}

export function auctionManifestColumnTooltip(state: AuctionManifestColumnState): string {
  switch (state) {
    case 'verified':
      return 'Manifest verified — uploaded manifest drives retail';
    case 'ai_estimate':
      return 'AI / listing estimate — no manifest; retail from listing or AI';
    default:
      return 'No manifest — no listing retail or AI category mix yet';
  }
}
