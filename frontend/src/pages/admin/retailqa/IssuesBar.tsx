import { useState } from 'react';
import type { QaIssue, QaJob, QaStaffRow } from '../../../api/routines.api';
import { groupIssues, nudgeLabel, type BoardIssue } from './commandCenter';
import { ItemsMenu, type RowMenuItem } from './ItemsMenu';
import { QaIcon } from './QaIcons';

export function IssuesBar({
  issues,
  staff,
  jobs,
  workers,
  onCallIn,
  onAssign,
  onUnblock,
  onNudge,
  onOpenCross,
  onDoSpot,
  onOpenShifts,
  onRemove,
  closedLabel,
}: {
  issues: QaIssue[];
  staff: QaStaffRow[];
  jobs: QaJob[];
  workers: Array<{ id: number; name: string }>;
  onCallIn: (personId: number) => void;
  onAssign: (row: BoardIssue, userId: number) => void;
  onUnblock: (runId: number) => void;
  onNudge: (runId: number, el: HTMLElement) => void;
  onOpenCross: () => void;
  onDoSpot: () => void;
  onOpenShifts: () => void;
  onRemove: (personId: number) => void;
  closedLabel?: string | null;
}) {
  const rows = groupIssues(issues, staff, jobs);
  const red = rows.some((row) => row.severity === 'red');
  return (
    <section className="card issues">
      <h2>
        Needs your attention
        {!closedLabel && rows.length ? <span className={`pill${red ? '' : ' warn'}`}>{rows.length}</span> : null}
      </h2>
      {closedLabel ? <div className="empty-closed">{closedLabel}</div> : rows.length ? (
        <div className="scroll rows">
          {rows.map((row) => {
            const tone = row.severity === 'red' ? 'bad' : row.severity === 'amber' ? 'warn' : '';
            const menu = issueMenu(row, workers, {
              onCallIn, onAssign, onUnblock, onNudge, onOpenCross, onDoSpot, onOpenShifts, onRemove,
            });
            return (
              <div className={`row${tone ? ` s-${tone}` : ''}`} key={row.id}>
                <span className="ic"><QaIcon name={row.icon} /></span>
                <span>
                  <span className="nowrap">{row.sentence}</span>
                  {nudgeLabel(row.nudged_at) ? <span className="nudged">{nudgeLabel(row.nudged_at)}</span> : null}
                </span>
                {menu ? (
                  <IssueAction
                    label={menu.label}
                    items={menu.items}
                    tone={tone || 'warn'}
                    title={nudgeLabel(row.nudged_at) || undefined}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty"><QaIcon name="check" />Nothing needs attention right now.</div>
      )}
    </section>
  );
}

function IssueAction({
  label,
  items,
  tone,
  title,
}: {
  label: string;
  items: RowMenuItem[];
  tone?: string;
  title?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        className={`act always ${tone || ''}`.trim()}
        title={title}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(event.currentTarget);
        }}
      >
        {label}
      </button>
      <ItemsMenu anchor={anchor} onClose={() => setAnchor(null)} items={items} />
    </>
  );
}

function issueMenu(
  row: BoardIssue,
  workers: Array<{ id: number; name: string }>,
  handlers: {
    onCallIn: (personId: number) => void;
    onAssign: (row: BoardIssue, userId: number) => void;
    onUnblock: (runId: number) => void;
    onNudge: (runId: number, el: HTMLElement) => void;
    onOpenCross: () => void;
    onDoSpot: () => void;
    onOpenShifts: () => void;
    onRemove: (personId: number) => void;
  },
): { label: string; items: RowMenuItem[] } | null {
  if ((row.action === 'nudge' || row.action === 're_nudge') && row.run_id) {
    if (/^Resolved\b/i.test(nudgeLabel(row.nudged_at))) {
      return null;
    }
    return {
      label: row.action === 're_nudge' ? 'Re-nudge' : 'Nudge',
      items: [{
        label: row.action === 're_nudge' ? 'Re-nudge' : 'Nudge',
        onClick: () => handlers.onNudge(row.run_id as number, document.body),
      }],
    };
  }
  if (row.action === 'call_in' && row.person_id) {
    const items: RowMenuItem[] = [
      { label: 'Called in', onClick: () => handlers.onCallIn(row.person_id as number) },
    ];
    if (row.run_id) items.push({ label: 'Nudge', onClick: () => handlers.onNudge(row.run_id as number, document.body) });
    items.push({ label: 'Remove from today', onClick: () => handlers.onRemove(row.person_id as number) });
    return { label: 'Called in', items };
  }
  if (row.action === 'reassign') {
    const people = workers.filter((person) => person.id !== row.exclude_user_id);
    const items = people.length
      ? people.map((person) => ({
        label: person.name,
        onClick: () => handlers.onAssign(row, person.id),
      }))
      : [{ label: 'No one is in', onClick: () => undefined }];
    if (row.blocked && row.run_id) {
      items.push({ label: 'Unblock', onClick: () => handlers.onUnblock(row.run_id as number) });
    }
    return { label: 'Reassign', items };
  }
  if (row.action === 'unblock' && row.run_id) {
    return {
      label: 'Unblock',
      items: [{ label: 'Unblock', onClick: () => handlers.onUnblock(row.run_id as number) }],
    };
  }
  if (row.action === 'open_cross') return { label: 'Open', items: [{ label: 'Open', onClick: handlers.onOpenCross }] };
  if (row.action === 'do_spot') return { label: 'Walk', items: [{ label: 'Walk', onClick: handlers.onDoSpot }] };
  if (row.action === 'open_shifts') return { label: 'Open Shifts', items: [{ label: 'Open Shifts', onClick: handlers.onOpenShifts }] };
  if (row.action === 'clear_call_in' && row.person_id) {
    return { label: 'Clear call-in', items: [{ label: 'Clear call-in', onClick: () => handlers.onCallIn(row.person_id as number) }] };
  }
  return null;
}
