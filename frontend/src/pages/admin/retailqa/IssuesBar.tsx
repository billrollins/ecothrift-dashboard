import type { QaIssue, QaJob, QaStaffRow } from '../../../api/routines.api';
import { groupIssues, nudgeLabel } from './commandCenter';
import { QaIcon } from './QaIcons';
import { RowActionMenu, type RowMenuItem } from './RowActionMenu';

export function IssuesBar({
  issues,
  staff,
  jobs,
  onCallIn,
  onReassign,
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
  onCallIn: (personId: number) => void;
  onReassign: () => void;
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
            const items = issueMenu(row, {
              onCallIn, onReassign, onNudge, onOpenCross, onDoSpot, onOpenShifts, onRemove,
            });
            return (
              <div className={`row${tone ? ` s-${tone}` : ''}`} key={row.id}>
                <span className="ic"><QaIcon name={row.icon} /></span>
                <span>
                  <span className="nowrap">{row.sentence}</span>
                  {nudgeLabel(row.nudged_at) ? <span className="nudged">{nudgeLabel(row.nudged_at)}</span> : null}
                </span>
                {items.length ? (
                  <RowActionMenu
                    label={items[0].label}
                    items={items}
                    tone={tone || 'warn'}
                    always
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

function issueMenu(
  row: ReturnType<typeof groupIssues>[number],
  handlers: {
    onCallIn: (personId: number) => void;
    onReassign: () => void;
    onNudge: (runId: number, el: HTMLElement) => void;
    onOpenCross: () => void;
    onDoSpot: () => void;
    onOpenShifts: () => void;
    onRemove: (personId: number) => void;
  },
): RowMenuItem[] {
  if (row.action === 'nudge' && row.run_id) {
    return [{ label: 'Nudge', onClick: () => handlers.onNudge(row.run_id as number, document.body) }];
  }
  if (row.action === 'call_in' && row.person_id) {
    const items: RowMenuItem[] = [
      { label: 'Called in', onClick: () => handlers.onCallIn(row.person_id as number) },
    ];
    if (row.run_id) items.push({ label: 'Nudge', onClick: () => handlers.onNudge(row.run_id as number, document.body) });
    items.push({ label: 'Remove from today', onClick: () => handlers.onRemove(row.person_id as number) });
    return items;
  }
  if (row.action === 'reassign') return [{ label: 'Reassign', onClick: handlers.onReassign }];
  if (row.action === 'open_cross') return [{ label: 'Open', onClick: handlers.onOpenCross }];
  if (row.action === 'do_spot') return [{ label: 'Walk', onClick: handlers.onDoSpot }];
  if (row.action === 'open_shifts') return [{ label: 'Open Shifts', onClick: handlers.onOpenShifts }];
  if (row.action === 'clear_call_in' && row.person_id) {
    return [{ label: 'Clear call-in', onClick: () => handlers.onCallIn(row.person_id as number) }];
  }
  return [];
}
