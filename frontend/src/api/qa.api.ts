import api from './client';

export interface QaFinding {
  check_id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  stage: string;
  handling: string;
  count: number;
  previous: number | null;
  delta: number | null;
  sample: Record<string, unknown>[];
  error: string;
  fix_kind: string;
}

export interface QaRun {
  id: number;
  started_at: string;
  finished_at: string | null;
  error: string;
  triage: { headline?: string; notes?: { check_id: string; verdict: string; note: string }[]; error?: string };
  triage_model: string;
  findings: QaFinding[];
}

/** The latest nightly QA run (data_platform Phase 3). Superuser only. */
export async function fetchQaLatest(): Promise<{ run: QaRun | null; running: boolean }> {
  const { data } = await api.get<{ run: QaRun | null; running: boolean }>('/qa/latest/');
  return data;
}

export async function fetchQaHistory(checkId: string): Promise<{ day: string; count: number }[]> {
  const { data } = await api.get<{ day: string; count: number }[]>(`/qa/history/${encodeURIComponent(checkId)}/`);
  return data;
}

export async function runQaNow(): Promise<{ started: boolean }> {
  const { data } = await api.post<{ started: boolean }>('/qa/run/');
  return data;
}
