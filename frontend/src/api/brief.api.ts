import api from './client';

export interface DailyBriefBody {
  headline?: string;
  needs_you?: string[];
  numbers?: string[];
  watch?: string[];
}

export interface DailyBriefPayload {
  day: string;
  brief: { status: 'writing' | 'ready' | 'failed'; body: DailyBriefBody; model_used: string; error: string; finished_at: string | null } | null;
  writing: boolean;
  snapshot: Record<string, unknown> | null;
  days: string[];
}

/** The AI supervisor's brief. No day = yesterday (and it starts writing if there is none yet). */
export async function fetchDailyBrief(day?: string): Promise<DailyBriefPayload> {
  const { data } = await api.get<DailyBriefPayload>('/core/brief/', { params: day ? { day } : {} });
  return data;
}

export async function writeDailyBrief(day?: string): Promise<DailyBriefPayload> {
  const { data } = await api.post<DailyBriefPayload>('/core/brief/write/', day ? { day } : {});
  return data;
}
