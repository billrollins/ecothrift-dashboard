import api from './client';

/** One source behind a recovery estimate (apps/inventory/services/recovery_estimate.py). */
export interface RecoverySource {
  source: 'store' | 'category' | 'subcategory' | 'neighbours' | 'vendor' | 'price_point' | 'condition';
  label: string;
  rate: number | null;
  n: number;
  /** The rate after it is pulled toward its parent by sample size. */
  pulled?: number;
}

/** What similar items keep of retail, with a suggested tag price band. */
export interface RecoveryEstimate {
  recovery: number;
  n: number;
  basis: string;
  low: string;
  high: string;
  mid: string;
  /** Against the price given: '' (none given), 'ok', 'high' or 'low'. */
  verdict: '' | 'ok' | 'high' | 'low';
  sources?: RecoverySource[];
}

export interface RecoveryEstimateResponse {
  enabled: boolean;
  estimate: RecoveryEstimate | null;
}

export function getRecoveryEstimate(
  params: { retail: string; product?: number | null; order?: number | null; condition?: string; price?: string },
  signal?: AbortSignal,
) {
  return api.get<RecoveryEstimateResponse>('/inventory/recovery-estimate/', {
    params: {
      retail: params.retail, product: params.product ?? undefined, order: params.order ?? undefined,
      condition: params.condition || undefined, price: params.price || undefined,
    },
    signal,
  });
}
