import api from './client';

/** The Owner page (2026-10-21; apps/core/services/owner_page.py). Superuser only. Money is "123.45". */

export interface ScorecardPeriod {
  key: 'this_week' | 'last_week' | 'this_month' | 'last_month';
  label: string;
  start: string;
  end: string;
  net_item_sales: string;
  buying: string;
  processing: string;
  /** Percent with one decimal ("45.2"), or null when there is nothing to divide by. */
  buying_pct_of_processing: string | null;
  processing_pct_of_sales: string | null;
  labor_hours: string;
  labor: string;
  labor_pct_of_sales: string | null;
  /** Comes with shrink by age; null until then. */
  shrink: string | null;
}

export interface Scorecard {
  today: string;
  targets: { buying_pct_of_processing: [number, number]; processing_pct_of_sales: number };
  periods: ScorecardPeriod[];
  thrift_plus_owed: {
    banked: string;
    credit: string;
    total: string;
    trend: { day: string; owed: string }[];
    link: string;
  };
}

export interface NeedsYouItem {
  key: string;
  label: string;
  count: number;
  link: string;
  detail: string;
  tone: 'warning' | 'error' | 'info';
}

export interface NeedsYou {
  items: NeedsYouItem[];
  /** Sources that failed to count (each listed by name). */
  errors: string[];
}

export type SpendRange = 'today' | 'week' | 'month';

export interface AiSpend {
  range: SpendRange;
  since: string;
  /** Dollars to the hundredth of a cent ("0.0123"). */
  total: string;
  calls: number;
  failed: number;
  by_feature: { feature: string; sources: string[]; cost: string; calls: number }[];
  by_who: { who: string; kind: 'user' | 'job'; cost: string; calls: number }[];
}

export async function fetchScorecard(): Promise<Scorecard> {
  const { data } = await api.get<Scorecard>('/core/owner/scorecard/');
  return data;
}

export async function fetchNeedsYou(): Promise<NeedsYou> {
  const { data } = await api.get<NeedsYou>('/core/owner/needs-you/');
  return data;
}

export async function fetchAiSpend(range: SpendRange): Promise<AiSpend> {
  const { data } = await api.get<AiSpend>('/core/owner/ai-spend/', { params: { range } });
  return data;
}
