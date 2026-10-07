import type { ApplicationRow, Stage } from '../../api/hiring.api';

/** The hiring line, in order. Hired ends it; Not now sits off the line. */
export const ACTIVE_STAGES: Stage[] = ['new', 'reviewed', 'contacted', 'interview_scheduled', 'interviewed', 'offer'];
export const CLOSED_STAGES: Stage[] = ['hired', 'not_now'];

export type HintTone = 'plain' | 'now' | 'warn' | 'good' | 'bad';
export interface Hint {
  text: string;
  tone: HintTone;
}

const OFFER_HINT: Record<string, Hint> = {
  sent: { text: 'Sent', tone: 'plain' },
  viewed: { text: 'Opened', tone: 'plain' },
  signed: { text: 'Signed', tone: 'good' },
  declined: { text: 'Declined', tone: 'bad' },
  withdrawn: { text: 'Withdrawn', tone: 'plain' },
  expired: { text: 'Expired', tone: 'warn' },
};

/** Calendar days from ``a`` to ``b`` (local time; negative when ``b`` is earlier). */
function dayDiff(a: Date, b: Date): number {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}

/** Whole days since ``iso`` (0 = today). */
export function daysSince(iso: string | null | undefined, now: Date): number {
  return iso ? Math.max(0, dayDiff(new Date(iso), now)) : 0;
}

function sameDay(a: Date, b: Date): boolean {
  return dayDiff(a, b) === 0;
}

export function timeText(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "Today 2:00 PM", "Tomorrow 10:00 AM", "Thu 10:00 AM" (within a week) or "Oct 12". */
export function whenText(iso: string, now: Date): string {
  const d = new Date(iso);
  const ahead = dayDiff(now, d);
  if (ahead === 0) return `Today ${timeText(d)}`;
  if (ahead === 1) return `Tomorrow ${timeText(d)}`;
  if (ahead > 1 && ahead < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${timeText(d)}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** The short note beside a name on the timeline: when the interview is, where the offer stands, or how long they have waited. */
export function rowHint(row: ApplicationRow, now: Date): Hint {
  if (row.stage === 'interview_scheduled' && row.next_interview) {
    const d = new Date(row.next_interview);
    return { text: whenText(row.next_interview, now), tone: sameDay(d, now) ? 'now' : 'plain' };
  }
  if (row.stage === 'offer' && row.offer_status) return OFFER_HINT[row.offer_status] ?? { text: row.offer_status, tone: 'plain' };
  const since = row.stage_changed_at || row.created_at;
  if (row.stage === 'hired' || row.stage === 'not_now') {
    return { text: new Date(since).toLocaleDateString([], { month: 'short', day: 'numeric' }), tone: 'plain' };
  }
  const days = daysSince(since, now);
  const limit = row.stage === 'contacted' ? 5 : 3;
  return { text: days === 0 ? 'today' : `${days}d`, tone: days >= limit ? 'warn' : 'plain' };
}

/** Who to see first: the next interview first; everyone else waiting longest first; Hired and Not now newest first. */
export function sortForStage(stage: Stage, rows: ApplicationRow[]): ApplicationRow[] {
  const at = (r: ApplicationRow) => new Date(r.stage_changed_at || r.created_at).getTime();
  const copy = [...rows];
  if (stage === 'interview_scheduled') {
    const t = (r: ApplicationRow) => (r.next_interview ? new Date(r.next_interview).getTime() : Infinity);
    return copy.sort((a, b) => t(a) - t(b) || at(a) - at(b));
  }
  if (stage === 'hired' || stage === 'not_now') return copy.sort((a, b) => at(b) - at(a));
  return copy.sort((a, b) => at(a) - at(b));
}

/** Rows grouped by stage, each group sorted. */
export function groupByStage(rows: ApplicationRow[]): Partial<Record<Stage, ApplicationRow[]>> {
  const out: Partial<Record<Stage, ApplicationRow[]>> = {};
  for (const row of rows) (out[row.stage] ??= []).push(row);
  for (const stage of Object.keys(out) as Stage[]) out[stage] = sortForStage(stage, out[stage]!);
  return out;
}

/** Interviews today, earliest first. */
export function todaysInterviews(rows: ApplicationRow[], now: Date): ApplicationRow[] {
  return rows
    .filter((r) => r.stage === 'interview_scheduled' && r.next_interview && sameDay(new Date(r.next_interview), now))
    .sort((a, b) => new Date(a.next_interview!).getTime() - new Date(b.next_interview!).getTime());
}
