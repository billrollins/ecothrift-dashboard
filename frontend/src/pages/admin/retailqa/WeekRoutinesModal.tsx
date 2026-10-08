import { addDays, format, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import type { QaResolveKind, RoutineRun } from '../../../api/routines.api';
import { useQaRoutines } from '../../../hooks/useRetailQa';
import { weekMonday } from '../routines/gradeWeek';
import { CHECKLISTS_LABEL, displayName, missReasonText, shortName } from './commandCenter';
import { qaStatusWord } from './qaStatus';
import { ItemsMenu } from './ItemsMenu';
import { BoardDialog } from './SummaryDialogs';

/** Who cleared a run, when the owner marked it done or forgave it. */
function resolvedOf(run: RoutineRun | undefined): { kind: string; by_name?: string } | null {
  const info = (run?.generated as { resolved?: { kind?: string; by_name?: string } } | undefined)?.resolved;
  return info?.kind ? { kind: info.kind, by_name: info.by_name } : null;
}

export function WeekRoutinesModal({
  open,
  onClose,
  week,
  onResolve,
}: {
  open: boolean;
  onClose: () => void;
  week: string;
  /** Superusers only: mark done or forgive a missed or past-due run. */
  onResolve?: (runId: number, kind: QaResolveKind) => void;
}) {
  const [menu, setMenu] = useState<{ runId: number; anchor: HTMLElement } | null>(null);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [person, setPerson] = useState('');
  const query = useQaRoutines({ week, type: kind || undefined, status: status || undefined });
  const monday = weekMonday(week);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const rows = (query.data?.routines ?? []).filter((row) => {
    if (!person) return true;
    return String(row.assigned_to) === person || String(row.completed_by) === person;
  });
  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of query.data?.routines ?? []) {
      if (row.assigned_to && row.assigned_to_name) map.set(String(row.assigned_to), row.assigned_to_name);
      if (row.completed_by && row.completed_by_name) map.set(String(row.completed_by), row.completed_by_name);
    }
    return [...map.entries()];
  }, [query.data]);
  const grouped = useMemo(() => {
    const map = new Map<string, RoutineRun[]>();
    for (const row of rows) {
      const key = `${row.system_key || row.kind}:${row.title}:${row.section_name || ''}`;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <BoardDialog open={open} onClose={onClose} title="Routines this week">
      <div className="week-filters">
        <label>
          Type
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="">All</option>
            <option value="checklist">{CHECKLISTS_LABEL}</option>
            <option value="section_tally">Tally</option>
            <option value="section_audit">Cross-check</option>
            <option value="owner_spot">Spot walk</option>
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="done">Done</option>
            <option value="missed">Missed</option>
          </select>
        </label>
        <label>
          Person
          <select value={person} onChange={(event) => setPerson(event.target.value)}>
            <option value="">All</option>
            {people.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      <table className="cc-dialog-table week-grid">
        <thead>
          <tr>
            <th>Routine</th>
            {days.map((day) => (
              <th key={day.toISOString()}>{format(day, 'EEE d')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grouped.map(([key, runs]) => (
            <tr key={key}>
              <td>{displayName(runs[0].title, 'routine')}{runs[0].section_name ? ` · ${runs[0].section_name}` : ''}</td>
              {days.map((day) => {
                const iso = format(day, 'yyyy-MM-dd');
                const run = runs.find((row) => row.period_key === iso);
                const word = run ? qaStatusWord(run.status) : '';
                const cleared = resolvedOf(run);
                const dot = cleared?.kind === 'forgiven' ? 'forgiven' : word === 'Done' ? 'ok' : word === 'Missed' ? 'miss' : word ? 'due' : '';
                const who = run?.completed_by_name || run?.assigned_to_name || '';
                const why = word === 'Missed' ? missReasonText(run) : '';
                const tip = cleared
                  ? `${cleared.kind === 'forgiven' ? 'Forgiven' : 'Marked done'}${cleared.by_name ? ` by ${shortName(cleared.by_name)}` : ''}`
                  : run
                    ? `${word}${run.completed_at ? ` ${format(parseISO(run.completed_at), 'HH:mm')}` : ''}${who ? ` by ${shortName(who)}` : ''}${why ? ` · ${why}` : ''}`
                    : '';
                // Owner, 2026-10-08: any missed or past-due routine can be marked done or forgiven.
                const clearable = Boolean(
                  onResolve && run && run.status !== 'done' && Date.parse(run.due_at) <= Date.now(),
                );
                return (
                  <td key={iso} title={tip}>
                    {clearable && run ? (
                      <button
                        type="button"
                        className="dot-btn"
                        aria-label={`Clear ${run.title} on ${format(day, 'EEE d')}`}
                        onClick={(event) => setMenu({ runId: run.id, anchor: event.currentTarget })}
                      >
                        <i className={`dot ${dot}`} />
                      </button>
                    ) : dot ? <i className={`dot ${dot}`} /> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ItemsMenu
        anchor={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
        items={menu && onResolve ? [
          { label: 'Mark done', onClick: () => onResolve(menu.runId, 'done') },
          { label: 'Forgive', onClick: () => onResolve(menu.runId, 'forgiven') },
        ] : []}
      />
    </BoardDialog>
  );
}
