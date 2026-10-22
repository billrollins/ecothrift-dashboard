import api from './client';

/** Estimated stock on hand (E4, `apps/inventory/services/shrink_age.py`); the Owner page Scorecard reads it. */
export type ShrinkBandKey = 'seen' | 'aging' | 'lost' | 'marked_gone' | 'count_missing';

export interface ShrinkMoneyUnits {
  units: number;
  tag: string;
}

export interface ShrinkEstimateDTO {
  as_of: string;
  settings: { start_days: number; lost_days: number; start_pct: number; count_missing_lost: boolean };
  /** On the shelf per the system. */
  system: ShrinkMoneyUnits;
  /** Estimated on hand: units and $ at today's tag. */
  estimated: ShrinkMoneyUnits;
  expected_lost: ShrinkMoneyUnits;
  bands: { key: ShrinkBandKey; label: string; units: number; tag: string; est_units: number; est_tag: string }[];
  by_location: Record<string, { units: number; tag: string; est_units: number; est_tag: string }>;
  undated_units: number;
  last_count_not_found: {
    count: string;
    day: string | null;
    units: number;
    tag: string;
    by_band: Record<ShrinkBandKey, ShrinkMoneyUnits>;
  } | null;
  items?: {
    id: number;
    sku: string;
    price: string;
    location: string;
    last_seen: string | null;
    seen_by: string;
    days_unseen: number;
    likelihood_lost: number;
    marked_gone: string;
  }[];
  items_total?: number;
}

export function getShrinkEstimate(band?: ShrinkBandKey, limit = 200): Promise<{ data: ShrinkEstimateDTO }> {
  return api.get<ShrinkEstimateDTO>('/inventory/shrink-estimate/', { params: band ? { items: band, limit } : undefined });
}
