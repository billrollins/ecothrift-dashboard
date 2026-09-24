import { format, isBefore, isToday, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { MyRoutines, Routine, RoutineDraft, RoutineRun, RunNudge } from '../../api/routines.api';
import { t } from '../../i18n/routines';
import { runUrgency } from './runIsDue';

/**
 * The one model behind every staff routine surface: Today, the Today badge, the nag icon
 * and its drawer, the desk runner list, and the clock-out check. They all read `buildMyWork`
 * over the same `/routines/runs/mine/` payload, so numbers, words and colours always agree.
 *
 * Four states, one colour each (owner, 2026-09-24):
 * - `later` (grey): due today, reminder not reached yet.
 * - `soon`  (amber): soft nag, reminder reached ("Due 4:00 PM" / "By clock-out").
 * - `now`   (red): hard nag reached ("Due now").
 * - `late`  (red): past its deadline ("Late").
 *
 * Counts: the Today badge is **everything due today** (neutral). The nag icon is **everything
 * nagging** (soon + now + late), coloured by the worst. Coming-up runs (later days), drafts,
 * anytime routines and done work are shown but never counted.
 */
export type WorkState = 'later' | 'soon' | 'now' | 'late';
export type NagTone = 'none' | 'amber' | 'red';

export interface WorkItem {
  run: RoutineRun;
  state: WorkState;
  /** "Due 4:00 PM", "By clock-out", "Due now", "Late", or a day for coming-up runs. */
  label: string;
  started: boolean;
  /** "3/9" when a checklist is under way; null otherwise. */
  progress: string | null;
}

export interface WorkSection {
  key: 'doNow' | 'dueSoon' | 'laterToday';
  tone: 'red' | 'amber' | 'grey';
  items: WorkItem[];
}

export interface MyWork {
  owed: WorkItem[];
  /** Owed items grouped by colour: Do now (red), Due soon (amber), Later today (grey). Empty ones left out. */
  sections: WorkSection[];
  comingUp: WorkItem[];
  doneToday: RoutineRun[];
  drafts: RoutineDraft[];
  anytime: Routine[];
  /** Everything due today. The Today badge. */
  count: number;
  /** Everything nagging (soon, now, late). The nag icon. */
  nagCount: number;
  /** Colour of the worst nag: red for a hard nag or late, amber for soft only. */
  nagTone: NagTone;
  /** What to do first: the worst item, or the shift's checklist when nothing is red. */
  next: WorkItem | null;
}

const STATE_RANK: Record<WorkState, number> = { late: 0, now: 1, soon: 2, later: 3 };

function locale(lang: string) {
  return lang === 'es' ? es : undefined;
}

function clock(iso: string, lang: string): string {
  return format(parseISO(iso), 'h:mm a', { locale: locale(lang) });
}

/** The state from the clock alone: what the label says ("Due 4:00 PM", "Due now", "Late"). */
export function dueState(run: RoutineRun, now: Date = new Date()): WorkState {
  const urgency = runUrgency(run, now);
  if (urgency === 'late') return 'late';
  if (urgency === 'hard') return 'now';
  if (urgency === 'soft') return 'soon';
  return 'later';
}

/**
 * The state that sets colour, section and counts. A nudge is a nag someone escalated (a
 * manager, or the app at a hard deadline), so a nudged run is red until it is done, even
 * after the person pressed Heard. Its label still says when it is really due.
 */
export function workState(run: RoutineRun, now: Date = new Date()): WorkState {
  const state = dueState(run, now);
  return run.nudge && (state === 'later' || state === 'soon') ? 'now' : state;
}

/** "Nudged by Carrie 2:10 PM", or "Nudged 2:10 PM" when the app sent it. */
export function nudgeNote(nudge: RunNudge, lang: string): string {
  const at = clock(nudge.at, lang);
  return nudge.by ? `${t('nudgedBy', lang)} ${nudge.by} ${at}` : `${t('nudged', lang)} ${at}`;
}

export function isNagging(state: WorkState): boolean {
  return state !== 'later';
}

export function workLabel(run: RoutineRun, state: WorkState, lang: string, comingUp = false): string {
  if (state === 'late') return t('late', lang);
  if (state === 'now') return t('dueNow', lang);
  const at = run.nag_at ?? null;
  if (comingUp) {
    const when = parseISO(at ?? run.due_at);
    const day = format(when, 'EEE', { locale: locale(lang) });
    return at ? `${t('dueAt', lang)} ${day} ${clock(at, lang)}` : `${day} · ${t('byClockOutCap', lang)}`;
  }
  return at ? `${t('dueAt', lang)} ${clock(at, lang)}` : t('byClockOutCap', lang);
}

function toItem(run: RoutineRun, lang: string, now: Date, comingUp: boolean): WorkItem {
  const state = workState(run, now);
  const answered = run.progress?.answered ?? 0;
  const total = run.progress?.total ?? 0;
  return {
    run,
    state,
    label: workLabel(run, dueState(run, now), lang, comingUp),
    started: answered > 0,
    progress: answered > 0 && total > 0 ? `${answered}/${total}` : null,
  };
}

function dueMs(run: RoutineRun): number {
  return parseISO(run.nag_at ?? run.late_at ?? run.due_at).getTime();
}

/** Late, due now, due soon, later; required (blocking) runs lead within a state; then by time. */
export function compareWork(a: WorkItem, b: WorkItem): number {
  return STATE_RANK[a.state] - STATE_RANK[b.state]
    || Number(b.run.is_blocking) - Number(a.run.is_blocking)
    || dueMs(a.run) - dueMs(b.run)
    || a.run.id - b.run.id;
}

export function isOwedToday(run: RoutineRun, state: WorkState, now: Date = new Date()): boolean {
  if (state === 'late' || state === 'now') return true;
  const due = parseISO(run.nag_at ?? run.due_at);
  return isToday(due) || isBefore(due, startOfDay(now));
}

export function buildMyWork(
  data: MyRoutines | undefined,
  lang: string,
  now: Date = new Date(),
): MyWork {
  const open = (data?.open ?? []).filter((run) => run.status === 'open');
  const owed: WorkItem[] = [];
  const comingUp: WorkItem[] = [];
  for (const run of open) {
    const state = workState(run, now);
    if (isOwedToday(run, state, now)) owed.push(toItem(run, lang, now, false));
    else comingUp.push(toItem(run, lang, now, true));
  }
  owed.sort(compareWork);
  comingUp.sort(compareWork);
  const sections: WorkSection[] = ([
    { key: 'doNow', tone: 'red', items: owed.filter((item) => item.state === 'late' || item.state === 'now') },
    { key: 'dueSoon', tone: 'amber', items: owed.filter((item) => item.state === 'soon') },
    { key: 'laterToday', tone: 'grey', items: owed.filter((item) => item.state === 'later') },
  ] as WorkSection[]).filter((section) => section.items.length > 0);
  const doneToday = (data?.done ?? []).filter(
    (run) => run.status === 'done' && run.completed_at && isToday(parseISO(run.completed_at)),
  );
  const nagging = owed.filter((item) => isNagging(item.state));
  const nagTone: NagTone = nagging.some((item) => item.state === 'late' || item.state === 'now')
    ? 'red'
    : nagging.length ? 'amber' : 'none';
  const startId = data?.start_with_id ?? null;
  // The most urgent item leads. Within that same colour group, the shift's own checklist
  // (the server's pick) goes first, so Next up never sits below something more urgent.
  const first = owed[0] ?? null;
  const startItem = owed.find((item) => item.run.id === startId) ?? null;
  const red = first !== null && (first.state === 'late' || first.state === 'now');
  const next = first && !red && startItem && startItem.state === first.state ? startItem : first;
  return {
    owed,
    sections,
    comingUp,
    doneToday,
    drafts: data?.drafts ?? [],
    anytime: data?.on_demand ?? [],
    count: owed.length,
    nagCount: nagging.length,
    nagTone,
    next,
  };
}

/** Button text for a run: one word, same everywhere. */
export function workAction(item: WorkItem, lang: string): string {
  return item.started ? t('continue', lang) : t('start', lang);
}
