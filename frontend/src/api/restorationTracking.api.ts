import api from './client';

export type RestorationPathStep = 'tested' | 'assembled' | 'repaired' | 'salvaged';

export interface RestorationTrackingRowDTO {
  job_id: number;
  sku: string;
  title: string;
  quantity: number;
  stage: string;
  stage_label: string;
  path: { step: RestorationPathStep; first_at: string | null }[];
  next: string;
  landed: string;
  sent_at: string | null;
  bench_started_at: string | null;
  finished_at: string | null;
  checked_back_at: string | null;
  days_in_restoration: number | null;
  days_in_stage: number | null;
  final_grade: string;
  value_added: string | null;
}

export interface RestorationTrackingDTO {
  scope: 'open' | 'done';
  days: number | null;
  count: number;
  truncated: boolean;
  summary: { by_stage: Record<string, number>; median_days: number | null; over_30_days: number };
  rows: RestorationTrackingRowDTO[];
}

export function getRestorationTracking(scope: 'open' | 'done', days = 30): Promise<{ data: RestorationTrackingDTO }> {
  return api.get<RestorationTrackingDTO>('/inventory/restoration-jobs/tracking/', { params: { scope, days } });
}
