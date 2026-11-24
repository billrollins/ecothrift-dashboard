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

/** The Social card (Lane F Phase 5; apps/marketing/services/numbers.py weekly_card). */
export interface SocialCard {
  week_start: string;
  planned: number;
  posted: number;
  reach: number;
  engagement: number;
  with_numbers: number;
  best: { id: number; slot_date: string; hook: string; post_type_label: string; reach: number | null; engagement: number | null } | null;
  numbers_due: number;
  spend_week: string;
  spend_month: string;
  read: {
    post_days: number;
    ticket_lift: string | null;
    sales_lift: string | null;
    top_type: { label: string; days: number; ticket_lift: string | null } | null;
    weeks: number;
  };
  /** The boost with the lowest cost per extra unit sold in its categories (Dash #182). */
  top_ad: {
    id: number; start: string; end: string | null; spent: string; label: string; watched: string;
    extra_units: number; cost_per_extra_unit: string;
  } | null;
  link: string;
}

export const fetchSocialCard = () => api.get<SocialCard>('/core/owner/social/').then((r) => r.data);

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

/** Owner page, Testing (owner 2026-11-24): what the owner's linked devices see on the website, for 24 hours. */
export type TestPick = '' | 'legacy' | 'new' | 'bf';
export interface TestOption { key: TestPick; label: string; what: string }
export interface OwnerTesting {
  /** The picks that are on now ('' = Live) and when they end (ISO; null when nothing is on). */
  state: { mobile: TestPick; desktop: TestPick; until: string | null };
  options: { mobile: TestOption[]; desktop: TestOption[] };
  /** What customers see today, in words. */
  live: { mobile: string; desktop: string };
  /** Opens on a device once to link it (an hour to use it); `unlink` takes the device off. */
  link: string;
  unlink: string;
  hours: number;
}

export const fetchOwnerTesting = () => api.get<OwnerTesting>('/core/owner/testing/').then((r) => r.data);
export const saveOwnerTesting = (body: { mobile?: TestPick; desktop?: TestPick; end?: boolean }) =>
  api.post<OwnerTesting>('/core/owner/testing/', body).then((r) => r.data);
