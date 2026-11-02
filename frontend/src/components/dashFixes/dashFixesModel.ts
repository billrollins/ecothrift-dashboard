import { t } from '../../i18n/routines';
import type { DashFixDTO, DashFixKind } from '../../types/dashFixes.types';

export const DASH_FIXES_PATH = '/dash-fixes';
export const VISIBLE_DONE = 10;

export interface DashFixSections {
  /** Working first, then accepted by rank. */
  line: DashFixDTO[];
  /** New items: the owner sees all, staff see their own. */
  waiting: DashFixDTO[];
  /** Recent first. */
  done: DashFixDTO[];
  declined: DashFixDTO[];
  hold: DashFixDTO[];
}

export function sortLine(rows: DashFixDTO[]): DashFixDTO[] {
  return rows
    .filter((row) => row.status === 'working' || row.status === 'almost' || row.status === 'accepted')
    .sort((a, b) => {
      const aw = a.status === 'accepted' ? 1 : 0;
      const bw = b.status === 'accepted' ? 1 : 0;
      return aw - bw || a.rank - b.rank || a.id - b.id;
    });
}

export function sectionsFor(rows: DashFixDTO[]): DashFixSections {
  const recentFirst = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');
  return {
    line: sortLine(rows),
    waiting: rows
      .filter((row) => row.status === 'new')
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    done: rows
      .filter((row) => row.status === 'done')
      .sort((a, b) => recentFirst(a.done_at ?? a.status_changed_at, b.done_at ?? b.status_changed_at)),
    hold: rows.filter((row) => row.status === 'hold').sort((a, b) => a.id - b.id),
    declined: rows
      .filter((row) => row.status === 'declined')
      .sort((a, b) => recentFirst(a.status_changed_at, b.status_changed_at)),
  };
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function statusLabel(row: DashFixDTO, lang: string): string {
  switch (row.status) {
    case 'new':
      return t('fxChipWaiting', lang);
    case 'accepted':
      return t('fxChipInLine', lang);
    case 'working':
      return t('fxChipWorking', lang);
    case 'almost':
      return row.waiting_on
        ? `${t('fxChipAlmost', lang)} · ${t('fxWaitingOn', lang)} ${row.waiting_on}`
        : t('fxChipAlmost', lang);
    case 'hold':
      return t('fxChipHold', lang);
    case 'done': {
      const when = formatShortDate(row.done_at);
      const version = row.done_version ? ` ${row.done_version}` : '';
      return `${t('fxChipDone', lang)}${version}${when ? ` · ${when}` : ''}`;
    }
    case 'declined':
      return row.decline_reason
        ? `${t('fxChipNotDoing', lang)}: ${row.decline_reason}`
        : t('fxChipNotDoing', lang);
  }
}

export function kindLabel(kind: DashFixKind, lang: string): string {
  return t(`fxKind_${kind}`, lang);
}

export type ChipTone = 'info' | 'warn' | 'good' | 'muted';

export function statusTone(row: DashFixDTO): ChipTone {
  switch (row.status) {
    case 'new': return 'warn';
    case 'accepted': return 'info';
    case 'working': return 'good';
    case 'almost': return 'good';
    case 'hold': return 'muted';
    case 'done': return 'good';
    case 'declined': return 'muted';
  }
}

/** "2.240.0" or "v2.240.0" both read "v2.240.0". */
export function versionLabel(version: string | undefined | null): string {
  const raw = (version ?? '').trim();
  if (!raw) return '';
  return raw.toLowerCase().startsWith('v') ? raw : `v${raw}`;
}

/** Moves one line item up or down and returns the new id order. */
export function moveInLine(line: DashFixDTO[], id: number, delta: -1 | 1): number[] {
  const ids = line.map((row) => row.id);
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}

export interface LineGroup {
  /** Project name, or '' for a task with no project (it stands alone). */
  project: string;
  items: DashFixDTO[];
}

/** Tasks of one project sit together in step order; projects are ordered by their best rank. */
export function groupLine(line: DashFixDTO[]): LineGroup[] {
  const groups = new Map<string, LineGroup>();
  for (const row of line) {
    const key = row.project ? `p:${row.project}` : `t:${row.id}`;
    const group = groups.get(key) ?? { project: row.project, items: [] };
    group.items.push(row);
    groups.set(key, group);
  }
  const best = (group: LineGroup) => Math.min(...group.items.map((row) => row.rank || Number.MAX_SAFE_INTEGER));
  const result = [...groups.values()].sort((a, b) => best(a) - best(b));
  for (const group of result) {
    group.items.sort((a, b) => (a.step ?? 9999) - (b.step ?? 9999) || a.rank - b.rank || a.id - b.id);
  }
  return result;
}

/** "Navigation redesign · step 2 of 4" (empty when the task has no project). */
export function projectLabel(row: DashFixDTO, all: DashFixDTO[], lang: string): string {
  if (!row.project) return '';
  const total = all.filter((other) => other.project === row.project && other.status !== 'declined').length;
  const step = row.step ? ` · ${t('fxStep', lang)} ${row.step} ${t('fxOf', lang)} ${total}` : '';
  return `${row.project}${step}`;
}

/** Items this one still waits on (not done), as "after #3". Hidden or unknown ones are left out. */
export function waitingOn(row: DashFixDTO, byId: Map<number, DashFixDTO>): DashFixDTO[] {
  return row.depends_on
    .map((id) => byId.get(id))
    .filter((dep): dep is DashFixDTO => Boolean(dep) && dep!.status !== 'done');
}

/** Next up: the first task in rank order whose dependencies are all done. */
export function nextUpId(line: DashFixDTO[], byId: Map<number, DashFixDTO>): number | null {
  const ordered = [...line].sort((a, b) => a.rank - b.rank || a.id - b.id);
  const next = ordered.find((row) => waitingOn(row, byId).length === 0);
  return next ? next.id : null;
}

/** The coder asked the owner something and he has not answered yet (owner only: staff never get the field). */
export function needsAnswer(row: DashFixDTO): boolean {
  return Boolean(row.question_for_owner) && !row.owner_answer && row.status !== 'done' && row.status !== 'declined';
}
