import api from './client';

export type ScanResultKind = 'ok' | 'already' | 'odd' | 'unknown';

export interface CountSummary {
  id: number;
  name: string;
  status: 'open' | 'closed';
  note: string;
  started_at: string;
  closed_at: string | null;
  expected: number;
  counted: number;
  already: number;
  odd: number;
  unknown: number;
  scans: number;
}

export interface ScanPost {
  client_id: string;
  code: string;
  seq: number;
  scanned_at: string;
}

export interface ScanResult {
  client_id: string;
  code: string;
  result: ScanResultKind;
  item_status: string;
  title: string;
  price: string | null;
  location: string;
}

export interface MissingRow {
  sku: string;
  title: string;
  location: string;
  price: string;
  retail: string | null;
  cost: string | null;
  listed_at: string | null;
  status: string;
}

export interface CountReport extends CountSummary {
  missing_count: number;
  missing_price_total: string;
  missing_retail_total: string;
  missing_cost_total: string;
  shrink_pct: number;
  missing: MissingRow[];
  sold_meanwhile: MissingRow[];
  odd_items: { sku: string; title: string; status: string; location: string }[];
  unknown_codes: string[];
}

export async function listCounts(): Promise<CountSummary[]> {
  const { data } = await api.get<CountSummary[]>('/stocktake/counts/');
  return data;
}

export async function startCount(name = ''): Promise<CountSummary> {
  const { data } = await api.post<CountSummary>('/stocktake/counts/', { name });
  return data;
}

export async function getCount(id: number): Promise<CountSummary> {
  const { data } = await api.get<CountSummary>(`/stocktake/counts/${id}/`);
  return data;
}

/** Send a batch of scans. Safe to retry: the server remembers each client_id. */
export async function postScans(
  id: number,
  scans: ScanPost[],
): Promise<{ results: ScanResult[]; summary: CountSummary }> {
  const { data } = await api.post<{ results: ScanResult[]; summary: CountSummary }>(
    `/stocktake/counts/${id}/scans/`,
    { scans },
    { timeout: 15000 },
  );
  return data;
}

export async function closeCount(id: number): Promise<CountSummary> {
  const { data } = await api.post<CountSummary>(`/stocktake/counts/${id}/close/`);
  return data;
}

export async function getCountReport(id: number): Promise<CountReport> {
  const { data } = await api.get<CountReport>(`/stocktake/counts/${id}/report/`);
  return data;
}

export function countReportCsvUrl(id: number): string {
  return `/api/stocktake/counts/${id}/report.csv`;
}
