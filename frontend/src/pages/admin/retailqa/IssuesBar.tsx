import type { QaIssue, QaJob, QaStaffRow } from '../../../api/routines.api';
import { groupIssues } from './commandCenter';
import { QaIcon } from './QaIcons';

export function IssuesBar({
  issues,
  staff,
  jobs,
  onCallIn,
  onReassign,
  onNudge,
  onOpenCross,
  onDoSpot,
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
            return (
              <div className={`row${tone ? ` s-${tone}` : ''}`} key={row.id}>
                <span className="ic"><QaIcon name={row.icon} /></span>
                <span className="nowrap">{row.sentence}</span>
                {row.action === 'nudge' && row.run_id ? (
                  <span className="end">
                    {row.nudged_at ? <span className="nudged">Nudged {row.nudged_at}</span> : null}
                    <button type="button" className={`act always ${tone || 'warn'}`} onClick={(event) => onNudge(row.run_id as number, event.currentTarget)}>Nudge</button>
                  </span>
                ) : null}
                {row.action === 'call_in' && row.person_id ? (
                  <button type="button" className={`act always ${tone || 'warn'}`} onClick={() => onCallIn(row.person_id as number)}>Called in</button>
                ) : null}
                {row.action === 'reassign' ? (
                  <button type="button" className={`act always ${tone || 'warn'}`} onClick={onReassign}>Reassign</button>
                ) : null}
                {row.action === 'open_cross' ? (
                  <button type="button" className={`act always ${tone || 'warn'}`} onClick={onOpenCross}>Open</button>
                ) : null}
                {row.action === 'do_spot' ? (
                  <button type="button" className={`act always ${tone || 'warn'}`} onClick={onDoSpot}>Walk</button>
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
